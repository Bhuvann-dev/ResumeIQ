"""ResumeIQ API — MVP vertical slice.

Synchronous upload -> parse -> AI analysis. No database, queue, or file storage
yet (deliberate for the slice — see docs/architecture.md). Resume bytes are held
in memory only for the duration of the request and never written to disk.
"""

import os

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import analyzer
from models import AnalysisResult
from parser import ParseError, extract_text

MAX_BYTES = 5 * 1024 * 1024  # 5 MB

app = FastAPI(title="ResumeIQ API", version="0.1.0")

# Allow the frontend origin(s). Comma-separated list in CORS_ORIGINS, or "*".
_origins = os.environ.get("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _origins == "*" else [o.strip() for o in _origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "ai_configured": analyzer.api_key_configured()}


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_resume(
    file: UploadFile = File(...),
    job_description: str | None = Form(default=None),
) -> AnalysisResult:
    data = await file.read()

    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 5 MB limit.")

    try:
        resume_text = extract_text(data, file.content_type or "", file.filename or "")
    except ParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not analyzer.api_key_configured():
        raise HTTPException(
            status_code=503,
            detail="AI is not configured on the server (missing OPENAI_API_KEY).",
        )

    jd = (job_description or "").strip() or None
    try:
        return analyzer.analyze(resume_text, jd)
    except Exception as exc:  # surface AI/provider failures as 502
        raise HTTPException(status_code=502, detail=f"Analysis failed: {exc}") from exc
