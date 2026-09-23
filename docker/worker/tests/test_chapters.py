import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import chapters  # noqa: E402


def node(title, page, *kids):
    return {"title": title, "page": page, "kids": list(kids)}


class ParseTitle(unittest.TestCase):
    def test_the_usual_ways_a_chapter_is_labelled(self):
        cases = {
            "Chapter 5: Cell Structure": (5, "Cell Structure"),
            "CHAPTER 12 - Genetics": (12, "Genetics"),
            "Ch. 3 Motion": (3, "Motion"),
            "5. The Cell": (5, "The Cell"),
            "5 The Cell": (5, "The Cell"),
            "7: Waves": (7, "Waves"),
            "  Chapter   9   Energy  ": (9, "Energy"),
        }
        for title, expected in cases.items():
            self.assertEqual(chapters.parse_title(title), expected, title)

    def test_things_that_are_not_chapters(self):
        for title in ["Preface", "Index", "1.1 Section heading", "2.3.4 Deep", "Appendix A", "Part II", "2019 Edition"]:
            self.assertIsNone(chapters.parse_title(title)[0], title)


class Outline(unittest.TestCase):
    def test_chapters_run_to_the_next_bookmark(self):
        tree = [
            node("Preface", 5),
            node("Chapter 1: Intro", 11, node("1.1 Why", 11), node("1.2 How", 14)),
            node("Chapter 2: Cells", 30),
            node("Chapter 3: Genes", 55),
            node("Index", 200),
        ]
        found = chapters.from_outline(tree, 210)
        self.assertEqual([(c["number"], c["start"], c["end"]) for c in found], [(1, 11, 29), (2, 30, 54), (3, 55, 199)])
        self.assertEqual({c["source"] for c in found}, {"outline"})
        self.assertEqual(found[1]["title"], "Cells")

    def test_chapters_nested_under_parts_are_found(self):
        tree = [
            node("Part I", 9, node("Chapter 1", 11), node("Chapter 2", 30)),
            node("Part II", 50, node("Chapter 3", 52), node("Chapter 4", 80)),
        ]
        found = chapters.from_outline(tree, 120)
        self.assertEqual([(c["number"], c["start"], c["end"]) for c in found], [(1, 11, 29), (2, 30, 49), (3, 52, 79), (4, 80, 120)])

    def test_a_chapter_ends_where_an_appendix_at_its_own_level_begins(self):
        tree = [node("1 A", 5), node("2 B", 20), node("3 C", 40), node("Appendix A", 90), node("Glossary", 95)]
        found = chapters.from_outline(tree, 100)
        self.assertEqual(found[-1]["end"], 89)

    def test_two_chapters_on_one_page_do_not_end_before_they_start(self):
        found = chapters.from_outline([node("1 A", 5), node("2 B", 5), node("3 C", 9)], 20)
        self.assertEqual([(c["start"], c["end"]) for c in found], [(5, 5), (5, 8), (9, 20)])

    def test_bookmarks_without_chapter_numbers_give_nothing(self):
        tree = [node("Cover", 1), node("Contents", 3), node("Introduction", 9), node("Cells", 30), node("Index", 90)]
        self.assertEqual(chapters.from_outline(tree, 100), [])

    def test_too_few_numbered_chapters_is_not_a_book_of_chapters(self):
        self.assertEqual(chapters.from_outline([node("Chapter 1", 5), node("Chapter 2", 20)], 50), [])

    def test_bookmarks_pointing_outside_the_book_are_ignored(self):
        tree = [node("1 A", 5), node("2 B", None), node("3 C", 999), node("4 D", 30), node("5 E", 40)]
        found = chapters.from_outline(tree, 60)
        self.assertEqual([c["number"] for c in found], [1, 4, 5])

    def test_a_repeated_chapter_number_is_used_once(self):
        found = chapters.from_outline([node("1 A", 5), node("1 A again", 6), node("2 B", 20), node("3 C", 40)], 60)
        self.assertEqual([c["number"] for c in found], [1, 2, 3])

    def test_no_bookmarks(self):
        self.assertEqual(chapters.from_outline([], 100), [])


