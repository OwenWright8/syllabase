import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pipeline  # noqa: E402
from tools import Config, ProcessingError  # noqa: E402

PDF = b"%PDF-1.7\n"
PNG = b"\x89PNG\r\n\x1a\n"
FAR_FUTURE = time.monotonic() + 10_000


class FakeTools:
    """Stands in for the real tools: page_texts[i] is the text layer of page i+1."""

    def __init__(self, page_texts, ocr=None, password=False, image_text="A readable line of text", outline=None, outline_error=None):
        self.bookmarks = outline or []
        self.outline_error = outline_error
        self.page_texts = page_texts
        self.ocr = ocr or {}
        self.password = password
        self.image_text = image_text
        self.ocr_calls = []
        self.text_calls = []

    def needs_password(self, path):
        return self.password

    def outline(self, path):
        if self.outline_error:
            raise self.outline_error
        return self.bookmarks

    def page_count(self, path):
        return len(self.page_texts)

    def text(self, path, first, last):
        self.text_calls.append((first, last))
        return "".join(t + "\f" for t in self.page_texts[first - 1:last])

    def ocr_page(self, path, page):
        self.ocr_calls.append(page)
        return self.ocr.get(page, f"ocr text of page {page} " * 3)

    def ocr_image(self, path):
        return self.image_text


def run(tools, kind="syllabus", header=PDF, cfg=None, deadline=FAR_FUTURE):
    progress = []
    result = pipeline.extract(tools, "/x", kind, header, cfg or Config({}), progress.append, deadline)
    return result, progress


REAL = "This page has plenty of real text on it."


class TextLayer(unittest.TestCase):
    def test_a_text_pdf_is_read_without_any_ocr(self):
        tools = FakeTools([REAL, REAL + " two", REAL + " three"])
        (pages, kind), _ = run(tools)
        self.assertEqual(kind, "pdf")
        self.assertEqual([t for t, _ in pages], [REAL, REAL + " two", REAL + " three"])
        self.assertEqual([o for _, o in pages], [False, False, False])
        self.assertEqual(tools.ocr_calls, [])

    def test_there_is_no_page_limit(self):
        tools = FakeTools([REAL] * 5000)
        (pages, _), _ = run(tools)
        self.assertEqual(len(pages), 5000)

    def test_text_is_read_in_blocks_not_all_at_once(self):
        tools = FakeTools([REAL] * 120)
        run(tools)
        self.assertEqual(tools.text_calls, [(1, 50), (51, 100), (101, 120)])

    def test_page_count_matches_the_pdf_even_if_the_tool_returns_fewer_pages(self):
        class Short(FakeTools):
            def text(self, path, first, last):
                return REAL + "\f"
        (pages, _), _ = run(Short([REAL, REAL, REAL]), kind="textbook")
        self.assertEqual(len(pages), 3)


class ScannedPages(unittest.TestCase):
    def test_a_syllabus_has_every_scanned_page_ocred(self):
        tools = FakeTools(["", "", REAL, ""])
        (pages, _), _ = run(tools, kind="syllabus")
        self.assertEqual(tools.ocr_calls, [1, 2, 4])
        self.assertEqual([o for _, o in pages], [True, True, False, True])
        self.assertEqual(pages[2][0], REAL)  # a text page is left alone

    def test_a_textbook_only_has_its_front_matter_ocred(self):
        tools = FakeTools([""] * 100)
        cfg = Config({"WORKER_TEXTBOOK_OCR_PAGES": "10"})
        (pages, _), _ = run(tools, kind="textbook", cfg=cfg)
        self.assertEqual(tools.ocr_calls, list(range(1, 11)))
        self.assertEqual(sum(1 for _, o in pages if o), 10)
        self.assertEqual(len(pages), 100)  # the rest are kept, un-OCR'd, so page numbers still line up

    def test_a_text_textbook_never_triggers_ocr(self):
        tools = FakeTools([REAL] * 60)
        run(tools, kind="textbook")
        self.assertEqual(tools.ocr_calls, [])

    def test_ocr_output_is_cleaned_of_nul_bytes(self):
        tools = FakeTools([""], ocr={1: "clean\x00 text with plenty of characters"})
        (pages, _), _ = run(tools)
        self.assertNotIn("\x00", pages[0][0])


