-- Quizzes: lighter-weight sibling of exams, addable from the Exams page.
CREATE TABLE public.quizzes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  quiz_at TIMESTAMP WITH TIME ZONE NOT NULL,
  topics TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quizzes"
  ON public.quizzes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own quizzes"
  ON public.quizzes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quizzes"
  ON public.quizzes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own quizzes"
  ON public.quizzes FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_quizzes_user_course ON public.quizzes(user_id, course_id);
CREATE INDEX idx_quizzes_quiz_at ON public.quizzes(user_id, quiz_at);

-- Study items: things the user knows they need to study for, optionally
-- tied to a specific exam or quiz (or freestanding, e.g. general review).
CREATE TABLE public.study_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  completed_at TIMESTAMP WITH TIME ZONE,
  -- Day planner scheduling, same shape as tasks.work_date / readings.planned_date.
  planned_date DATE,
  plan_order INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.study_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own study items"
  ON public.study_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own study items"
  ON public.study_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own study items"
  ON public.study_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own study items"
  ON public.study_items FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_study_items_user_course ON public.study_items(user_id, course_id);
CREATE INDEX idx_study_items_exam ON public.study_items(exam_id);
CREATE INDEX idx_study_items_quiz ON public.study_items(quiz_id);
CREATE INDEX idx_study_items_planned_date ON public.study_items(user_id, planned_date);

CREATE TRIGGER update_study_items_updated_at
  BEFORE UPDATE ON public.study_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Day planner scheduling for tasks and readings. tasks.work_date already
-- exists and doubles as "planned date"; readings needs an equivalent
-- column since due_date means something different (when it's owed, not
-- when the user intends to work on it).
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS plan_order INTEGER;
ALTER TABLE public.readings ADD COLUMN IF NOT EXISTS planned_date DATE;
ALTER TABLE public.readings ADD COLUMN IF NOT EXISTS plan_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_readings_planned_date ON public.readings(user_id, planned_date);
