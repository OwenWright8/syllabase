// Grading a typed answer against a card. Forgiving by default (case, punctuation,
// accents, small typos), and every part of that can be switched off per deck.

export interface GradingOptions {
  ignoreCase: boolean;
  ignorePunctuation: boolean;
  ignoreAccents: boolean;
  /** Accept small spelling mistakes (about one per six letters). */
  allowTypos: boolean;
  /** For long answers (a definition), accept one that has most of the key words. */
  keywordsForLongAnswers: boolean;
}

export const DEFAULT_GRADING: GradingOptions = {
  ignoreCase: true,
  ignorePunctuation: true,
  ignoreAccents: true,
  allowTypos: true,
  keywordsForLongAnswers: true,
};

export type GradeKind = "exact" | "typo" | "keywords" | "wrong";

export interface Grade {
  correct: boolean;
  kind: GradeKind;
}

/** An answer this long (in words) counts as "long" for keyword grading. */
export const LONG_ANSWER_WORDS = 6;
/** Share of an answer's key words that must be present for keyword grading. */
export const KEYWORD_SHARE = 0.75;

const STOPWORDS = new Set(
  "a an and are as at be been but by for from has have in into is it its of on or that the their them they this to was were which with without".split(" ")
);

export function normalize(text: string, options: GradingOptions): string {
  let s = text.normalize("NFKC");
  if (options.ignoreAccents) s = s.normalize("NFD").replace(/\p{M}/gu, "");
  if (options.ignoreCase) s = s.toLocaleLowerCase();
  if (options.ignorePunctuation) s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * The acceptable answers written on a card: alternatives separated by ";" each
 * count, and text in (parentheses) is optional ("(the) mitochondria").
 */
export function acceptedAnswers(expected: string): string[] {
  const answers = new Set<string>();
  for (const part of expected.split(/\s*;\s*/)) {
    const answer = part.trim();
    if (!answer) continue;
    answers.add(answer);
    if (/\(.*\)/.test(answer)) {
      answers.add(answer.replace(/\s*\([^)]*\)\s*/g, " ").trim()); // without the optional part
      answers.add(answer.replace(/[()]/g, "").trim()); // with it, without the brackets
    }
  }
  return [...answers].filter(Boolean);
}

/** Restricted Damerau-Levenshtein distance (a swap of two letters counts as one mistake). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** How many mistakes a word or phrase of this length can have and still count. */
export function allowedTypos(length: number): number {
  if (length < 4) return 0;
  if (length < 8) return 1;
  if (length < 15) return 2;
  return 3;
}

function closeEnough(given: string, expected: string, options: GradingOptions): boolean {
  if (given === expected) return true;
  if (!options.allowTypos) return false;
  const allowed = allowedTypos(expected.length);
  return allowed > 0 && Math.abs(given.length - expected.length) <= allowed && editDistance(given, expected) <= allowed;
}

function hasMostKeywords(given: string, expected: string, options: GradingOptions): boolean {
  const keywords = [...new Set(expected.split(" ").filter((word) => word.length >= 3 && !STOPWORDS.has(word)))];
  if (keywords.length < 3) return false;
  const givenWords = given.split(" ");
  const found = keywords.filter((keyword) => givenWords.some((word) => closeEnough(word, keyword, options))).length;
  return found / keywords.length >= KEYWORD_SHARE;
}

export function grade(given: string, expected: string, options: GradingOptions = DEFAULT_GRADING): Grade {
  const answer = normalize(given, options);
  if (!answer) return { correct: false, kind: "wrong" };

  const accepted = acceptedAnswers(expected).map((a) => normalize(a, options)).filter(Boolean);
  if (accepted.includes(answer)) return { correct: true, kind: "exact" };
  if (options.allowTypos && accepted.some((a) => closeEnough(answer, a, options))) return { correct: true, kind: "typo" };
  if (options.keywordsForLongAnswers && accepted.some((a) => a.split(" ").length >= LONG_ANSWER_WORDS && hasMostKeywords(answer, a, options))) {
    return { correct: true, kind: "keywords" };
  }
  return { correct: false, kind: "wrong" };
}
