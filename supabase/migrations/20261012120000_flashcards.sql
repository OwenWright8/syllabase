-- Flashcards: decks of term/definition cards, optionally tied to a course and to
-- an exam and/or a quiz they help you study for, plus the results of tests taken
-- on them. (An early version of the app had flashcard tables that were dropped;
-- these are new, with the same table name for decks.)
--
-- Everything is per user under row level security, like the rest of the app.
-- Sign-up is open, so the sizes are bounded here rather than only in the UI.

CREATE TABLE public.flashcard_decks (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- All optional: a deck can stand alone. Deleting the course/exam/quiz keeps the deck.
  course_id   uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  exam_id     uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  quiz_id     uuid REFERENCES public.quizzes(id) ON DELETE SET NULL,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  -- The study options last used with this deck (which side to answer with, how
  -- strictly to grade, ...). Shaped and defaulted by the app.
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(settings) = 'object' AND pg_column_size(settings) <= 8192),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_flashcard_decks_user ON public.flashcard_decks (user_id);
CREATE INDEX idx_flashcard_decks_exam ON public.flashcard_decks (exam_id) WHERE exam_id IS NOT NULL;
CREATE INDEX idx_flashcard_decks_quiz ON public.flashcard_decks (quiz_id) WHERE quiz_id IS NOT NULL;

CREATE TRIGGER update_flashcard_decks_updated_at
  BEFORE UPDATE ON public.flashcard_decks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.flashcards (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id     uuid NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term        text NOT NULL CHECK (char_length(btrim(term)) BETWEEN 1 AND 1000),
  definition  text NOT NULL CHECK (char_length(btrim(definition)) BETWEEN 1 AND 4000),
  position    integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  starred     boolean NOT NULL DEFAULT false,
  -- Whether you knew it the last time it came up (flashcards, write or test).
  known       boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_flashcards_deck ON public.flashcards (deck_id, position);

CREATE TRIGGER update_flashcards_updated_at
  BEFORE UPDATE ON public.flashcards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.flashcard_test_results (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id     uuid NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total       integer NOT NULL CHECK (total BETWEEN 1 AND 5000),
  correct     integer NOT NULL CHECK (correct >= 0),
  -- [{ card_id, prompt, expected, given, correct }] so a past test can be reviewed.
  answers     jsonb NOT NULL DEFAULT '[]'::jsonb
                CHECK (jsonb_typeof(answers) = 'array' AND pg_column_size(answers) <= 2097152),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (correct <= total)
);
CREATE INDEX idx_flashcard_test_results_deck ON public.flashcard_test_results (deck_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Row level security. A deck may only point at the user's own course, exam and
-- quiz (the subqueries run under the caller's RLS, so someone else's id finds
-- nothing); cards and results only go into the user's own decks.
-- ---------------------------------------------------------------------------
ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own decks" ON public.flashcard_decks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own decks" ON public.flashcard_decks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own decks" ON public.flashcard_decks
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND (course_id IS NULL OR EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.user_id = auth.uid()))
    AND (exam_id IS NULL OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.user_id = auth.uid()))
    AND (quiz_id IS NULL OR EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.user_id = auth.uid()))
  );
CREATE POLICY "Users can edit their own decks" ON public.flashcard_decks
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (course_id IS NULL OR EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.user_id = auth.uid()))
    AND (exam_id IS NULL OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.user_id = auth.uid()))
    AND (quiz_id IS NULL OR EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.user_id = auth.uid()))
  );

CREATE POLICY "Users can view their own cards" ON public.flashcards
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cards" ON public.flashcards
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can add cards to their own decks" ON public.flashcards
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.flashcard_decks d WHERE d.id = deck_id AND d.user_id = auth.uid())
  );
CREATE POLICY "Users can edit their own cards" ON public.flashcards
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.flashcard_decks d WHERE d.id = deck_id AND d.user_id = auth.uid())
  );

CREATE POLICY "Users can view their own test results" ON public.flashcard_test_results
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own test results" ON public.flashcard_test_results
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can save results for their own decks" ON public.flashcard_test_results
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.flashcard_decks d WHERE d.id = deck_id AND d.user_id = auth.uid())
  );
CREATE POLICY "Users can correct their own test results" ON public.flashcard_test_results
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.flashcard_decks, public.flashcards, public.flashcard_test_results FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcard_decks, public.flashcards, public.flashcard_test_results TO authenticated;

-- ---------------------------------------------------------------------------
-- Size bounds (open sign-up): decks per user, cards per deck, results kept per
-- deck. Only a signed-in user's writes are counted.
-- ---------------------------------------------------------------------------
-- (One function per table: PL/pgSQL can't mention NEW.deck_id in a function
-- that also runs for decks, which have no such column, even in a branch that
-- isn't taken.)
CREATE OR REPLACE FUNCTION public.limit_flashcard_decks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND (SELECT count(*) FROM public.flashcard_decks d WHERE d.user_id = NEW.user_id) >= 1000 THEN
    RAISE EXCEPTION 'You can have at most 1000 flashcard decks.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.limit_flashcards()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND (SELECT count(*) FROM public.flashcards c WHERE c.deck_id = NEW.deck_id) >= 5000 THEN
    RAISE EXCEPTION 'A deck can have at most 5000 cards.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER limit_flashcard_decks BEFORE INSERT ON public.flashcard_decks
  FOR EACH ROW EXECUTE FUNCTION public.limit_flashcard_decks();
CREATE TRIGGER limit_flashcards BEFORE INSERT ON public.flashcards
  FOR EACH ROW EXECUTE FUNCTION public.limit_flashcards();

-- Keep the 50 most recent test results per deck.
CREATE OR REPLACE FUNCTION public.trim_flashcard_test_results()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.flashcard_test_results r
   WHERE r.deck_id = NEW.deck_id
     AND r.id IN (SELECT id FROM public.flashcard_test_results
                   WHERE deck_id = NEW.deck_id
                   ORDER BY created_at DESC, id DESC
                   OFFSET 50);
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trim_flashcard_test_results() FROM PUBLIC;

CREATE TRIGGER trim_flashcard_test_results AFTER INSERT ON public.flashcard_test_results
  FOR EACH ROW EXECUTE FUNCTION public.trim_flashcard_test_results();
