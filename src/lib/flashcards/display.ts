import { format, parseISO } from "date-fns";

/** "For Midterm 1 (Oct 25)" / "For Midterm 1 (Oct 25) and Quiz 3 (Oct 11)", or null if the deck isn't linked. */
export function deckLinkText(deck: { exam: { title: string; exam_at: string } | null; quiz: { title: string; quiz_at: string } | null }): string | null {
  const parts = [
    deck.exam ? `${deck.exam.title} (${format(parseISO(deck.exam.exam_at), "MMM d")})` : null,
    deck.quiz ? `${deck.quiz.title} (${format(parseISO(deck.quiz.quiz_at), "MMM d")})` : null,
  ].filter(Boolean);
  return parts.length ? `For ${parts.join(" and ")}` : null;
}

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export const sideName = (side: "term" | "definition") => (side === "term" ? "term" : "definition");
