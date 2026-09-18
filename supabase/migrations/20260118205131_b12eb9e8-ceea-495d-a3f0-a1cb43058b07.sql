-- Add notification settings columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS notifications_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_time text DEFAULT '08:00';