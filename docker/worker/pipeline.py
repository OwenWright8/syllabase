"""What to do with an uploaded file: pure logic over a `tools` object.

No database and no subprocesses here (those are worker.py and tools.py), so the
decisions (which pages get OCR'd, how progress is reported, what is refused)
can be tested with a fake `tools`.
"""
import time

import docproc
from tools import ProcessingError

TEXT_BLOCK_PAGES = 50


def extract(tools, path, kind, header, cfg, limits, report, deadline):
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
        return extract_pdf(tools, path, kind, cfg, limits, report, deadline), "pdf"
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


def extract_pdf(tools, path, kind, cfg, limits, report, deadline):
    if tools.needs_password(path):
        raise ProcessingError("That PDF is password-protected. Remove the password and upload it again.")

    total = tools.page_count(path)
    if total < 1:
        raise ProcessingError("That PDF has no pages.")
    if total > limits["max_pages"]:
        raise ProcessingError(f"That PDF has {total} pages; the limit is {limits['max_pages']}.")

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
