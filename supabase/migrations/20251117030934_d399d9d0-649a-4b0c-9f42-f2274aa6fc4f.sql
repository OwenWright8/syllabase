-- Fix task status constraint to match the application logic
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks 
  ADD CONSTRAINT tasks_status_check 
  CHECK (status IN ('not_started', 'in_progress', 'done'));

-- Update default value
ALTER TABLE public.tasks 
  ALTER COLUMN status SET DEFAULT 'not_started';

-- Fix task type constraint to include all types used in the app
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;

ALTER TABLE public.tasks 
  ADD CONSTRAINT tasks_type_check 
  CHECK (type IN ('assignment', 'homework', 'reading', 'lab', 'project', 'exam_prep', 'quiz', 'quiz_prep', 'study', 'other'));

-- Update profiles table to include email column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index on work_date for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_work_date ON public.tasks(work_date);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON public.tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_exams_exam_at ON public.exams(exam_at);

-- Update function to also set email on profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (new.id, new.raw_user_meta_data->>'display_name', new.email);
  RETURN new;
END;
$$;