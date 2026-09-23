-- When a class meets. A wall-clock time with no date or zone: it is read in the
-- user's own timezone (profiles.timezone), like the due times it is used to
-- fill in. New assignments for the course default their due time to it. Optional,
-- so existing courses (and anything that doesn't set it) are unaffected.
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS class_time time;
