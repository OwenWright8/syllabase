// Unit tests for the syllabus reader (no browser: this just runs under Playwright's runner).
import { test, expect } from "@playwright/test";
import { extractReadings, resolveInBook, resolveInBooks, type Book } from "../src/lib/syllabus";
import { findDates, inferYear, type DateContext } from "../src/lib/syllabus/dates";
import { findReferences } from "../src/lib/syllabus/references";

const NO_SEMESTER: DateContext = { semesterStart: null, today: "2026-09-23" };
const FALL_2026: DateContext = { semesterStart: "2026-08-24", today: "2026-09-23" };

/** [title, date] of everything found. */
const summary = (text: string, context = FALL_2026) => extractReadings(text, context).map((c) => [c.title, c.date]);

test.describe("dates", () => {
  const one = (text: string) => {
    const [match] = findDates(text);
    return match && { month: match.month, day: match.day, year: match.year, rangeEnd: match.rangeEnd };
  };

  test("the ways people write a date", () => {
    expect(one("due 10/18")).toMatchObject({ month: 10, day: 18, year: null });
    expect(one("due 10/18/26")).toMatchObject({ month: 10, day: 18, year: 2026 });
    expect(one("due 10/18/2026")).toMatchObject({ month: 10, day: 18, year: 2026 });
    expect(one("Oct 18")).toMatchObject({ month: 10, day: 18 });
    expect(one("Oct. 18")).toMatchObject({ month: 10, day: 18 });
    expect(one("October 18th")).toMatchObject({ month: 10, day: 18 });
    expect(one("October 18, 2026")).toMatchObject({ month: 10, day: 18, year: 2026 });
    expect(one("Sept. 5")).toMatchObject({ month: 9, day: 5 });
    expect(one("18 October")).toMatchObject({ month: 10, day: 18 });
    expect(one("the 18th of October 2026")).toMatchObject({ month: 10, day: 18, year: 2026 });
    expect(one("10-18-2026")).toMatchObject({ month: 10, day: 18, year: 2026 });
    expect(one("10.18.26")).toMatchObject({ month: 10, day: 18, year: 2026 });
    expect(one("Tue, Oct 18")).toMatchObject({ month: 10, day: 18 });
  });

  test("ranges are kept, with the first day as the date", () => {
    expect(one("Oct 16–20")).toMatchObject({ month: 10, day: 16, rangeEnd: { month: 10, day: 20 } });
    expect(one("Oct 30 - Nov 3")).toMatchObject({ month: 10, day: 30, rangeEnd: { month: 11, day: 3 } });
    expect(one("10/16 - 10/20")).toMatchObject({ month: 10, day: 16, rangeEnd: { month: 10, day: 20 } });
    expect(one("Oct 20 - 16")).toMatchObject({ month: 10, day: 20, rangeEnd: null }); // backwards: not a range
  });

  test("day/month order is read as month/day, unless it can only be the other way", () => {
    const [us] = findDates("3/4");
    expect(us).toMatchObject({ month: 3, day: 4, ambiguous: true });
    const [eu] = findDates("18/10");
    expect(eu).toMatchObject({ month: 10, day: 18, ambiguous: false });
    expect(findDates("10/10")[0].ambiguous).toBe(false);
  });

  test("things that only look like dates are not", () => {
    for (const text of ["Sections 2.1–2.4", "pp. 10-18", "pages 101-130", "Chapter 12", "version 3.2", "Feb 30", "13/45", "you may 5 times", "1000/2000", "Room 2/3B"]) {
      expect(findDates(text), text).toEqual([]);
    }
  });

  test("several dates in a line are all found, in order", () => {
    expect(findDates("Due 10/18 and again Nov 2").map((d) => [d.month, d.day])).toEqual([[10, 18], [11, 2]]);
  });

  test("a month-day is not also read as day-month ('Week 3 October 18')", () => {
    expect(findDates("Week 3 October 18").map((d) => [d.month, d.day])).toEqual([[10, 18]]);
  });
});

