// Finding "what to read" in a piece of syllabus text: chapters, sections, pages.

export type ReadingReference =
  | { kind: "chapters"; from: number; to: number }
  | { kind: "sections"; chapter: number; text: string }
  // `chapter` is set when the syllabus names both ("Ch. 4, pp. 101–130"): the pages are the reading, the chapter says which part of the book.
  | { kind: "pages"; from: number; to: number; chapter?: number };

const DASH = "[-–—]";
const SEP = String.raw`(?:,|&|\band\b|\/|;)`;

const NUMBER = String.raw`\d{1,3}`;
const NUMBER_OR_RANGE = String.raw`${NUMBER}(?:\s*${DASH}\s*${NUMBER})?`;

/** Split "3, 4 and 6-7" into numbers and ranges. */
function numberRuns(list: string): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const part of list.split(new RegExp(`\\s*${SEP}\\s*`))) {
    const range = part.trim().match(new RegExp(`^(\\d+)(?:\\s*${DASH}\\s*(\\d+))?$`));
    if (!range) continue;
    const from = Number(range[1]);
    const to = range[2] ? Number(range[2]) : from;
    if (to >= from) runs.push([from, to]);
  }
  return runs;
}

/** Join runs that touch (3, 4 -> 3–4) so "Chapters 3, 4 and 6" is two readings, not three. */
function mergeRuns(runs: Array<[number, number]>): Array<[number, number]> {
  const merged: Array<[number, number]> = [];
  for (const [from, to] of [...runs].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

const CHAPTERS = new RegExp(String.raw`(?<![A-Za-z])(?:chapters?|chaps?\.?|chs?\.?)\s*(${NUMBER_OR_RANGE}(?:\s*${SEP}\s*${NUMBER_OR_RANGE})*)(?![\d.]\d)`, "gi");
const SECTION_NUMBER = String.raw`\d{1,3}\.\d{1,3}(?:\.\d{1,3})?`;
const SECTION_OR_RANGE = String.raw`${SECTION_NUMBER}(?:\s*${DASH}\s*(?:\d{1,3}\.)?\d{1,3}(?:\.\d{1,3})?)?`;
const SECTIONS = new RegExp(String.raw`(?:(?<![A-Za-z])(?:sections?|secs?\.?)\s*|§+\s*)(${SECTION_OR_RANGE}(?:\s*${SEP}\s*${SECTION_OR_RANGE})*)`, "gi");
const PAGES = new RegExp(String.raw`(?<![A-Za-z])(?:pp\.?|p\.|pages?)\s*(\d{1,4}(?:\s*${DASH}\s*\d{1,4})?(?:\s*${SEP}\s*\d{1,4}(?:\s*${DASH}\s*\d{1,4})?)*)`, "gi");

export interface FoundReference {
  reference: ReadingReference;
  index: number;
}

/** Every reading reference in a piece of text, in the order they appear. */
export function findReferences(text: string): FoundReference[] {
  const found: FoundReference[] = [];

  for (const match of text.matchAll(CHAPTERS)) {
    for (const [from, to] of mergeRuns(numberRuns(match[1]))) {
      if (to - from > 60) continue; // "Chapters 1-300" is a page range typo, not chapters
      found.push({ reference: { kind: "chapters", from, to }, index: match.index! });
    }
  }

  for (const match of text.matchAll(SECTIONS)) {
    const chapter = Number(match[1].match(/\d+/)![0]);
    found.push({ reference: { kind: "sections", chapter, text: match[1].replace(/\s+/g, " ").trim() }, index: match.index! });
  }

  for (const match of text.matchAll(PAGES)) {
    for (const [from, to] of mergeRuns(numberRuns(match[1]).filter(([from]) => from >= 1))) {
      found.push({ reference: { kind: "pages", from, to }, index: match.index! });
    }
  }

  return found.sort((a, b) => a.index - b.index);
}

/** Wording for a reference, as the default title of a reading. */
export function referenceTitle(reference: ReadingReference): string {
  switch (reference.kind) {
    case "chapters":
      return reference.from === reference.to ? `Chapter ${reference.from}` : `Chapters ${reference.from}–${reference.to}`;
    case "sections":
      return /[-–—,&]|and/.test(reference.text) ? `Sections ${reference.text}` : `Section ${reference.text}`;
    case "pages": {
      const pages = reference.from === reference.to ? `p. ${reference.from}` : `pp. ${reference.from}–${reference.to}`;
      return reference.chapter !== undefined ? `Chapter ${reference.chapter}, ${pages}` : reference.from === reference.to ? `Page ${reference.from}` : `Pages ${reference.from}–${reference.to}`;
    }
  }
}

/**
 * "Ch. 4, pp. 101–130" is one reading (those pages of chapter 4), not two. Only
 * merged when it's unambiguous: exactly one chapter and one page range.
 */
export function combineChapterAndPages(references: ReadingReference[]): ReadingReference[] {
  const chapters = references.filter((r) => r.kind === "chapters");
  const pages = references.filter((r) => r.kind === "pages");
  if (chapters.length === 1 && pages.length === 1 && references.length === 2) {
    const chapter = chapters[0] as Extract<ReadingReference, { kind: "chapters" }>;
    const range = pages[0] as Extract<ReadingReference, { kind: "pages" }>;
    if (chapter.from === chapter.to) return [{ kind: "pages", from: range.from, to: range.to, chapter: chapter.from }];
  }
  return references;
}
