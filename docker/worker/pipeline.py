"""What to do with an uploaded file: pure logic over a `tools` object.

No database and no subprocesses here (those are worker.py and tools.py), so the
decisions (which pages get OCR'd, how progress is reported, what is refused)
can be tested with a fake `tools`.
"""
import time

import chapters
import docproc
from tools import ProcessingError

TEXT_BLOCK_PAGES = 50


def extract(tools, path, kind, header, cfg, report, deadline):
    """Return (pages, kind_of_file) where pages is a list of (text, was_ocr).

    `kind` is what the user said it is ('textbook' or 'syllabus'); the file's real
    type is worked out from its content.
    """
    actual = docproc.sniff_kind(header)
    if actual is None:
        raise ProcessingError("That doesn't look like a PDF, Word document or image.")

    if kind == "textbook" and actual != "pdf":
        raise ProcessingError("Textbooks need to be PDF files.")

    if actual == "pdf":
        return extract_pdf(tools, path, kind, cfg, report, deadline), "pdf"
    if actual == "zip":
        try:
            text = docproc.docx_text(path)
        except ValueError as error:
            raise ProcessingError(f"That file isn't a readable Word (.docx) document: {error}.")
        if not text.strip():
            raise ProcessingError("That Word document has no text in it.")
        return [(text, False)], "docx"
    # png / jpeg: a photo or scan of a page
    report(10)
    text = docproc.clean_text(tools.ocr_image(path))
    if not docproc.image_has_text(text):
        raise ProcessingError("No readable text was found in that image. Try a sharper, straighter photo or scan.")
    return [(text, True)], actual


def _check_deadline(deadline):
    if time.monotonic() > deadline:
        raise ProcessingError("Processing this file took too long and was stopped.")


def extract_pdf(tools, path, kind, cfg, report, deadline):
    if tools.needs_password(path):
        raise ProcessingError("That PDF is password-protected. Remove the password and upload it again.")

    total = tools.page_count(path)
    if total < 1:
        raise ProcessingError("That PDF has no pages.")

    # 1. The text layer, a block of pages at a time.
    pages = []
    for first in range(1, total + 1, TEXT_BLOCK_PAGES):
        _check_deadline(deadline)
        last = min(first + TEXT_BLOCK_PAGES - 1, total)
        block = docproc.split_pdftotext_pages(tools.text(path, first, last), last - first + 1)
        pages.extend(docproc.clean_text(text) for text in block)
        report(int(last / total * 50))

    # 2. OCR the pages with no text. A syllabus is short, so OCR all of it. A
    # textbook can be huge and a fully scanned one takes hours on a small
    # machine, so only the front matter (where the contents are) is OCR'd here.
    scanned = [number for number, text in enumerate(pages, start=1) if docproc.is_scanned_page(text)]
    if kind == "textbook":
        scanned = [number for number in scanned if number <= cfg.textbook_ocr_pages]

    ocred = set()
    for done, number in enumerate(scanned, start=1):
        _check_deadline(deadline)
        pages[number - 1] = docproc.clean_text(tools.ocr_page(path, number))
        ocred.add(number)
        report(50 + int(done / len(scanned) * 49))

    return [(text, number in ocred) for number, text in enumerate(pages, start=1)]


def detect_chapters(tools, path, pages, cfg, deadline):
    """Find a textbook's chapters. Returns (chapters, offset, pages).

    `chapters` are dicts with number/title/start/end/source in PDF pages (possibly
    empty); `offset` is printed page -> PDF page, or None if unknown; `pages` is
    the page list again, with any extra pages OCR'd to locate chapter starts.
    Never fails the document: a book without findable chapters is still a book.
    """
    total = len(pages)
    texts = [text for text, _ in pages]
    ocred = [was_ocr for _, was_ocr in pages]

    toc, boundaries, contents_end = chapters.parse_toc(texts)

    try:
        found = chapters.from_outline(tools.outline(path), total)
    except ProcessingError:
        found = []
    if found:
        return found, (chapters.offset_from_outline(found, toc) if toc else None), pages

    if not toc:
        return [], None, pages

    # A book whose text layer is mostly missing is a scan: locating a chapter's
    # first page then needs OCR, which is slow, so it's rationed. A book with a
    # text layer never needs it (a blank page in one is just blank).
    scanned_book = sum(1 for text in texts if docproc.is_scanned_page(text)) > total / 2
    budget = [chapters.MAX_OCR_PROBES]

    def page_text(number):
        text = texts[number - 1]
        if not scanned_book or not docproc.is_scanned_page(text) or ocred[number - 1]:
            return text
        if budget[0] <= 0:
            return None
        _check_deadline(deadline)
        budget[0] -= 1
        texts[number - 1] = docproc.clean_text(tools.ocr_page(path, number))
        ocred[number - 1] = True
        return texts[number - 1]

    try:
        offset = chapters.find_offset(toc, total, contents_end, page_text)
    except ProcessingError:
        offset = None
    updated = list(zip(texts, ocred))
    if offset is None:
        return [], None, updated
    return chapters.from_toc(toc, boundaries, offset, total), offset, updated
