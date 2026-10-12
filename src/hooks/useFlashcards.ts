import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Json } from "@/integrations/supabase/types";
import { DeckSettings, readSettings } from "@/lib/flashcards";

export interface Flashcard {
  id: string;
  deck_id: string;
  term: string;
  definition: string;
  position: number;
  starred: boolean;
  known: boolean;
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  course_id: string | null;
  exam_id: string | null;
  quiz_id: string | null;
  settings: DeckSettings;
  created_at: string;
  updated_at: string;
  course: { id: string; name: string; short_code: string; color: string } | null;
  exam: { id: string; title: string; exam_at: string } | null;
  quiz: { id: string; title: string; quiz_at: string } | null;
}

export interface DeckSummary extends Deck {
  cardCount: number;
  knownCount: number;
}

export interface TestAnswer {
  card_id: string;
  prompt: string;
  expected: string;
  given: string;
  correct: boolean;
}

export interface TestResult {
  id: string;
  deck_id: string;
  total: number;
  correct: number;
  answers: TestAnswer[];
  created_at: string;
}

export const flashcardKeys = {
  // Everything flashcard-related for a user: invalidating this refreshes it all.
  all: (userId: string) => ["flashcards", userId] as const,
  decks: (userId: string) => ["flashcards", userId, "decks"] as const,
  deck: (userId: string, deckId: string) => ["flashcards", userId, "deck", deckId] as const,
  results: (userId: string, deckId: string) => ["flashcards", userId, "results", deckId] as const,
};

const DECK_COLUMNS = `*, course:courses (id, name, short_code, color), exam:exams (id, title, exam_at), quiz:quizzes (id, title, quiz_at)`;
const CARD_COLUMNS = "id, deck_id, term, definition, position, starred, known";

const first = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDeck(row: any): Deck {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    course_id: row.course_id ?? null,
    exam_id: row.exam_id ?? null,
    quiz_id: row.quiz_id ?? null,
    settings: readSettings(row.settings),
    created_at: row.created_at,
    updated_at: row.updated_at,
    course: first(row.course),
    exam: first(row.exam),
    quiz: first(row.quiz),
  };
}

function useInvalidate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return () => {
    if (user) queryClient.invalidateQueries({ queryKey: flashcardKeys.all(user.id) });
  };
}

/** Every deck, with how many cards it has and how many you know. */
export function useDecks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: flashcardKeys.decks(user?.id ?? ""),
    queryFn: async (): Promise<DeckSummary[]> => {
      const [decks, cards] = await Promise.all([
        supabase.from("flashcard_decks").select(DECK_COLUMNS).eq("user_id", user!.id).order("updated_at", { ascending: false }),
        supabase.from("flashcards").select("deck_id, known").eq("user_id", user!.id),
      ]);
      if (decks.error) throw decks.error;
      if (cards.error) throw cards.error;
      const counts = new Map<string, { cards: number; known: number }>();
      for (const card of cards.data ?? []) {
        const count = counts.get(card.deck_id) ?? { cards: 0, known: 0 };
        count.cards += 1;
        if (card.known) count.known += 1;
        counts.set(card.deck_id, count);
      }
      return (decks.data ?? []).map((row) => {
        const deck = toDeck(row);
        const count = counts.get(deck.id);
        return { ...deck, cardCount: count?.cards ?? 0, knownCount: count?.known ?? 0 };
      });
    },
    enabled: !!user,
  });
}

/** One deck and its cards, in order. `deck` is null if it doesn't exist (or isn't yours). */
export function useDeck(deckId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: flashcardKeys.deck(user?.id ?? "", deckId ?? ""),
    queryFn: async (): Promise<{ deck: Deck | null; cards: Flashcard[] }> => {
      const [deck, cards] = await Promise.all([
        supabase.from("flashcard_decks").select(DECK_COLUMNS).eq("id", deckId!).maybeSingle(),
        supabase.from("flashcards").select(CARD_COLUMNS).eq("deck_id", deckId!).order("position", { ascending: true }),
      ]);
      if (deck.error) throw deck.error;
      if (cards.error) throw cards.error;
      return { deck: deck.data ? toDeck(deck.data) : null, cards: (cards.data ?? []) as Flashcard[] };
    },
    enabled: !!user && !!deckId,
  });
}

export interface DeckFields {
  title: string;
  description: string;
  course_id: string | null;
  exam_id: string | null;
  quiz_id: string | null;
}

