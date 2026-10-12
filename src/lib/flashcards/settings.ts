// Study options, stored per deck (flashcard_decks.settings) so a deck remembers
// how you like to study it. Anything missing or malformed falls back to a default.

import { DEFAULT_GRADING, GradingOptions } from "./grade";

/** Which side you have to come up with: "term" means you're shown the definition. */
export type AnswerWith = "term" | "definition" | "both";
/** Which cards to study. "unknown" = the ones you didn't know last time. */
export type CardFilter = "all" | "starred" | "unknown";

export interface DeckSettings {
  grading: GradingOptions;
  flashcards: { front: "term" | "definition"; shuffle: boolean; filter: CardFilter };
  write: { answerWith: AnswerWith; shuffle: boolean; filter: CardFilter };
  /** questionCount: null = every card. */
  test: { answerWith: AnswerWith; shuffle: boolean; filter: CardFilter; questionCount: number | null };
}

export const DEFAULT_SETTINGS: DeckSettings = {
  grading: DEFAULT_GRADING,
  flashcards: { front: "term", shuffle: false, filter: "all" },
  write: { answerWith: "term", shuffle: true, filter: "all" },
  test: { answerWith: "term", shuffle: true, filter: "all", questionCount: 20 },
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const pick = <T,>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

const FILTERS = ["all", "starred", "unknown"] as const;
const ANSWER_WITH = ["term", "definition", "both"] as const;

/** Read stored settings (whatever shape they are in) into a complete DeckSettings. */
export function readSettings(stored: unknown): DeckSettings {
  const s = isObject(stored) ? stored : {};
  const grading = isObject(s.grading) ? s.grading : {};
  const flashcards = isObject(s.flashcards) ? s.flashcards : {};
  const write = isObject(s.write) ? s.write : {};
  const test = isObject(s.test) ? s.test : {};
  const count = test.questionCount;
  return {
    grading: {
      ignoreCase: bool(grading.ignoreCase, DEFAULT_GRADING.ignoreCase),
      ignorePunctuation: bool(grading.ignorePunctuation, DEFAULT_GRADING.ignorePunctuation),
      ignoreAccents: bool(grading.ignoreAccents, DEFAULT_GRADING.ignoreAccents),
      allowTypos: bool(grading.allowTypos, DEFAULT_GRADING.allowTypos),
      keywordsForLongAnswers: bool(grading.keywordsForLongAnswers, DEFAULT_GRADING.keywordsForLongAnswers),
    },
    flashcards: {
      front: pick(flashcards.front, ["term", "definition"] as const, DEFAULT_SETTINGS.flashcards.front),
      shuffle: bool(flashcards.shuffle, DEFAULT_SETTINGS.flashcards.shuffle),
      filter: pick(flashcards.filter, FILTERS, DEFAULT_SETTINGS.flashcards.filter),
    },
    write: {
      answerWith: pick(write.answerWith, ANSWER_WITH, DEFAULT_SETTINGS.write.answerWith),
      shuffle: bool(write.shuffle, DEFAULT_SETTINGS.write.shuffle),
      filter: pick(write.filter, FILTERS, DEFAULT_SETTINGS.write.filter),
    },
    test: {
      answerWith: pick(test.answerWith, ANSWER_WITH, DEFAULT_SETTINGS.test.answerWith),
      shuffle: bool(test.shuffle, DEFAULT_SETTINGS.test.shuffle),
      filter: pick(test.filter, FILTERS, DEFAULT_SETTINGS.test.filter),
      questionCount:
        count === null ? null : typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= 5000 ? count : DEFAULT_SETTINGS.test.questionCount,
    },
  };
}
