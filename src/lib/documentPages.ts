// Small pure helpers for textbook chapters and page ranges.

/** Bytes of a finished extract that one extract_piece() call returns (1 MiB once base64-encoded). */
export const PIECE_BYTES = 786432;

export interface ChapterLike {
  number: number | null;
  title: string;
}

/** "Ch. 5: Cell Structure", "Ch. 5", "Cell Structure", or "Untitled" — whatever the chapter has. */
export function chapterLabel(chapter: ChapterLike): string {
  const title = chapter.title.trim();
  if (chapter.number !== null && title) return `Ch. ${chapter.number}: ${title}`;
  if (chapter.number !== null) return `Ch. ${chapter.number}`;
  return title || "Untitled";
}

/** Why this page range can't be used for a book of `pageCount` pages, or null if it can. */
export function rangeProblem(start: number, end: number, pageCount: number): string | null {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return "Enter whole page numbers.";
  if (start < 1) return "Pages start at 1.";
  if (end < start) return "The last page can't be before the first.";
  if (end > pageCount) return `The book only has ${pageCount} page${pageCount === 1 ? "" : "s"}.`;
  return null;
}

/** "pp. 101–130" / "p. 101". */
export function pagesText(start: number, end: number): string {
  return start === end ? `p. ${start}` : `pp. ${start}–${end}`;
}

/** The file name for a downloaded range: safe on every system and recognisable in a downloads folder. */
export function downloadFilename(bookFilename: string, label: string, start: number, end: number): string {
  const clean = (text: string) =>
    text
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .replace(/[^\p{L}\p{N} _.()-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
  const book = clean(bookFilename) || "Textbook";
  const what = clean(label);
  const range = start === end ? `p${start}` : `pp${start}-${end}`;
  return `${[book, what, range].filter(Boolean).join(" - ")}.pdf`;
}

export function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
