-- API keys for third-party read-only integrations (e.g. a Homepage
-- dashboard Custom API widget). Only the SHA-256 hash of the key is stored;
-- the plaintext key is shown to the user once at creation time and never
-- persisted. The widget-stats edge function looks up a key by its hash
-- using the service role (it has no Supabase session/JWT to authenticate
-- with), so RLS here only needs to protect key *management* by the owning
-- user, not the lookup path itself.
CREATE TABLE public.widget_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.widget_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own widget api keys"
ON public.widget_api_keys
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own widget api keys"
ON public.widget_api_keys
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own widget api keys"
ON public.widget_api_keys
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_widget_api_keys_user_id ON public.widget_api_keys(user_id);
CREATE UNIQUE INDEX idx_widget_api_keys_key_hash ON public.widget_api_keys(key_hash);