test.describe("choosing the year", () => {
  test("with a semester start: the first year the date is on or after (start - 45 days)", () => {
    expect(inferYear(8, 25, FALL_2026)).toBe(2026);
    expect(inferYear(12, 10, FALL_2026)).toBe(2026);
    expect(inferYear(1, 20, FALL_2026)).toBe(2027);
    expect(inferYear(7, 5, FALL_2026)).toBe(2027);   // more than 45 days before the start: next year's
    expect(inferYear(7, 15, FALL_2026)).toBe(2026);
  });

  test("a spring semester that starts in January stays in one year", () => {
    const spring = { semesterStart: "2027-01-11", today: "2027-01-05" };
    expect(inferYear(1, 20, spring)).toBe(2027);
    expect(inferYear(5, 5, spring)).toBe(2027);
    expect(inferYear(12, 20, spring)).toBe(2026); // within 45 days before the start: the run-up, not next December
  });

  test("without a semester start: nothing earlier than about six months ago", () => {
    expect(inferYear(10, 18, NO_SEMESTER)).toBe(2026);
    expect(inferYear(9, 1, NO_SEMESTER)).toBe(2026);
    expect(inferYear(1, 15, NO_SEMESTER)).toBe(2027);
    expect(inferYear(4, 1, NO_SEMESTER)).toBe(2026);
    expect(inferYear(3, 1, NO_SEMESTER)).toBe(2027);
  });

  test("Feb 29 lands on a leap year", () => {
    expect(inferYear(2, 29, { semesterStart: null, today: "2027-09-01" })).toBe(2028);
  });

  test("a year that is written wins", () => {
    expect(summary("Read Chapter 5 by 10/18/25", FALL_2026)).toEqual([["Chapter 5", "2025-10-18"]]);
  });
});

test.describe("references", () => {
  const refs = (text: string) => findReferences(text).map((f) => f.reference);

  test("chapters, singly, as ranges and as lists", () => {
    expect(refs("Chapter 5")).toEqual([{ kind: "chapters", from: 5, to: 5 }]);
    expect(refs("Ch. 5")).toEqual([{ kind: "chapters", from: 5, to: 5 }]);
    expect(refs("Chap 5")).toEqual([{ kind: "chapters", from: 5, to: 5 }]);
    expect(refs("Chapters 3-4")).toEqual([{ kind: "chapters", from: 3, to: 4 }]);
    expect(refs("Chs. 3–4")).toEqual([{ kind: "chapters", from: 3, to: 4 }]);
    expect(refs("Chapters 3, 4 and 6")).toEqual([{ kind: "chapters", from: 3, to: 4 }, { kind: "chapters", from: 6, to: 6 }]);
    expect(refs("Chapters 1 & 2")).toEqual([{ kind: "chapters", from: 1, to: 2 }]);
    expect(refs("chapter 12")).toEqual([{ kind: "chapters", from: 12, to: 12 }]);
  });

  test("sections stay sections (and are not chapters)", () => {
    expect(refs("Sections 2.1-2.4")).toEqual([{ kind: "sections", chapter: 2, text: "2.1-2.4" }]);
    expect(refs("§3.2")).toEqual([{ kind: "sections", chapter: 3, text: "3.2" }]);
    expect(refs("Chapter 5.2")).toEqual([]);
  });

  test("pages", () => {
    expect(refs("pp. 101-130")).toEqual([{ kind: "pages", from: 101, to: 130 }]);
    expect(refs("p. 45")).toEqual([{ kind: "pages", from: 45, to: 45 }]);
    expect(refs("pages 12–20")).toEqual([{ kind: "pages", from: 12, to: 20 }]);
    expect(refs("pp. 12-20, 25-30")).toEqual([{ kind: "pages", from: 12, to: 20 }, { kind: "pages", from: 25, to: 30 }]);
    expect(refs("Room 4 p.m. 5")).toEqual([]);
  });

  test("words that merely contain 'ch' are not chapters", () => {
    expect(refs("Church 5, each 3, much 2, Psych 101")).toEqual([]);
  });

  test("an absurd range is not a chapter range", () => {
    expect(refs("Chapters 1-300")).toEqual([]);
  });
});