CONTENTS = """Contents

Preface ..................................... vii
Chapter 1   The Nature of Science ............ 1
Chapter 2   Cell Structure ................... 21
Chapter 3   Energy and Metabolism ............ 47
Chapter 4   Genetics ......................... 88
Appendix A  Units ............................ 130
Index ........................................ 141
"""


class ContentsPage(unittest.TestCase):
    def test_chapter_lines_and_the_pages_after_the_last_chapter(self):
        toc, boundaries, contents_end = chapters.parse_toc(["cover", CONTENTS])
        self.assertEqual(
            toc,
            [(1, "The Nature of Science", 1), (2, "Cell Structure", 21), (3, "Energy and Metabolism", 47), (4, "Genetics", 88)],
        )
        self.assertEqual(boundaries, [130, 141])
        self.assertEqual(contents_end, 2)

    def test_dotted_leaders_without_the_word_chapter(self):
        text = "1. Introduction . . . . . . . 3\n2. Cells . . . . . . . . . 19\n3. Genes . . . . . . . . . 40\n"
        toc, _, _ = chapters.parse_toc([text])
        self.assertEqual([(n, t, p) for n, t, p in toc], [(1, "Introduction", 3), (2, "Cells", 19), (3, "Genes", 40)])

    def test_wide_gaps_instead_of_dots(self):
        text = "1   Introduction        3\n2   Cells               19\n3   Genes               40\n"
        toc, _, _ = chapters.parse_toc([text])
        self.assertEqual([n for n, _, _ in toc], [1, 2, 3])

    def test_a_detailed_contents_that_repeats_the_chapters_is_not_counted_twice(self):
        summary = "Chapter 1  A ....... 1\nChapter 2  B ....... 20\nChapter 3  C ....... 40\n"
        detailed = "Chapter 1  A ....... 1\n1.1 Section ....... 2\nChapter 2  B ....... 20\n2.1 Section ....... 21\nChapter 3  C ....... 40\n"
        toc, _, _ = chapters.parse_toc([summary, detailed])
        self.assertEqual([n for n, _, _ in toc], [1, 2, 3])

    def test_a_stray_number_early_does_not_hide_the_real_chapters(self):
        text = "12 Rules of Thumb ....... 3\n" + "\n".join(f"Chapter {i}  Title {i} ....... {i * 20}" for i in range(1, 6))
        toc, _, _ = chapters.parse_toc([text])
        self.assertEqual([n for n, _, _ in toc], [1, 2, 3, 4, 5])

    def test_ordinary_prose_is_not_a_contents_page(self):
        text = "The war ended in 1945 and\nthere were 3 main causes, see page 12\nSection 4 covers 2 more topics 7\n"
        self.assertEqual(chapters.parse_toc([text]), ([], [], 0))

    def test_a_numbered_line_with_no_leader_is_not_trusted(self):
        text = "3 Cells 45\n4 Genes 60\n5 Energy 80\n"
        self.assertEqual(chapters.parse_toc([text]), ([], [], 0))

    def test_too_few_chapters(self):
        self.assertEqual(chapters.parse_toc(["Chapter 1  A ..... 1\nChapter 2  B ..... 9\n"]), ([], [], 0))

    def test_only_the_front_of_the_book_is_searched(self):
        pages = ["front"] * chapters.MAX_TOC_PAGES + [CONTENTS]
        self.assertEqual(chapters.parse_toc(pages), ([], [], 0))


ENTRIES = [(1, "The Nature of Science", 1), (2, "Cell Structure", 21), (3, "Energy and Metabolism", 47), (4, "Genetics", 88)]


def book(offset, total=160, contents_end=3):
    """A text book whose chapter n starts on PDF page printed+offset, after `contents_end` pages of front matter."""
    pages = {p: f"body text of page {p}" for p in range(1, total + 1)}
    for number, title, printed in ENTRIES:
        pages[printed + offset] = f"Chapter {number}\n{title}\n\nfirst paragraph"
    return pages


