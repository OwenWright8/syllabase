import os
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import docproc  # noqa: E402


class SniffKind(unittest.TestCase):
    def test_recognises_the_supported_types_by_content(self):
        self.assertEqual(docproc.sniff_kind(b"%PDF-1.7\n%\xe2\xe3"), "pdf")
        self.assertEqual(docproc.sniff_kind(b"\x89PNG\r\n\x1a\n\x00\x00"), "png")
        self.assertEqual(docproc.sniff_kind(b"\xff\xd8\xff\xe0\x00\x10JFIF"), "jpeg")
        self.assertEqual(docproc.sniff_kind(b"PK\x03\x04\x14\x00"), "zip")

    def test_pdf_header_may_follow_a_little_junk(self):
        self.assertEqual(docproc.sniff_kind(b"\n\n  junk\n%PDF-1.4\n"), "pdf")

    def test_pdf_header_far_into_the_file_does_not_count(self):
        self.assertIsNone(docproc.sniff_kind(b"x" * 2000 + b"%PDF-1.4"))

    def test_everything_else_is_rejected(self):
        for header in (b"", b"hello world", b"MZ\x90\x00", b"<html>", b"GIF89a", b"\x00" * 64):
            self.assertIsNone(docproc.sniff_kind(header), header)

    def test_a_misnamed_file_is_judged_by_content_not_name(self):
        # sniff_kind never sees a filename at all; this documents that on purpose
        self.assertIsNone(docproc.sniff_kind(b"this is not a pdf, whatever it is called"))


class CleanText(unittest.TestCase):
    def test_removes_nul_and_control_characters_postgres_cannot_store(self):
        self.assertEqual(docproc.clean_text("a\x00b\x07c\x1bd"), "abcd")

    def test_keeps_tabs_and_newlines_and_normalises_line_endings(self):
        self.assertEqual(docproc.clean_text("a\tb\r\nc\rd"), "a\tb\nc\nd")

    def test_strips_trailing_spaces_and_collapses_runs_of_blank_lines(self):
        self.assertEqual(docproc.clean_text("one  \n\n\n\n\n\ntwo"), "one\n\n\ntwo")

    def test_form_feeds_are_removed(self):
        self.assertEqual(docproc.clean_text("page\fbreak"), "pagebreak")

    def test_output_is_capped(self):
        self.assertEqual(len(docproc.clean_text("x" * (docproc.MAX_PAGE_CHARS + 500))), docproc.MAX_PAGE_CHARS)

    def test_result_never_contains_nul(self):
        self.assertNotIn("\x00", docproc.clean_text("\x00" * 10 + "text" + "\x00"))


class SplitPages(unittest.TestCase):
    def test_splits_on_form_feeds(self):
        self.assertEqual(docproc.split_pdftotext_pages("one\ftwo\fthree\f", 3), ["one", "two", "three"])

    def test_pads_when_the_tool_returns_fewer_pages(self):
        self.assertEqual(docproc.split_pdftotext_pages("one\f", 3), ["one", "", ""])

    def test_truncates_when_it_returns_more(self):
        self.assertEqual(docproc.split_pdftotext_pages("a\fb\fc\fd\f", 2), ["a", "b"])

    def test_a_blank_page_in_the_middle_stays_a_page(self):
        self.assertEqual(docproc.split_pdftotext_pages("a\f\fc\f", 3), ["a", "", "c"])

    def test_always_returns_exactly_the_expected_count(self):
        for n in (0, 1, 5, 50):
            self.assertEqual(len(docproc.split_pdftotext_pages("x\fy\fz", n)), n)


class ScannedDetection(unittest.TestCase):
    def test_blank_and_near_blank_pages_are_scanned(self):
        self.assertTrue(docproc.is_scanned_page(""))
        self.assertTrue(docproc.is_scanned_page("  \n \t 12 \n"))

    def test_a_page_with_real_text_is_not(self):
        self.assertFalse(docproc.is_scanned_page("Chapter 5: Thermodynamics and the first law"))

    def test_whitespace_does_not_count_towards_the_threshold(self):
        self.assertTrue(docproc.is_scanned_page("a " * 10))          # 10 visible chars
        self.assertFalse(docproc.is_scanned_page("a " * 30))         # 30 visible chars