test.describe("finding readings: the layouts syllabi actually use", () => {
  test("a table of weeks (columns separated by wide gaps)", () => {
    const text = [
      "Week   Date       Topic                  Reading               Assignment",
      "1      Aug 24     Introduction           Chapter 1",
      "2      Aug 31     Cell Structure         Chapters 2-3          HW 1 due",
      "3      Sep 7      Energy                 Ch. 4, pp. 101-130    Quiz 1 (Ch. 1-3)",
      "4      Sep 14     Midterm review         Sections 5.1-5.3",
    ].join("\n");
    expect(summary(text)).toEqual([
      ["Chapter 1", "2026-08-24"],
      ["Chapters 2–3", "2026-08-31"],
      ["Chapter 4, pp. 101–130", "2026-09-07"],
      ["Sections 5.1-5.3", "2026-09-14"],
    ]);
  });

  test("a date heading with the readings underneath", () => {
    const text = [
      "Tuesday, October 18",
      "  Read: Chapter 5 (pp. 101-130)",
      "  Reading: Sections 6.1-6.3",
      "",
      "Thursday, October 20",
      "  Chapter 6 due",
    ].join("\n");
    const found = extractReadings(text, FALL_2026);
    expect(found.map((c) => [c.title, c.date, c.dateSource])).toEqual([
      ["Chapter 5, pp. 101–130", "2026-10-18", "heading"],
      ["Sections 6.1-6.3", "2026-10-18", "heading"],
      ["Chapter 6", "2026-10-20", "heading"],
    ]);
  });

  test("inline: 'by 10/18', 'due Nov 2nd', several to a line", () => {
    const text = [
      "Read Chapter 5 by 10/18.",
      "Chapters 7 and 8 are due Nov 2nd",
      "Read Chapter 9 (due 11/9); Chapter 10 (due 11/16)",
    ].join("\n");
    expect(summary(text)).toEqual([
      ["Chapter 5", "2026-10-18"],
      ["Chapters 7–8", "2026-11-02"],
      ["Chapter 9", "2026-11-09"],
      ["Chapter 10", "2026-11-16"],
    ]);
  });

  test("a week heading with a date range, readings under it", () => {
    const text = ["Week 3 (Sep 7 – Sep 11)", "Reading: Chapter 4", "Reading: Chapter 5"].join("\n");
    expect(summary(text)).toEqual([["Chapter 4", "2026-09-07"], ["Chapter 5", "2026-09-07"]]);
  });

  test("week numbers alone: dated from the semester start, and honestly undated without one", () => {
    const text = ["Week 1: Read Chapter 1", "Week 3: Read Chapter 5", "Week 10: Read Chapter 12"].join("\n");
    const withStart = extractReadings(text, FALL_2026);
    expect(withStart.map((c) => [c.title, c.date, c.dateSource])).toEqual([
      ["Chapter 1", "2026-08-24", "week"],
      ["Chapter 5", "2026-09-07", "week"],
      ["Chapter 12", "2026-10-26", "week"],
    ]);
    expect(summary(text, NO_SEMESTER)).toEqual([["Chapter 1", null], ["Chapter 5", null], ["Chapter 12", null]]);
  });

  test("a new week label doesn't inherit the previous week's date", () => {
    const text = ["Sep 7", "Read Chapter 4", "Week 4: Read Chapter 5"].join("\n");
    expect(summary(text, NO_SEMESTER)).toEqual([["Chapter 4", "2026-09-07"], ["Chapter 5", null]]);
  });

  test("a heading's date stops applying after a while", () => {
    const filler = Array.from({ length: 12 }, (_, i) => `Some other line number ${i}`);
    const text = ["Oct 18", ...filler, "Read Chapter 5"].join("\n");
    expect(summary(text)).toEqual([["Chapter 5", null]]);
  });

  test("a reading with no date at all is kept, undated", () => {
    expect(summary("Required reading: Chapter 2")).toEqual([["Chapter 2", null]]);
  });

  test("exams, quizzes and homework that merely mention chapters are not readings", () => {
    const text = [
      "Midterm Exam - Oct 25 (covers Chapters 1-5)",
      "Quiz 2 on Ch. 4 - Oct 11",
      "HW 3: Chapter 5 problems 1-20, due 10/4",
      "Lab 2 (see Chapter 3 for background) Sep 20",
      "Final project proposal (Chapter 8 topics) due Nov 1",
    ].join("\n");
    expect(summary(text)).toEqual([]);
  });

  test("...unless the text says it is a reading", () => {
    expect(summary("Read Chapter 5 for the quiz on Oct 11")).toEqual([["Chapter 5", "2026-10-11"]]);
    expect(summary("Reading: Ch. 4   Quiz on Ch. 3   Oct 11")).toEqual([["Chapter 4", "2026-10-11"]]);
  });

  test("an exam's date is not inherited by the readings after it", () => {
    const text = ["Midterm Exam - Oct 25", "Read Chapter 9"].join("\n");
    expect(summary(text, NO_SEMESTER)).toEqual([["Chapter 9", null]]);
  });

  test("the same reading listed twice for the same date appears once", () => {
    const text = ["Oct 18   Read Chapter 5", "Schedule summary: Oct 18 - Read Chapter 5"].join("\n");
    expect(summary(text)).toEqual([["Chapter 5", "2026-10-18"]]);
  });

  test("the same chapter on two dates is two readings", () => {
    const text = ["Oct 18   Read Chapter 5", "Oct 25   Read Chapter 5 (continued)"].join("\n");
    expect(summary(text)).toEqual([["Chapter 5", "2026-10-18"], ["Chapter 5", "2026-10-25"]]);
  });

  test("results are in date order, undated last", () => {
    const text = ["Read Chapter 9", "Nov 9   Read Chapter 3", "Oct 1   Read Chapter 2"].join("\n");
    expect(summary(text).map(([title]) => title)).toEqual(["Chapter 2", "Chapter 3", "Chapter 9"]);
  });

  test("an ambiguous date is flagged", () => {
    const [found] = extractReadings("Read Chapter 5 by 3/4", FALL_2026);
    expect(found.ambiguousDate).toBe(true);
    expect(found.date).toBe("2027-03-04");
  });

  test("every candidate keeps the line it came from, so it can be checked", () => {
    const [found] = extractReadings("Preface\n\n   Oct 18   Read Chapter 5   \n", FALL_2026);
    expect(found.line).toBe("Oct 18   Read Chapter 5");
    expect(found.lineNumber).toBe(3);
  });

  test("text that has nothing in it gives nothing", () => {
    expect(extractReadings("", FALL_2026)).toEqual([]);
    expect(extractReadings("Welcome to the course. Office hours are Tuesdays 2-4pm.\nAttendance counts for 10% of your grade.", FALL_2026)).toEqual([]);
  });

  test("OCR'd text with stray spacing and page breaks still works", () => {
    const text = "SYLLABUS\f\nWeek 3   Oct  18\n  Read   Chapter   5  (pp. 101 - 130)\n";
    expect(summary(text)).toEqual([["Chapter 5, pp. 101–130", "2026-10-18"]]);
  });
});

