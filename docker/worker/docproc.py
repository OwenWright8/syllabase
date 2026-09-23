"""Pure helpers for the document worker: no database, no subprocesses.

Kept separate from worker.py so the parts that decide what an upload IS and what
its text looks like can be unit tested anywhere (see tests/test_docproc.py).
Everything here treats its input as untrusted.
"""
from __future__ import annotations

import html
import re
import zipfile

# Postgres `text` cannot hold NUL, and a page of runaway OCR output shouldn't be
# able to bloat the table.
MAX_PAGE_CHARS = 60_000

# A PDF page with fewer visible characters than this has no usable text layer,
# so it is treated as a scan and OCR'd.
SCANNED_PAGE_CHARS = 25

# A whole photo/scan that yields fewer letters and digits than this is judged
# unreadable. Deliberately lower than the page threshold above: a one-page image
# is judged as a whole, and a short result is still a result.
MIN_IMAGE_CHARS = 10

MAX_DOCX_XML_BYTES = 20 * 1024 * 1024


def sniff_kind(header: bytes) -> str | None:
    """What a file actually is, from its first bytes: pdf, zip, png, jpeg, or None.

    The browser's idea of the type (extension / MIME) is never trusted.
    """
    # A PDF may have a little junk before its header; the spec allows 1024 bytes.
    if b"%PDF-" in header[:1024]:
        return "pdf"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if header.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if header.startswith(b"PK\x03\x04"):
        return "zip"
    return None


def clean_text(text: str) -> str:
    """Make extracted text safe to store: no NULs or control characters, tidy newlines."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Keep tab and newline; drop the other C0 controls (form feed included) and NUL.
    text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", text)
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    text = re.sub(r"\n{4,}", "\n\n\n", text).strip("\n")
    return text[:MAX_PAGE_CHARS]


def split_pdftotext_pages(output: str, expected: int) -> list[str]:
    """Split `pdftotext` output (pages separated by form feeds) into exactly `expected` pages."""
    pages = output.split("\f")
    if len(pages) > expected and not pages[-1].strip():
        pages = pages[:-1]  # the trailing form feed after the last page
    pages = pages[:expected]
    pages += [""] * (expected - len(pages))
    return pages


def is_scanned_page(text: str) -> bool:
    return len(re.sub(r"\s+", "", text)) < SCANNED_PAGE_CHARS


def image_has_text(text: str) -> bool:
    """Did OCR of a photo/scan find anything worth keeping?

    Counts letters and digits only (any language). Not `\\w`: that includes the
    underscore, so a scan of blank form lines ("________") would look readable.
    """
    return sum(1 for character in text if character.isalnum()) >= MIN_IMAGE_CHARS


def docx_text(path: str) -> str:
    """The text of a .docx, without an XML parser (nothing to exploit) or LibreOffice.

    A .docx is a zip whose word/document.xml holds paragraphs (<w:p>) of runs
    (<w:t>). Reading is capped so a zip bomb can't exhaust memory.
    """
    try:
        with zipfile.ZipFile(path) as archive:
            try:
                info = archive.getinfo("word/document.xml")
            except KeyError:
                raise ValueError("not a Word document (no word/document.xml)")
            if info.file_size > MAX_DOCX_XML_BYTES:
                raise ValueError("the Word document is too large to read")
            with archive.open(info) as handle:
                xml = handle.read(MAX_DOCX_XML_BYTES + 1).decode("utf-8", errors="replace")
    except zipfile.BadZipFile:
        raise ValueError("not a valid Word document")

    if len(xml) > MAX_DOCX_XML_BYTES:
        raise ValueError("the Word document is too large to read")

    xml = re.sub(r"<w:tab\s*/>", "\t", xml)
    xml = re.sub(r"<w:(?:br|cr)\b[^>]*/>", "\n", xml)
    # A table cell ends a "column"; a paragraph or row ends a line.
    xml = re.sub(r"</w:tc>", "\t", xml)
    xml = re.sub(r"</w:(?:p|tr)>", "\n", xml)
    xml = re.sub(r"<[^>]+>", "", xml)
    return clean_text(html.unescape(xml))


def friendly_error(message: str) -> str:
    """Clip an error to what the database accepts (500 chars) and what's useful to read."""
    message = re.sub(r"\s+", " ", message).strip()
    return message[:497] + "..." if len(message) > 500 else message
