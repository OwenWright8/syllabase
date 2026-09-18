-- Add color_theme column to profiles table
ALTER TABLE public.profiles
ADD COLUMN color_theme TEXT DEFAULT 'purple';