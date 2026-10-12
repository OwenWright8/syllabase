// Unit tests for flashcard grading, settings, sessions and import (no browser).
import { test, expect } from "@playwright/test";
import {
  DEFAULT_GRADING,
  DEFAULT_SETTINGS,
  acceptedAnswers,
  allowedTypos,
  answerWrite,
  currentQuestion,
  editDistance,
  filterCards,
  grade,
  isFinished,
  makeQuestions,
  overrideLastMiss,
  parseImport,
  readSettings,
  startWrite,
  type StudyCard,
} from "../src/lib/flashcards";

/** A fixed sequence of "random" numbers, repeating. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test.describe("grading", () => {
  test("the same answer, in any case, spacing or punctuation, is correct", () => {
    expect(grade("Mitochondria", "mitochondria")).toEqual({ correct: true, kind: "exact" });
    expect(grade("  the   Krebs cycle. ", "The Krebs cycle")).toEqual({ correct: true, kind: "exact" });
    expect(grade("cafe", "café")).toEqual({ correct: true, kind: "exact" });
    expect(grade("photo-synthesis", "photo synthesis").correct).toBe(true);
  });

  test("a small typo counts, flagged as one; a different word doesn't", () => {
    expect(grade("mitochondira", "mitochondria")).toEqual({ correct: true, kind: "typo" });
    expect(grade("ribosome", "mitochondria")).toEqual({ correct: false, kind: "wrong" });
    expect(grade("cat", "car")).toEqual({ correct: false, kind: "wrong" }); // too short for any typo
  });

  test("how many typos are allowed grows with the length", () => {
    expect([3, 4, 7, 8, 14, 15, 40].map(allowedTypos)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(editDistance("form", "from")).toBe(1); // a swap is one mistake
    expect(editDistance("kitten", "sitting")).toBe(3);
  });

  test("alternatives separated by ';' each count, and (parentheses) are optional", () => {
    expect(acceptedAnswers("car; automobile")).toEqual(["car", "automobile"]);
    expect(grade("automobile", "car; automobile").correct).toBe(true);
    expect(grade("mitochondria", "(the) mitochondria").correct).toBe(true);
    expect(grade("the mitochondria", "(the) mitochondria").correct).toBe(true);
  });

  test("a long answer with most of its key words counts; a vague one doesn't", () => {
    const definition = "The process by which green plants use sunlight to make glucose from carbon dioxide and water";
    expect(grade("plants use sunlight to make glucose from carbon dioxide and water", definition)).toEqual({ correct: true, kind: "keywords" });
    expect(grade("plants make food", definition)).toEqual({ correct: false, kind: "wrong" });
    expect(grade("plants use sunlight to make glucose from carbon dioxide and water", definition, { ...DEFAULT_GRADING, keywordsForLongAnswers: false }).correct).toBe(false);
  });

  test("each forgiving rule can be switched off", () => {
    const strict = { ignoreCase: false, ignorePunctuation: false, ignoreAccents: false, allowTypos: false, keywordsForLongAnswers: false };
    expect(grade("mitochondria", "Mitochondria", strict).correct).toBe(false);
    expect(grade("Mitochondria.", "Mitochondria", strict).correct).toBe(false);
    expect(grade("cafe", "café", strict).correct).toBe(false);
    expect(grade("Mitochondira", "Mitochondria", strict).correct).toBe(false);
    expect(grade(" Mitochondria ", "Mitochondria", strict).correct).toBe(true); // surrounding spaces never matter
  });

  test("an empty answer is wrong", () => {
    expect(grade("   ", "anything")).toEqual({ correct: false, kind: "wrong" });
    expect(grade("...", "anything")).toEqual({ correct: false, kind: "wrong" });
  });
});

test.describe("stored settings", () => {
  test("nothing stored means the defaults", () => {
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(readSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
  });

  test("valid values are kept, invalid ones fall back one by one", () => {
    const read = readSettings({
      grading: { ignoreCase: false, allowTypos: "yes" },
      write: { answerWith: "definition", filter: "bogus" },
      test: { questionCount: null, shuffle: false },
      flashcards: { front: "definition" },
    });
    expect(read.grading.ignoreCase).toBe(false);
    expect(read.grading.allowTypos).toBe(true);
    expect(read.write).toEqual({ answerWith: "definition", shuffle: true, filter: "all" });
    expect(read.test).toEqual({ answerWith: "term", shuffle: false, filter: "all", questionCount: null });
    expect(read.flashcards.front).toBe("definition");
    expect(readSettings({ test: { questionCount: 0 } }).test.questionCount).toBe(20);
    expect(readSettings({ test: { questionCount: 2.5 } }).test.questionCount).toBe(20);
  });
});

const CARDS: StudyCard[] = [
  { id: "a", term: "A", definition: "alpha", starred: true, known: false },
  { id: "b", term: "B", definition: "bravo", starred: false, known: true },
  { id: "c", term: "C", definition: "charlie", starred: true, known: true },
  { id: "d", term: "D", definition: "delta", starred: false, known: false },
];

test.describe("choosing questions", () => {
  test("filters", () => {
    expect(filterCards(CARDS, "starred").map((c) => c.id)).toEqual(["a", "c"]);
    expect(filterCards(CARDS, "unknown").map((c) => c.id)).toEqual(["a", "d"]);
    expect(filterCards(CARDS, "all")).toHaveLength(4);
  });

  test("answering with the term shows the definition, and the other way round", () => {
    const [q] = makeQuestions(CARDS, { answerWith: "term", filter: "all", shuffle: false });
    expect([q.prompt, q.expected, q.answerSide]).toEqual(["alpha", "A", "term"]);
    const [r] = makeQuestions(CARDS, { answerWith: "definition", filter: "all", shuffle: false });
    expect([r.prompt, r.expected, r.answerSide]).toEqual(["A", "alpha", "definition"]);
  });

  test("'both' mixes the two sides", () => {
    const sides = makeQuestions(CARDS, { answerWith: "both", filter: "all", shuffle: false }, seq(0.1, 0.9)).map((q) => q.answerSide);
    expect(sides).toEqual(["term", "definition", "term", "definition"]);
  });

  test("order is kept unless shuffled, and a limit takes the first N", () => {
    expect(makeQuestions(CARDS, { answerWith: "term", filter: "all", shuffle: false, limit: 2 }).map((q) => q.card.id)).toEqual(["a", "b"]);
    const order = makeQuestions(CARDS, { answerWith: "term", filter: "all", shuffle: true }, seq(0)).map((q) => q.card.id);
    expect(order).not.toEqual(["a", "b", "c", "d"]);
    expect([...order].sort()).toEqual(["a", "b", "c", "d"]);
  });
});

test.describe("write mode rounds", () => {
  const start = () => startWrite(makeQuestions(CARDS.slice(0, 3), { answerWith: "term", filter: "all", shuffle: false }), "term");

  test("all right first time: one round and done", () => {
    let s = start();
    for (let i = 0; i < 3; i++) s = answerWrite(s, true);
    expect(isFinished(s)).toBe(true);
    expect([s.round, s.done, s.everMissed]).toEqual([1, ["a", "b", "c"], []]);
  });

  test("a miss comes back next round until it's right", () => {
    let s = start();
    s = answerWrite(s, false); // a
    s = answerWrite(s, true); // b
    s = answerWrite(s, true); // c -> round 2 with a
    expect(s.round).toBe(2);
    expect(currentQuestion(s)?.card.id).toBe("a");
    s = answerWrite(s, false); // a again -> round 3
    expect(s.round).toBe(3);
    s = answerWrite(s, true);
    expect(isFinished(s)).toBe(true);
    expect(s.everMissed).toEqual(["a"]);
    expect(s.done.sort()).toEqual(["a", "b", "c"]);
  });

  test("'I was right' undoes a miss, mid-round or at the end of a round", () => {
    let s = start();
    s = answerWrite(s, false); // a missed, mid-round
    s = overrideLastMiss(s, "a");
    expect(s.missed).toEqual([]);
    expect(s.done).toEqual(["a"]);
    expect(s.everMissed).toEqual([]);

    let t = start();
    t = answerWrite(t, true);
    t = answerWrite(t, true);
    t = answerWrite(t, false); // c missed last -> already queued for round 2
    expect(t.round).toBe(2);
    t = overrideLastMiss(t, "c");
    expect(isFinished(t)).toBe(true);
    expect(t.everMissed).toEqual([]);
  });
});

test.describe("importing pasted cards", () => {
  test("Quizlet's export: tab between, one card per line", () => {
    expect(parseImport("cell\tthe basic unit of life\nATP\tenergy currency\n")).toEqual({
      cards: [
        { term: "cell", definition: "the basic unit of life" },
        { term: "ATP", definition: "energy currency" },
      ],
      skipped: [],
    });
  });

  test("other separators, including custom ones", () => {
    expect(parseImport("a, b; c, d", { between: "comma", cards: "semicolon" }).cards).toEqual([{ term: "a", definition: "b" }, { term: "c", definition: "d" }]);
    expect(parseImport("x - one - more\ny - two", { between: "dash", cards: "newline" }).cards).toEqual([{ term: "x", definition: "one - more" }, { term: "y", definition: "two" }]);
    expect(parseImport("t1 :: d1 || t2 :: d2", { between: "custom", betweenCustom: "::", cards: "custom", cardsCustom: "||" }).cards).toEqual([{ term: "t1", definition: "d1" }, { term: "t2", definition: "d2" }]);
    expect(parseImport("term\nspans lines?\n\nother\tdef", { between: "tab", cards: "blank-line" }).cards).toEqual([{ term: "other", definition: "def" }]);
  });

  test("lines without a separator, or with an empty side, are reported, not imported", () => {
    const result = parseImport("good\tcard\njust a heading\n\tno term\nno definition\t\n\r\n");
    expect(result.cards).toEqual([{ term: "good", definition: "card" }]);
    expect(result.skipped).toEqual(["just a heading", "no term", "no definition"]);
  });

  test("Windows line endings work", () => {
    expect(parseImport("a\tb\r\nc\td\r\n").cards).toHaveLength(2);
  });
});
