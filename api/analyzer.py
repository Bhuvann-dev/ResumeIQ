"""The AI analysis engine.

Isolated behind this module so the model or prompt can change without touching
the API layer (see docs/decisions.md ADR-005). Returns a validated
AnalysisResult — the model is forced to produce exactly that schema.
"""

import os

import anthropic

from models import AnalysisResult

MODEL = "claude-opus-4-8"
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


def analyze(resume_text: str, job_description: str | None = None) -> AnalysisResult:
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment

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

    response = client.messages.parse(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
        output_format=AnalysisResult,
    )
    return response.parsed_output


def api_key_configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))
