-- Add Canvas integration fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS canvas_domain TEXT,
ADD COLUMN IF NOT EXISTS canvas_access_token TEXT;