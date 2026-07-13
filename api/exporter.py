"""Render the improved resume (simple markdown) to a clean, ATS-friendly DOCX.

Single column, standard fonts, real headings and bullet lists — exactly the
structure ATS parsers handle best. Deliberately forgiving about the markdown it
receives: smaller models emit inconsistent heading levels (`#`..`####`) and a
variety of bullet glyphs, so we normalize rather than drop lines. PDF export is
a later milestone.
"""

import io
import re

from docx import Document
from docx.shared import Pt

_BOLD = re.compile(r"\*\*(.+?)\*\*")
_ITALIC = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_CODE = re.compile(r"`(.+?)`")

# Any run of 1-6 leading '#'.
_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
# Common bullet glyphs models use, incl. the Unicode replacement char (mojibake).
_BULLET = re.compile(r"^[\-\*•·▪●‣⁃�]\s*(.*)$")


def _clean(text: str) -> str:
    """Drop inline markdown markers and stray mojibake — ATS parsers want plain text."""
    text = text.replace("�", "")
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
        stripped = raw.strip()
        if not stripped:
            continue

        heading = _HEADING.match(stripped)
        if heading:
            hashes = len(heading.group(1))
            text = _clean(heading.group(2))
            # 1 '#' -> title (0), 2 -> section (1), 3+ -> sub (2)
            level = 0 if hashes == 1 else 1 if hashes == 2 else 2
            if text:
                doc.add_heading(text, level=level)
            continue

        bullet = _BULLET.match(stripped)
        if bullet:
            text = _clean(bullet.group(1))
            if text:
                doc.add_paragraph(text, style="List Bullet")
            continue

        text = _clean(stripped)
        if text:
            doc.add_paragraph(text)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
