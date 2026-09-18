-- Add display_name column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN display_name text;