const BOOK: Book = {
  id: "book-1",
  filename: "Chemistry 12e.pdf",
  pageCount: 400,
  pageOffset: 12,
  chapters: [
    { number: 4, title: "Genetics", start_page: 100, end_page: 141 },
    { number: 5, title: "Cell Structure", start_page: 142, end_page: 183 },
    { number: 6, title: "Energy", start_page: 184, end_page: 230 },
    { number: null, title: "Introduction", start_page: 20, end_page: 99 },
  ],
};

test.describe("matching a reading to the textbook", () => {
  test("a chapter becomes its pages, titled from the book, with the book's own page numbers", () => {
    expect(resolveInBook({ kind: "chapters", from: 5, to: 5 }, BOOK)).toEqual({
      bookId: "book-1", start: 142, end: 183, title: "Chapter 5: Cell Structure", pages: "Ch. 5 (pp. 130–171)", note: null,
    });
  });

  test("a chapter range spans from the first chapter's start to the last one's end", () => {
    const found = resolveInBook({ kind: "chapters", from: 5, to: 6 }, BOOK)!;
    expect([found.start, found.end, found.title, found.pages]).toEqual([142, 230, "Chapters 5–6", "Ch. 5–6 (pp. 130–218)"]);
  });

  test("a chapter the book doesn't have (or a gap in a range) is not matched", () => {
    expect(resolveInBook({ kind: "chapters", from: 9, to: 9 }, BOOK)).toBeNull();
    expect(resolveInBook({ kind: "chapters", from: 4, to: 6 }, { ...BOOK, chapters: BOOK.chapters.filter((c) => c.number !== 5) })).toBeNull();
  });

  test("sections download the whole chapter, and say so", () => {
    const found = resolveInBook({ kind: "sections", chapter: 6, text: "6.1-6.3" }, BOOK)!;
    expect([found.start, found.end]).toEqual([184, 230]);
    expect(found.note).toMatch(/all of chapter 6/);
  });

  test("printed pages are shifted by the offset to PDF pages", () => {
    const found = resolveInBook({ kind: "pages", from: 101, to: 130 }, BOOK)!;
    expect([found.start, found.end, found.pages]).toEqual([113, 142, "pp. 101–130"]);
  });

  test("pages outside the book are not matched", () => {
    expect(resolveInBook({ kind: "pages", from: 390, to: 395 }, BOOK)).toBeNull();
    expect(resolveInBook({ kind: "pages", from: 1, to: 5 }, { ...BOOK, pageOffset: -3 })).toBeNull();
  });

  test("chapters at the very front, before the book's page 1, show PDF pages only", () => {
    const found = resolveInBook({ kind: "chapters", from: 1, to: 1 }, { ...BOOK, pageOffset: 30, chapters: [{ number: 1, title: "", start_page: 20, end_page: 29 }] })!;
    expect(found.pages).toBe("Ch. 1");
    expect(found.title).toBe("Chapter 1");
  });

  test("with several books, the first that has it wins; none means unresolved", () => {
    const other: Book = { ...BOOK, id: "book-2", chapters: [{ number: 9, title: "Other", start_page: 10, end_page: 20 }] };
    expect(resolveInBooks({ kind: "chapters", from: 9, to: 9 }, [BOOK, other])?.bookId).toBe("book-2");
    expect(resolveInBooks({ kind: "chapters", from: 5, to: 5 }, [BOOK, other])?.bookId).toBe("book-1");
    expect(resolveInBooks({ kind: "chapters", from: 50, to: 50 }, [BOOK, other])).toBeNull();
    expect(resolveInBooks({ kind: "chapters", from: 5, to: 5 }, [])).toBeNull();
  });
});