class Progress(unittest.TestCase):
    def test_progress_only_goes_up_and_finishes_below_100(self):
        tools = FakeTools(["", REAL, "", REAL, ""] * 4)
        _, progress = run(tools)
        self.assertEqual(progress, sorted(progress))
        self.assertTrue(all(0 <= p <= 99 for p in progress))
        self.assertGreater(progress[-1], 90)  # the caller sets 100 once the pages are saved

    def test_text_only_pdf_reports_the_first_half(self):
        _, progress = run(FakeTools([REAL] * 4))
        self.assertEqual(progress[-1], 50)


class Refusals(unittest.TestCase):
    def assertRefused(self, fn, fragment):
        with self.assertRaises(ProcessingError) as caught:
            fn()
        self.assertIn(fragment, str(caught.exception))

    def test_a_password_protected_pdf(self):
        self.assertRefused(lambda: run(FakeTools([REAL], password=True)), "password")

    def test_a_file_that_is_not_a_document(self):
        self.assertRefused(lambda: run(FakeTools([REAL]), header=b"MZ\x90\x00 an executable"), "doesn't look like")

    def test_a_textbook_must_be_a_pdf(self):
        self.assertRefused(lambda: run(FakeTools([]), kind="textbook", header=PNG), "PDF")

    def test_a_pdf_with_no_pages(self):
        self.assertRefused(lambda: run(FakeTools([])), "no pages")

    def test_taking_too_long(self):
        self.assertRefused(lambda: run(FakeTools([REAL] * 5), deadline=time.monotonic() - 1), "too long")


class Images(unittest.TestCase):
    def test_a_syllabus_photo_is_ocred_as_one_page(self):
        (pages, kind), _ = run(FakeTools([]), header=PNG)
        self.assertEqual(kind, "png")
        self.assertEqual(pages, [("A readable line of text", True)])

    def test_an_unreadable_photo_says_so(self):
        for text in ("  \n", "", "a b c . ,", "-- __ ~~"):
            with self.assertRaises(ProcessingError, msg=repr(text)) as caught:
                run(FakeTools([], image_text=text), header=PNG)
            self.assertIn("No readable text", str(caught.exception))

    def test_a_short_but_real_result_is_kept(self):
        # 10+ letters/digits is enough for a photo (unlike the stricter per-page test for PDFs)
        (pages, _), _ = run(FakeTools([], image_text="Chapter 5 due"), header=PNG)
        self.assertEqual(pages, [("Chapter 5 due", True)])


if __name__ == "__main__":
    unittest.main()


CONTENTS_PAGE = """Contents
Chapter 1   Beginnings ........ 1
Chapter 2   Middles ........... 21
Chapter 3   Endings ........... 47
Index ......................... 90
"""


def textbook_pages(offset=6, total=110, scanned_body=False):
    """Front matter, a contents page (PDF page 3), then chapters starting at printed page + offset."""
    pages = [REAL] * total
    pages[2] = CONTENTS_PAGE
    for number, title, printed in [(1, "Beginnings", 1), (2, "Middles", 21), (3, "Endings", 47)]:
        pages[printed + offset - 1] = f"Chapter {number}\n{title}\n\n" + REAL
    if scanned_body:
        pages = [text if number <= 3 else "" for number, text in enumerate(pages, start=1)]
        return pages
    return pages


def detect(tools, pages, cfg=None, deadline=FAR_FUTURE):
    return pipeline.detect_chapters(tools, "/x", [(text, False) for text in pages], cfg or Config({}), deadline)


