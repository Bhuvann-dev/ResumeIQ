"""ResumeIQ API — MVP vertical slice.

Synchronous upload -> parse -> AI analysis / rewrite. No database, queue, or
file storage yet (deliberate for the slice — see docs/architecture.md). Resume
bytes are held in memory only for the duration of the request, never on disk.
"""

from dotenv import load_dotenv

load_dotenv()  # load api/.env for local dev before any module reads env vars

import os
import re

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

import analyzer
from exporter import markdown_to_docx
from models import AnalysisResult, ImproveResult
from parser import ParseError, extract_text

MAX_BYTES = 5 * 1024 * 1024  # 5 MB
DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

app = FastAPI(title="ResumeIQ API", version="0.2.0")

# Allow the frontend origin(s). Comma-separated list in CORS_ORIGINS, or "*".
_origins = os.environ.get("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _origins == "*" else [o.strip() for o in _origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _read_resume(file: UploadFile) -> str:
    """Validate an uploaded file and return its extracted text, or raise HTTP errors."""
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 5 MB limit.")
    try:
        return extract_text(data, file.content_type or "", file.filename or "")
    except ParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _require_ai() -> None:
    if not analyzer.ai_configured():
        raise HTTPException(
            status_code=503,
            detail="AI is not configured on the server (set OPENAI_API_KEY, or OPENAI_BASE_URL for a local Ollama).",
        )


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "ai_configured": analyzer.ai_configured()}


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_resume(
    file: UploadFile = File(...),
    job_description: str | None = Form(default=None),
) -> AnalysisResult:
    resume_text = await _read_resume(file)
    _require_ai()
    jd = (job_description or "").strip() or None
    try:
        return analyzer.analyze(resume_text, jd)
    except Exception as exc:  # surface AI/provider failures as 502
        raise HTTPException(status_code=502, detail=f"Analysis failed: {exc}") from exc


@app.post("/improve", response_model=ImproveResult)
async def improve_resume(
    file: UploadFile = File(...),
    job_description: str | None = Form(default=None),
) -> ImproveResult:
    resume_text = await _read_resume(file)
    _require_ai()
    jd = (job_description or "").strip() or None
    try:
        return analyzer.improve(resume_text, jd)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Rewrite failed: {exc}") from exc


class ExportRequest(BaseModel):
    markdown: str = Field(min_length=1)
    filename: str = "resume_improved"


@app.post("/export")
def export_docx(req: ExportRequest) -> Response:
    # Sanitize the filename to a safe basename (no path/header injection).
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", req.filename).strip("_") or "resume_improved"
    data = markdown_to_docx(req.markdown)
    return Response(
        content=data,
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{safe}.docx"'},
    )
