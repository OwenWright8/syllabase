import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pipeline  # noqa: E402
from tools import Config, ProcessingError  # noqa: E402

PDF = b"%PDF-1.7\n"
PNG = b"\x89PNG\r\n\x1a\n"
LIMITS = {"max_pages": 100}
FAR_FUTURE = time.monotonic() + 10_000


class FakeTools:
    """Stands in for the real tools: page_texts[i] is the text layer of page i+1."""

    def __init__(self, page_texts, ocr=None, password=False, image_text="A readable line of text"):
        self.page_texts = page_texts
        self.ocr = ocr or {}
        self.password = password
        self.image_text = image_text
        self.ocr_calls = []
        self.text_calls = []

    def needs_password(self, path):
        return self.password

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


def run(tools, kind="syllabus", header=PDF, cfg=None, limits=LIMITS, deadline=FAR_FUTURE):
    progress = []
    result = pipeline.extract(tools, "/x", kind, header, cfg or Config({}), limits, progress.append, deadline)
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

    def test_text_is_read_in_blocks_not_all_at_once(self):
        tools = FakeTools([REAL] * 120)
        run(tools, limits={"max_pages": 500})
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

    def test_too_many_pages(self):
        self.assertRefused(lambda: run(FakeTools([REAL] * 11), limits={"max_pages": 10}), "limit is 10")

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