class Chapters(unittest.TestCase):
    def test_bookmarks_are_used_when_the_book_has_them(self):
        tree = [{"title": f"Chapter {n}", "page": p, "kids": []} for n, p in [(1, 10), (2, 30), (3, 60)]]
        found, offset, _ = detect(FakeTools(textbook_pages(), outline=tree), textbook_pages())
        self.assertEqual([(c["number"], c["start"], c["end"], c["source"]) for c in found], [(1, 10, 29, "outline"), (2, 30, 59, "outline"), (3, 60, 110, "outline")])

    def test_bookmarks_plus_a_contents_page_give_the_offset_too(self):
        tree = [{"title": f"Chapter {n}", "page": p + 9, "kids": []} for n, p in [(1, 1), (2, 21), (3, 47)]]
        _, offset, _ = detect(FakeTools([], outline=tree), textbook_pages())
        self.assertEqual(offset, 9)

    def test_the_contents_page_is_used_without_bookmarks(self):
        pages = textbook_pages(offset=6)
        found, offset, _ = detect(FakeTools(pages), pages)
        self.assertEqual(offset, 6)
        self.assertEqual([(c["number"], c["start"], c["end"], c["source"]) for c in found], [(1, 7, 26, "toc"), (2, 27, 52, "toc"), (3, 53, 95, "toc")])

    def test_a_book_with_bookmark_errors_falls_back_to_the_contents(self):
        pages = textbook_pages()
        found, _, _ = detect(FakeTools(pages, outline_error=ProcessingError("no")), pages)
        self.assertEqual(len(found), 3)

    def test_a_book_with_neither_has_no_chapters_and_is_still_fine(self):
        pages = [REAL] * 40
        self.assertEqual(detect(FakeTools(pages), pages)[:2], ([], None))

    def test_a_contents_page_whose_chapters_cannot_be_found_gives_none_rather_than_a_guess(self):
        pages = [REAL] * 110
        pages[2] = CONTENTS_PAGE
        self.assertEqual(detect(FakeTools(pages), pages)[:2], ([], None))

    def test_a_text_book_never_spends_ocr_on_a_blank_page(self):
        pages = textbook_pages()
        pages[10] = ""   # a blank page in the middle of a book that has a text layer
        tools = FakeTools(pages)
        detect(tools, pages)
        self.assertEqual(tools.ocr_calls, [])

    def test_a_scanned_book_is_ocrd_to_find_where_chapters_start_and_the_text_is_kept(self):
        pages = textbook_pages(offset=6, scanned_body=True)
        ocr = {7: "Chapter 1\nBeginnings\nSome text here for the page", 27: "Chapter 2\nMiddles\nSome text here for the page", 53: "Chapter 3\nEndings\nSome text here for the page"}
        tools = FakeTools(pages, ocr=ocr)
        found, offset, updated = detect(tools, pages)
        self.assertEqual(offset, 6)
        self.assertEqual(len(found), 3)
        self.assertTrue(updated[6][1] and updated[26][1])          # the pages OCR'd for this are recorded as OCR'd
        self.assertIn("Beginnings", updated[6][0])
        self.assertTrue(set(tools.ocr_calls) <= set(range(4, 111)))

    def test_ocr_for_locating_chapters_is_rationed(self):
        pages = textbook_pages(scanned_body=True)
        tools = FakeTools(pages, ocr={})               # OCR never shows a heading
        found, offset, _ = detect(tools, pages)
        self.assertEqual((found, offset), ([], None))
        self.assertLessEqual(len(tools.ocr_calls), 25)

    def test_running_out_of_time_while_locating_chapters_is_not_fatal_to_the_caller(self):
        pages = textbook_pages(scanned_body=True)
        found, offset, _ = detect(FakeTools(pages), pages, deadline=time.monotonic() - 1)
        self.assertEqual((found, offset), ([], None))
