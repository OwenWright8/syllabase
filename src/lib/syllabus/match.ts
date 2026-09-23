// Working out, from a reading's own wording ("Read Chapter 5", "pp. 101–130"),
// which pages of the course's textbook it means: so a reading someone typed in
// by hand can offer the same download as one added from a syllabus.

import { combineChapterAndPages, findReferences } from "./references";
import { Book, Resolution, resolveInBooks } from "./resolve";

/** The pages of the first reference in `text` that one of `books` has, or null. */
export function matchReadingText(text: string, books: Book[]): Resolution | null {
  if (books.length === 0 || !text.trim()) return null;
  const references = combineChapterAndPages(findReferences(text).map((found) => found.reference));
  for (const reference of references) {
    const resolution = resolveInBooks(reference, books);
    if (resolution) return resolution;
  }
  return null;
}
