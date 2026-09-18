-- Add timezone column to profiles table
ALTER TABLE public.profiles
ADD COLUMN timezone TEXT DEFAULT 'America/New_York';

-- Remove display_name column from profiles table
ALTER TABLE public.profiles
DROP COLUMN display_name;