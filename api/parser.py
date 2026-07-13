"""Resume parsing: PDF/DOCX bytes -> plain text.

Kept deliberately small for the MVP slice. Section detection and richer
structure extraction land in a later milestone (see docs/architecture.md FR-2).
"""

import io

import pdfplumber
from docx import Document

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class ParseError(Exception):
    """Raised when a file cannot be read as a resume."""


def extract_text(data: bytes, content_type: str, filename: str) -> str:
    """Extract plain text from a PDF or DOCX resume.

    Falls back to the filename extension when the browser sends a generic
    content type.
    """
    kind = _resolve_kind(content_type, filename)

    if kind == "pdf":
        text = _extract_pdf(data)
    elif kind == "docx":
        text = _extract_docx(data)
    else:
        raise ParseError("Unsupported file type. Please upload a PDF or DOCX.")

    text = text.strip()
    if len(text) < 30:
        raise ParseError(
            "Could not read enough text from this file. If it's a scanned image, "
            "please upload a text-based PDF or DOCX."
        )
    return text


def _resolve_kind(content_type: str, filename: str) -> str:
    if content_type == PDF_MIME or filename.lower().endswith(".pdf"):
        return "pdf"
    if content_type == DOCX_MIME or filename.lower().endswith(".docx"):
        return "docx"
    return "unknown"


def _extract_pdf(data: bytes) -> str:
    try:
        pages: list[str] = []
        links: list[str] = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                pages.append(page.extract_text() or "")
                # Real GitHub/LinkedIn URLs are often embedded hyperlinks, not
                # visible text — capture them so the AI uses the actual links
                # instead of inventing usernames.
                for src in ((page.hyperlinks or []), (page.annots or [])):
                    for item in src:
                        uri = item.get("uri")
                        if uri and uri not in links:
                            links.append(uri)
        text = "\n".join(pages)
        if links:
            text += "\n\nEmbedded links (use these exact URLs): " + " | ".join(links)
        return text
    except ParseError:
        raise
    except Exception as exc:  # pdfplumber raises a variety of low-level errors
        raise ParseError("This PDF could not be read.") from exc


def _extract_docx(data: bytes) -> str:
    try:
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs)
    except Exception as exc:
        raise ParseError("This DOCX file could not be read.") from exc
