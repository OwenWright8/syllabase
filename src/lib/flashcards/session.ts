// Turning a deck into a study session: which cards, in what order, which side is
// asked, and (for Write) the rounds that bring back what you got wrong.

import { AnswerWith, CardFilter } from "./settings";

export interface StudyCard {
  id: string;
  term: string;
  definition: string;
  starred: boolean;
  known: boolean;
}

export interface Question {
  card: StudyCard;
  /** Which side you must type. */
  answerSide: "term" | "definition";
  prompt: string;
  expected: string;
}

export type Random = () => number;

export function filterCards(cards: StudyCard[], filter: CardFilter): StudyCard[] {
  if (filter === "starred") return cards.filter((card) => card.starred);
  if (filter === "unknown") return cards.filter((card) => !card.known);
  return cards;
}

/** Fisher-Yates, with the random source passed in so tests can fix it. */
export function shuffled<T>(items: T[], random: Random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function makeQuestion(card: StudyCard, answerWith: AnswerWith, random: Random = Math.random): Question {
  const answerSide = answerWith === "both" ? (random() < 0.5 ? "term" : "definition") : answerWith;
  return answerSide === "term"
    ? { card, answerSide, prompt: card.definition, expected: card.term }
    : { card, answerSide, prompt: card.term, expected: card.definition };
}

export interface QuestionOptions {
  answerWith: AnswerWith;
  filter: CardFilter;
  shuffle: boolean;
  /** At most this many (null = all). */
  limit?: number | null;
}

export function makeQuestions(cards: StudyCard[], options: QuestionOptions, random: Random = Math.random): Question[] {
  const chosen = filterCards(cards, options.filter);
  const ordered = options.shuffle ? shuffled(chosen, random) : chosen;
  const limited = options.limit ? ordered.slice(0, options.limit) : ordered;
  return limited.map((card) => makeQuestion(card, options.answerWith, random));
}

// --- Write mode: rounds until every card has been answered correctly ------------

export interface WriteSession {
  round: number;
  /** Still to answer this round, in order. */
  queue: Question[];
  /** Missed this round: they come back next round. */
  missed: Question[];
  /** Cards answered correctly (in any round). */
  done: string[];
  /** Cards missed at least once, ever. */
  everMissed: string[];
  total: number;
  answerWith: AnswerWith;
}

export function startWrite(questions: Question[], answerWith: AnswerWith): WriteSession {
  return { round: 1, queue: questions, missed: [], done: [], everMissed: [], total: questions.length, answerWith };
}

export const currentQuestion = (session: WriteSession): Question | null => session.queue[0] ?? null;
export const isFinished = (session: WriteSession) => session.queue.length === 0 && session.missed.length === 0;

/** Record the answer to the current question and move on (to the next round when this one is used up). */
export function answerWrite(session: WriteSession, correct: boolean, random: Random = Math.random): WriteSession {
  const [question, ...rest] = session.queue;
  if (!question) return session;
  const id = question.card.id;
  let next: WriteSession = correct
    ? { ...session, queue: rest, done: [...session.done, id] }
    : {
        ...session,
        queue: rest,
        missed: [...session.missed, question],
        everMissed: session.everMissed.includes(id) ? session.everMissed : [...session.everMissed, id],
      };
  if (next.queue.length === 0 && next.missed.length > 0) {
    // Next round: the misses again, in a new order, re-asking which side if "both".
    next = {
      ...next,
      round: next.round + 1,
      queue: shuffled(next.missed, random).map((q) => makeQuestion(q.card, next.answerWith, random)),
      missed: [],
    };
  }
  return next;
}

/**
 * Undo a wrong verdict ("I was right"): the question that was just recorded as
 * missed counts as correct after all. Only valid straight after answering it.
 */
export function overrideLastMiss(session: WriteSession, cardId: string): WriteSession {
  const inMissed = session.missed.findIndex((q) => q.card.id === cardId);
  const inQueue = session.queue.findIndex((q) => q.card.id === cardId);
  const firstTime = !session.done.includes(cardId);
  const withoutEver = session.everMissed.filter((id) => id !== cardId);
  if (inMissed >= 0) {
    return { ...session, missed: session.missed.filter((_, i) => i !== inMissed), done: firstTime ? [...session.done, cardId] : session.done, everMissed: withoutEver };
  }
  if (inQueue >= 0) {
    // The miss started a new round, so the card is already queued again.
    return { ...session, queue: session.queue.filter((_, i) => i !== inQueue), done: firstTime ? [...session.done, cardId] : session.done, everMissed: withoutEver };
  }
  return session;
}