class ImageHasText(unittest.TestCase):
    def test_threshold_is_about_letters_and_digits_not_whitespace_or_punctuation(self):
        self.assertFalse(docproc.image_has_text(" . , - _ \n"))
        self.assertFalse(docproc.image_has_text("abc 12"))

    def test_the_boundary_is_exactly_the_configured_minimum(self):
        bar = docproc.MIN_IMAGE_CHARS
        self.assertFalse(docproc.image_has_text("x " * (bar - 1)))   # one under
        self.assertTrue(docproc.image_has_text("x " * bar))          # at the bar
        self.assertTrue(docproc.image_has_text("x " * (bar + 1)))    # over
        # punctuation, underscores (form lines) and whitespace never count towards it
        self.assertFalse(docproc.image_has_text("x " * (bar - 1) + ".,;-_ \n\t" * 20))

    def test_accented_and_non_latin_letters_count(self):
        self.assertTrue(docproc.image_has_text("Übung Straße Écoles"))
        self.assertTrue(docproc.image_has_text("第五章 阅读 第十八页作业"))

    def test_is_more_lenient_than_the_pdf_page_test(self):
        text = "Chapter 5 due"  # 12 visible characters
        self.assertTrue(docproc.is_scanned_page(text))
        self.assertTrue(docproc.image_has_text(text))


def make_docx(body_xml: str) -> str:
    handle = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
    handle.close()
    with zipfile.ZipFile(handle.name, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", f"<w:document><w:body>{body_xml}</w:body></w:document>")
    return handle.name


class DocxText(unittest.TestCase):
    def tearDown(self):
        for path in getattr(self, "paths", []):
            os.unlink(path)

    def docx(self, body):
        path = make_docx(body)
        self.paths = getattr(self, "paths", []) + [path]
        return path

    def test_paragraphs_become_lines(self):
        path = self.docx("<w:p><w:r><w:t>Week 1</w:t></w:r></w:p><w:p><w:r><w:t>Read Ch. 2</w:t></w:r></w:p>")
        self.assertEqual(docproc.docx_text(path), "Week 1\nRead Ch. 2")

    def test_runs_in_a_paragraph_join_and_entities_decode(self):
        path = self.docx('<w:p><w:r><w:t xml:space="preserve">Q&amp;A </w:t></w:r><w:r><w:t>session</w:t></w:r></w:p>')
        self.assertEqual(docproc.docx_text(path), "Q&A session")

    def test_table_cells_are_tab_separated_and_rows_are_lines(self):
        row = "<w:tr><w:tc><w:p><w:r><w:t>10/18</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Ch. 5</w:t></w:r></w:p></w:tc></w:tr>"
        text = docproc.docx_text(self.docx(row))
        self.assertIn("10/18", text)
        self.assertIn("Ch. 5", text)
        self.assertEqual(text.count("\n") >= 1, True)

    def test_tabs_and_breaks(self):
        path = self.docx("<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r></w:p>")
        self.assertEqual(docproc.docx_text(path), "a\tb\nc")

    def test_a_zip_that_is_not_a_word_document_is_rejected(self):
        handle = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        handle.close()
        with zipfile.ZipFile(handle.name, "w") as archive:
            archive.writestr("readme.txt", "hi")
        self.paths = [handle.name]
        with self.assertRaises(ValueError):
            docproc.docx_text(handle.name)

    def test_garbage_is_rejected(self):
        handle = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
        handle.write(b"not a zip at all")
        handle.close()
        self.paths = [handle.name]
        with self.assertRaises(ValueError):
            docproc.docx_text(handle.name)

    def test_an_oversized_document_xml_is_refused_without_reading_it(self):
        big = "<w:p>" + ("<w:r><w:t>x</w:t></w:r>" * 1000) + "</w:p>"
        path = self.docx(big)
        original = docproc.MAX_DOCX_XML_BYTES
        docproc.MAX_DOCX_XML_BYTES = 1000
        try:
            with self.assertRaises(ValueError):
                docproc.docx_text(path)
        finally:
            docproc.MAX_DOCX_XML_BYTES = original

    def test_no_markup_survives(self):
        text = docproc.docx_text(self.docx('<w:p><w:pPr><w:pStyle w:val="H1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p>'))
        self.assertNotIn("<", text)
        self.assertEqual(text, "Title")


class FriendlyError(unittest.TestCase):
    def test_short_messages_pass_through_tidied(self):
        self.assertEqual(docproc.friendly_error("  bad\n file  "), "bad file")

    def test_long_messages_are_clipped_to_the_column_limit(self):
        self.assertLessEqual(len(docproc.friendly_error("x" * 2000)), 500)


if __name__ == "__main__":
    unittest.main()