/** A card as the editor holds it: no id yet for a new one. */
export interface CardDraft {
  id?: string;
  term: string;
  definition: string;
  starred: boolean;
}

/**
 * Save a deck and its cards as the editor shows them: cards that were removed are
 * deleted, the rest are written in the order shown. Returns the deck's id.
 */
export function useSaveDeck() {
  const { user } = useAuth();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async ({ deckId, fields, cards, removedIds }: { deckId?: string; fields: DeckFields; cards: CardDraft[]; removedIds: string[] }) => {
      const row = { ...fields, title: fields.title.trim(), description: fields.description.trim() };
      let id = deckId;
      if (id) {
        const { error } = await supabase.from("flashcard_decks").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("flashcard_decks").insert({ ...row, user_id: user!.id }).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }

      if (removedIds.length) {
        const { error } = await supabase.from("flashcards").delete().in("id", removedIds);
        if (error) throw error;
      }

      const rows = cards.map((card, position) => ({
        ...(card.id ? { id: card.id } : {}),
        deck_id: id!,
        user_id: user!.id,
        term: card.term.trim(),
        definition: card.definition.trim(),
        starred: card.starred,
        position,
      }));
      const existing = rows.filter((r) => "id" in r);
      const added = rows.filter((r) => !("id" in r));
      if (existing.length) {
        const { error } = await supabase.from("flashcards").upsert(existing, { onConflict: "id" });
        if (error) throw error;
      }
      if (added.length) {
        const { error } = await supabase.from("flashcards").insert(added);
        if (error) throw error;
      }
      return id!;
    },
    onSettled: invalidate,
  });
}

export function useDeleteDeck() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (deckId: string) => {
      const { error } = await supabase.from("flashcard_decks").delete().eq("id", deckId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Remember the study options used with a deck. */
export function useSaveDeckSettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ deckId, settings }: { deckId: string; settings: DeckSettings }) => {
      const { error } = await supabase
        .from("flashcard_decks")
        .update({ settings: settings as unknown as Json })
        .eq("id", deckId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useToggleStar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId, starred }: { cardId: string; starred: boolean }) => {
      const { error } = await supabase.from("flashcards").update({ starred }).eq("id", cardId);
      if (error) throw error;
    },
    // Instant in every cached deck, put back if the server refuses.
    onMutate: async ({ cardId, starred }) => {
      if (!user) return;
      const key = flashcardKeys.all(user.id);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueriesData({ queryKey: key });
      queryClient.setQueriesData<{ deck: Deck | null; cards: Flashcard[] }>({ queryKey: [...key, "deck"] }, (data) =>
        data ? { ...data, cards: data.cards.map((c) => (c.id === cardId ? { ...c, starred } : c)) } : data
      );
      return { snapshot };
    },
    onError: (_e, _v, context) => context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data)),
    onSettled: () => {
      if (user) queryClient.invalidateQueries({ queryKey: flashcardKeys.all(user.id) });
    },
  });
}

/** Record which cards you knew (true) or didn't (false) this time. */
export function useSetKnown() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (known: Record<string, boolean>) => {
      const ids = (value: boolean) => Object.keys(known).filter((id) => known[id] === value);
      for (const value of [true, false]) {
        const list = ids(value);
        if (!list.length) continue;
        const { error } = await supabase.from("flashcards").update({ known: value }).in("id", list);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });
}

export function useTestResults(deckId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: flashcardKeys.results(user?.id ?? "", deckId ?? ""),
    queryFn: async (): Promise<TestResult[]> => {
      const { data, error } = await supabase
        .from("flashcard_test_results")
        .select("id, deck_id, total, correct, answers, created_at")
        .eq("deck_id", deckId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, answers: (Array.isArray(row.answers) ? row.answers : []) as unknown as TestAnswer[] }));
    },
    enabled: !!user && !!deckId,
  });
}

/** Save a finished test (or, with `id`, correct its grading after review). Returns the result's id. */
export function useSaveTestResult() {
  const { user } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, deckId, answers }: { id?: string; deckId: string; answers: TestAnswer[] }) => {
      const row = { total: answers.length, correct: answers.filter((a) => a.correct).length, answers: answers as unknown as Json };
      if (id) {
        const { error } = await supabase.from("flashcard_test_results").update(row).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from("flashcard_test_results").insert({ ...row, deck_id: deckId, user_id: user!.id }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });
}
