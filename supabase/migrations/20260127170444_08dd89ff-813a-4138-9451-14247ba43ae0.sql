-- Create readings table for tracking assigned readings
CREATE TABLE public.readings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  pages TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done')),
  completed_at TIMESTAMP WITH TIME ZONE,
  -- Optional links
  flashcard_deck_id UUID REFERENCES public.flashcard_decks(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own readings"
  ON public.readings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own readings"
  ON public.readings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own readings"
  ON public.readings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own readings"
  ON public.readings FOR DELETE
  USING (auth.uid() = user_id);

-- Index for common queries
CREATE INDEX idx_readings_user_course ON public.readings(user_id, course_id);
CREATE INDEX idx_readings_due_date ON public.readings(user_id, due_date);
CREATE INDEX idx_readings_status ON public.readings(user_id, status);

-- Trigger for updated_at
CREATE TRIGGER update_readings_updated_at
  BEFORE UPDATE ON public.readings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();