// Pulling "what is read, and when" out of a syllabus's text.
//
// Rules, not AI: syllabi come in a few common shapes (a table of weeks, a dated
// list, "Read Chapter 5 by 10/18"), and every result is shown to the user to
// confirm before anything is saved, so the rules aim for "usually right, and
// never silently wrong": when a date is only implied (a week heading, a week
// number) the candidate says so.

import { DateContext, DateMatch, dateToIso, findDates, findWeekNumber, weekStart } from "./dates";
import { ReadingReference, combineChapterAndPages, findReferences, referenceTitle } from "./references";

export type DateSource = "line" | "heading" | "week";

export interface Candidate {
  /** Unique within one extraction. */
  id: string;
  /** The syllabus text this came from, so the user can check it. */
  line: string;
  lineNumber: number;
  reference: ReadingReference;
  title: string;
  /** YYYY-MM-DD, or null when the syllabus didn't say. */
  date: string | null;
  /** Where the date came from: the same line, a heading above it, or a week number. */
  dateSource: DateSource | null;
  /** "3/4": read as March 4th, but could be the 3rd of April. */
  ambiguousDate: boolean;
}

/** How many lines a date heading ("Oct 18") keeps applying to the readings under it. */
const HEADING_REACH = 8;

const READ_WORDS = /\b(?:read(?:ing|ings)?|assigned|textbook|text)\b/i;
// Things that mention chapters without being a reading: "Exam 1 covers Ch. 1–4", "HW 3: Ch. 5 problems".
const NON_READING = /\b(?:exams?|midterms?|finals?|quizz?(?:es)?|tests?|hw|homework|problem\s+sets?|assignments?|labs?|projects?|papers?|essays?|worksheets?|presentations?)\b/i;
const ONLY_A_READ_WORD = /^\W*(?:read(?:ing|ings)?|assigned(?:\s+reading)?)\W*$/i;

interface Segment {
  text: string;
  start: number;
  end: number;
}

/** A cell that ends on one of these is cut off from what it introduces ("Chapter" | "5"). */
const DANGLING = /(?:chapters?|chaps?\.?|chs?\.?|sections?|secs?\.?|pp?\.?|pages?)$/i;

/** Split a line into its cells/clauses: table columns (wide gaps), `|`, `;`, and sentence ends. */
function splitSegments(line: string): Segment[] {
  const parts = line.split(/(\s{3,}|\s*[|;]\s*|(?<=[a-z0-9)\]])\.\s+(?=[A-Z]))/);
  const segments: Segment[] = [];
  let offset = 0;
  parts.forEach((part, position) => {
    const start = offset;
    offset += part.length;
    if (position % 2 === 1 || !part.trim()) return; // the odd-numbered parts are the delimiters
    segments.push({ text: part.trim(), start, end: offset });
  });

  // Put back together a keyword and its number when the gap between them was just a wide space.
  const merged: Segment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && DANGLING.test(last.text)) {
      last.text = `${last.text} ${segment.text}`;
      last.end = segment.end;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

interface Context {
  date: string | null;
  ambiguous: boolean;
  week: number | null;
  age: number;
}

const firstIn = (dates: DateMatch[], start: number, end: number) => dates.find((d) => d.index >= start && d.index < end);

export function extractReadings(text: string, context: DateContext): Candidate[] {
  const lines = text.replace(/\u00a0/g, " ").replace(/\t/g, "   ").split(/\r?\n|\f/);
  const found: Candidate[] = [];
  const seen = new Set<string>();
  const heading: Context = { date: null, ambiguous: false, week: null, age: HEADING_REACH + 1 };

  lines.forEach((rawLine, index) => {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) {
      heading.age++;
      return;
    }

    const dates = findDates(line);
    const week = findWeekNumber(line);
    const segments = splitSegments(line);

    // Which segments hold a reading?
    const readings: Array<{ segment: Segment; references: ReadingReference[] }> = [];
    let carriedRead = false;
    for (const segment of segments) {
      if (ONLY_A_READ_WORD.test(segment.text)) {
        carriedRead = true;
        continue;
      }
      const references = combineChapterAndPages(findReferences(segment.text).map((r) => r.reference));
      if (references.length && (carriedRead || READ_WORDS.test(segment.text) || !NON_READING.test(segment.text))) {
        readings.push({ segment, references });
      }
      carriedRead = false;
    }

    const lineDate = dates[0] ?? null;

    if (readings.length === 0) {
      // A heading line: remember its date/week for the readings underneath.
      if (!NON_READING.test(line) && (lineDate || week !== null)) {
        heading.date = lineDate ? dateToIso(lineDate, context) : null;
        heading.ambiguous = lineDate?.ambiguous ?? false;
        heading.week = week;
        heading.age = 0;
      } else {
        heading.age++;
      }
      return;
    }

    // A new week label without a date of its own starts over: the date above is last week's.
    if (week !== null && !lineDate) {
      heading.date = null;
      heading.ambiguous = false;
      heading.week = week;
      heading.age = 0;
    }

    let order = 0;
    for (const { segment, references } of readings) {
      const inSegment = firstIn(dates, segment.start, segment.end);
      let date: string | null = null;
      let source: DateSource | null = null;
      let ambiguous = false;

      const own = inSegment ?? lineDate;
      if (own) {
        date = dateToIso(own, context);
        source = "line";
        ambiguous = own.ambiguous;
      } else if (week !== null && context.semesterStart) {
        date = weekStart(week, context.semesterStart);
        source = "week";
      } else if (week === null && heading.age <= HEADING_REACH) {
        if (heading.date) {
          date = heading.date;
          source = "heading";
          ambiguous = heading.ambiguous;
        } else if (heading.week !== null && context.semesterStart) {
          date = weekStart(heading.week, context.semesterStart);
          source = "week";
        }
      }

      for (const reference of references) {
        const title = referenceTitle(reference);
        const key = `${title}|${date ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({
          id: `${index + 1}:${order++}`,
          line: line.trim(),
          lineNumber: index + 1,
          reference,
          title,
          date,
          dateSource: source,
          ambiguousDate: ambiguous,
        });
      }
    }

    heading.age++;
  });

  // Soonest first; undated last; otherwise the order they were written.
  return found.sort((a, b) => (a.date ?? "9999") .localeCompare(b.date ?? "9999") || a.lineNumber - b.lineNumber);
}
