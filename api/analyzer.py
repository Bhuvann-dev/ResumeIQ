"""The AI analysis engine.

Isolated behind this module so the model or provider can change without
touching the API layer (see docs/decisions.md ADR-005). Uses the OpenAI SDK
with structured outputs, but the endpoint is configurable — set
OPENAI_BASE_URL to point at any OpenAI-compatible server (e.g. Ollama) so you
can develop locally for free and deploy on OpenAI unchanged.
"""

import os

from openai import OpenAI

from models import AnalysisResult, ImproveResult

# Model id. For OpenAI, gpt-4o-2024-08-06 supports Structured Outputs.
# For Ollama, set this to a local model, e.g. "llama3.1".
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-2024-08-06")

# Optional OpenAI-compatible endpoint. Leave unset for OpenAI itself; set to
# http://localhost:11434/v1 for a local Ollama server.
BASE_URL = os.environ.get("OPENAI_BASE_URL") or None

MAX_TOKENS = 8000

SYSTEM_PROMPT = """\
You are an expert ATS (Applicant Tracking System) analyst and career coach who \
helps freshers (0-2 years experience) get past automated resume filters and \
land interviews.

Analyze the resume against documented ATS best practices and score it 0-100 on \
ATS readiness. Be specific and actionable — every issue must tell the fresher \
what is wrong, why it matters for ATS, and how to fix it. Never invent \
experience the candidate does not have.

Score across these dimensions:
- format: is it machine-readable? Penalize tables, multi-column layouts, images, \
  headers/footers, and uncommon fonts that break ATS parsing.
- keywords: does it contain the skills and terms a recruiter/ATS would search for? \
  If a job description is provided, measure coverage against it.
- content: strong action verbs, quantified impact (metrics), no fluff/buzzwords, \
  appropriate length (ideally one page for a fresher).
- structure: standard sections present (Contact, Summary, Skills, Experience, \
  Projects, Education) in a sensible order.

Categorize each issue as:
- critical: will likely cause ATS rejection or is a major red flag.
- warning: meaningfully hurts the resume but is not fatal.
- suggestion: a polish/improvement opportunity.

Keep the overall summary to one or two encouraging but honest sentences.\
"""


def _client() -> OpenAI:
    # A real key for OpenAI; any non-empty placeholder works for a local
    # Ollama endpoint, which ignores it.
    api_key = os.environ.get("OPENAI_API_KEY") or ("ollama" if BASE_URL else None)
    return OpenAI(base_url=BASE_URL, api_key=api_key)


def analyze(resume_text: str, job_description: str | None = None) -> AnalysisResult:
    client = _client()

    user_content = f"Here is the resume to analyze:\n\n---\n{resume_text}\n---"
    if job_description:
        user_content += (
            "\n\nThe fresher is targeting this job. Compute jd_match_percent and "
            f"missing_keywords against it:\n\n---\n{job_description}\n---"
        )
    else:
        user_content += (
            "\n\nNo job description was provided — leave jd_match_percent null and "
            "missing_keywords empty, and infer the likely target role."
        )

    completion = client.chat.completions.parse(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        temperature=0,  # deterministic: same resume -> same score/issues
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format=AnalysisResult,
    )

    message = completion.choices[0].message
    if message.refusal:
        raise RuntimeError(f"Model declined to analyze: {message.refusal}")
    if message.parsed is not None:
        return message.parsed
    # Fallback: some OpenAI-compatible servers (e.g. certain Ollama models)
    # return schema-valid JSON in `content` without the strict-parse path.
    if message.content:
        return AnalysisResult.model_validate_json(message.content)
    raise RuntimeError("Model returned no structured output.")


IMPROVE_SYSTEM_PROMPT = """\
You are an expert resume writer who rewrites freshers' resumes to pass ATS \
filters and impress recruiters.

Rewrite the given resume into a clean, ATS-friendly version. Rules:
- Keep it truthful — use ONLY facts present in the original. Never invent \
  employers, dates, metrics, or skills.
- Single-column, standard sections in this order when the content exists: \
  Contact, Summary, Skills, Experience, Projects, Education, Certifications.
- Start bullets with strong action verbs; make impact concrete where the \
  original already implies it (do not fabricate numbers).
- Remove buzzwords, fluff, and anything that breaks ATS parsing.
- If a job description is provided, naturally incorporate its relevant keywords \
  ONLY where they truthfully apply to the candidate.

Output the COMPLETE rewritten resume — every section, every bullet, not a \
summary or an outline. Use exactly this markdown format:
- ONE `# ` line: the full name. (Never use `##`, `###`, or `####` for the name.)
- `## ` for each section heading.
- `- ` for every bullet. Do not use `*`, `•`, or any other bullet character.
- Plain text for the contact line and any prose.

Example shape:

# Jane Doe
jane@example.com | +1 555 0100 | github.com/jane

## Summary
One or two lines.

## Skills
- Python
- React

## Experience
### Software Intern, Acme (2023)
- Did X that resulted in Y.

Output ONLY the resume in the format above — no preamble, no commentary, no \
code fences. Include every section the original has; never stop after the \
summary.\
"""


def _strip_code_fence(text: str) -> str:
    """Remove a wrapping ```...``` fence if the model added one."""
    t = text.strip()
    if t.startswith("```"):
        lines = t.splitlines()[1:]  # drop opening fence (``` or ```markdown)
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    return t


def improve(resume_text: str, job_description: str | None = None) -> ImproveResult:
    client = _client()

    user_content = f"Rewrite this resume in full:\n\n---\n{resume_text}\n---"
    if job_description:
        user_content += (
            "\n\nTailor it (truthfully) toward this job description:\n\n"
            f"---\n{job_description}\n---"
        )

    # Plain completion (not structured JSON): small local models complete a long
    # rewrite far more reliably as free-form markdown than inside a JSON field.
    completion = client.chat.completions.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        temperature=0,
        messages=[
            {"role": "system", "content": IMPROVE_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )

    message = completion.choices[0].message
    if getattr(message, "refusal", None):
        raise RuntimeError(f"Model declined to rewrite: {message.refusal}")
    markdown = _strip_code_fence(message.content or "")
    if not markdown:
        raise RuntimeError("Model returned no content.")
    return ImproveResult(improved_markdown=markdown, key_changes=[])


def ai_configured() -> bool:
    """True when we can reach a model: a real OpenAI key, or a custom endpoint
    (Ollama) that needs no key."""
    return bool(os.environ.get("OPENAI_API_KEY") or BASE_URL)
