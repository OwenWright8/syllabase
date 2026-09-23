// Matching a reference from a syllabus ("Chapter 5", "pp. 101–130") to real pages of an uploaded textbook.

import { ReadingReference, referenceTitle } from "./references";

export interface BookChapter {
  number: number | null;
  title: string;
  /** PDF pages. */
  start_page: number;
  end_page: number;
}

export interface Book {
  id: string;
  filename: string;
  pageCount: number;
  /** PDF page = printed page + offset. */
  pageOffset: number;
  chapters: BookChapter[];
}

export interface Resolution {
  bookId: string;
  /** PDF pages to download. */
  start: number;
  end: number;
  /** A good title for the reading ("Chapter 5: Cell Structure"). */
  title: string;
  /** The reading's "pages" text ("Ch. 5 (pp. 101–130)"). */
  pages: string;
  /** Something the user should know before trusting it. */
  note: string | null;
}

const pp = (from: number, to: number) => (from === to ? `p. ${from}` : `pp. ${from}–${to}`);

/** The page numbers the book itself prints, or null if the range starts before its page 1. */
function printedRange(start: number, end: number, offset: number): string | null {
  const from = start - offset;
  const to = end - offset;
  return from >= 1 ? pp(from, to) : null;
}

/** Where `reference` is in `book`, or null if the book doesn't have it. */
export function resolveInBook(reference: ReadingReference, book: Book): Resolution | null {
  switch (reference.kind) {
    case "chapters": {
      const wanted: BookChapter[] = [];
      for (let number = reference.from; number <= reference.to; number++) {
        const chapter = book.chapters.find((c) => c.number === number);
        if (!chapter) return null;
        wanted.push(chapter);
      }
      const start = Math.min(...wanted.map((c) => c.start_page));
      const end = Math.max(...wanted.map((c) => c.end_page));
      const label = reference.from === reference.to ? `Ch. ${reference.from}` : `Ch. ${reference.from}–${reference.to}`;
      const printed = printedRange(start, end, book.pageOffset);
      const title = wanted.length === 1 && wanted[0].title.trim() ? `Chapter ${reference.from}: ${wanted[0].title.trim()}` : referenceTitle(reference);
      return { bookId: book.id, start, end, title, pages: printed ? `${label} (${printed})` : label, note: null };
    }
    case "sections": {
      const chapter = book.chapters.find((c) => c.number === reference.chapter);
      if (!chapter) return null;
      const printed = printedRange(chapter.start_page, chapter.end_page, book.pageOffset);
      return {
        bookId: book.id,
        start: chapter.start_page,
        end: chapter.end_page,
        title: referenceTitle(reference),
        pages: printed ? `Ch. ${reference.chapter} (${printed})` : `Ch. ${reference.chapter}`,
        note: `Sections can't be told apart, so this downloads all of chapter ${reference.chapter}.`,
      };
    }
    case "pages": {
      const start = reference.from + book.pageOffset;
      const end = reference.to + book.pageOffset;
      if (start < 1 || end > book.pageCount) return null;
      return { bookId: book.id, start, end, title: referenceTitle(reference), pages: pp(reference.from, reference.to), note: null };
    }
  }
}

/** The first book that has the reference. */
export function resolveInBooks(reference: ReadingReference, books: Book[]): Resolution | null {
  for (const book of books) {
    const found = resolveInBook(reference, book);
    if (found) return found;
  }
  return null;
}

/** The "pages" text for a reading whose reference matched no book ("Ch. 5", "pp. 101–130"). */
export function plainPagesText(reference: ReadingReference): string {
  switch (reference.kind) {
    case "chapters":
      return reference.from === reference.to ? `Ch. ${reference.from}` : `Ch. ${reference.from}–${reference.to}`;
    case "sections":
      return `Sec. ${reference.text}`;
    case "pages":
      return pp(reference.from, reference.to);
  }
}
