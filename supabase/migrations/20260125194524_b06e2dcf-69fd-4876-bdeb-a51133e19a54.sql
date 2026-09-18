-- Create canvas_accounts table for multiple school support
CREATE TABLE public.canvas_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  canvas_url TEXT NOT NULL,
  access_token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.canvas_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own canvas accounts"
ON public.canvas_accounts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own canvas accounts"
ON public.canvas_accounts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own canvas accounts"
ON public.canvas_accounts
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own canvas accounts"
ON public.canvas_accounts
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_canvas_accounts_user_id ON public.canvas_accounts(user_id);