class Offset(unittest.TestCase):
    def find(self, pages, contents_end=3, total=160, entries=ENTRIES):
        return chapters.find_offset(entries, total, contents_end, lambda n: pages.get(n, ""))

    def test_finds_the_shift_between_printed_and_pdf_pages(self):
        self.assertEqual(self.find(book(12)), 12)

    def test_no_shift(self):
        self.assertEqual(self.find(book(0), contents_end=0), 0)

    def test_matches_on_the_title_when_the_page_does_not_say_chapter(self):
        pages = {p: f"body {p}" for p in range(1, 161)}
        for number, title, printed in ENTRIES:
            pages[printed + 9] = f"{number}\n{title.upper()}\nintro"
        self.assertEqual(self.find(pages), 9)

    def test_one_odd_chapter_is_outvoted(self):
        pages = book(12)
        pages[47 + 12] = "an illustration page"     # chapter 3's real start is unreadable
        pages[47 + 20] = "Chapter 3\nEnergy"          # ...and turns up 8 pages later
        self.assertEqual(self.find(pages), 12)

    def test_running_headers_on_the_contents_page_itself_are_not_mistaken_for_a_start(self):
        pages = book(12)
        pages[2] = "Chapter 1  The Nature of Science ..... 1"
        self.assertEqual(self.find(pages, contents_end=3), 12)

    def test_gives_up_when_the_chapters_are_nowhere_to_be_found(self):
        self.assertIsNone(self.find({p: "nothing" for p in range(1, 161)}))

    def test_gives_up_when_chapters_disagree(self):
        pages = {p: "x" for p in range(1, 161)}
        pages[1 + 10] = "Chapter 1\nThe Nature of Science"
        pages[21 + 14] = "Chapter 2\nCell Structure"
        self.assertIsNone(self.find(pages, entries=ENTRIES[:2]))

    def test_an_even_split_between_two_shifts_is_not_an_answer(self):
        pages = {p: "x" for p in range(1, 161)}
        for number, title, printed in ENTRIES[:2]:
            pages[printed + 10] = f"Chapter {number}\n{title}"
        for number, title, printed in ENTRIES[2:]:
            pages[printed + 14] = f"Chapter {number}\n{title}"
        self.assertIsNone(self.find(pages))

    def test_stops_looking_for_a_chapter_when_told_no_more_effort_is_allowed(self):
        asked = []

        def page_text(n):
            asked.append(n)
            return None

        self.assertIsNone(chapters.find_offset(ENTRIES, 160, 3, page_text))
        self.assertEqual(len(asked), len(ENTRIES))   # one refusal per chapter, then on to the next

    def test_only_a_handful_of_chapters_are_probed(self):
        many = [(i, f"Chapter title number {i}", i * 10) for i in range(1, 31)]
        probed = []

        def page_text(n):
            probed.append(n)
            return "nothing"

        chapters.find_offset(many, 400, 3, page_text)
        self.assertLessEqual(len(probed), chapters.OFFSET_PROBES * (chapters.OFFSET_WINDOW + 1))


class FromContents(unittest.TestCase):
    def test_pdf_pages_from_printed_pages(self):
        found = chapters.from_toc(ENTRIES, [130, 141], 12, 160)
        self.assertEqual([(c["number"], c["start"], c["end"]) for c in found], [(1, 13, 32), (2, 33, 58), (3, 59, 99), (4, 100, 141)])
        self.assertEqual({c["source"] for c in found}, {"toc"})

    def test_the_last_chapter_runs_to_the_end_without_a_boundary(self):
        self.assertEqual(chapters.from_toc(ENTRIES, [], 0, 150)[-1]["end"], 150)

    def test_chapters_beyond_the_end_of_the_book_are_dropped(self):
        found = chapters.from_toc(ENTRIES, [], 0, 60)
        self.assertEqual([c["number"] for c in found], [1, 2, 3])

    def test_too_few_left_means_none(self):
        self.assertEqual(chapters.from_toc(ENTRIES, [], 0, 30), [])


class OffsetFromBookmarks(unittest.TestCase):
    def test_bookmarks_and_contents_agree_on_the_shift(self):
        outline = [{"number": n, "start": p + 12} for n, _, p in ENTRIES]
        self.assertEqual(chapters.offset_from_outline(outline, ENTRIES), 12)

    def test_no_chapters_in_common(self):
        self.assertIsNone(chapters.offset_from_outline([{"number": 9, "start": 5}], ENTRIES))

    def test_a_tie_is_not_an_answer(self):
        outline = [{"number": 1, "start": 13}, {"number": 2, "start": 40}]
        self.assertIsNone(chapters.offset_from_outline(outline, ENTRIES))


if __name__ == "__main__":
    unittest.main()
