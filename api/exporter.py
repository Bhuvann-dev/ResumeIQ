"""Render the improved resume (simple markdown) to a clean, ATS-friendly DOCX.

Single column, standard fonts, real headings and bullet lists — exactly the
structure ATS parsers handle best. PDF export is a later milestone.
"""

import io
import re

from docx import Document
from docx.shared import Pt

_BOLD = re.compile(r"\*\*(.+?)\*\*")
_ITALIC = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_CODE = re.compile(r"`(.+?)`")


def _strip_md(text: str) -> str:
    """Drop inline markdown markers — ATS parsers prefer plain text."""
    text = _BOLD.sub(r"\1", text)
    text = _ITALIC.sub(r"\1", text)
    text = _CODE.sub(r"\1", text)
    return text.strip()


def markdown_to_docx(markdown: str) -> bytes:
    doc = Document()

    # A clean, ATS-safe base font.
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)

    for raw in markdown.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            continue

        if line.startswith("### "):
            doc.add_heading(_strip_md(line[4:]), level=2)
        elif line.startswith("## "):
            doc.add_heading(_strip_md(line[3:]), level=1)
        elif line.startswith("# "):
            doc.add_heading(_strip_md(line[2:]), level=0)
        elif stripped.startswith(("- ", "* ")):
            doc.add_paragraph(_strip_md(stripped[2:]), style="List Bullet")
        else:
            doc.add_paragraph(_strip_md(line))

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
