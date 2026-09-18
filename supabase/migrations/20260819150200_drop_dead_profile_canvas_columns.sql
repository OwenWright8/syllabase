-- profiles.canvas_access_token / canvas_domain were superseded by the
-- canvas_accounts table and are no longer read or written by the app.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS canvas_access_token,
  DROP COLUMN IF EXISTS canvas_domain;
