"""The AI analysis engine.

Isolated behind this module so the model or provider can change without
touching the API layer (see docs/decisions.md ADR-005). Uses OpenAI's
structured outputs so the model is forced to return exactly the
AnalysisResult schema — no fragile text parsing.
"""

import os

from openai import OpenAI

from models import AnalysisResult

# Configurable so you can change the model without a code edit. Confirm the
# exact model id on https://platform.openai.com/docs/models before deploying —
# an unknown id returns a model-not-found error.
MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.5")
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
    client = OpenAI()  # reads OPENAI_API_KEY from the environment

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
        max_completion_tokens=MAX_TOKENS,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format=AnalysisResult,
    )

    message = completion.choices[0].message
    if message.refusal:
        raise RuntimeError(f"Model declined to analyze: {message.refusal}")
    if message.parsed is None:
        raise RuntimeError("Model returned no structured output.")
    return message.parsed


def api_key_configured() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))
