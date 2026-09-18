-- Each user registers their own free Pushover application (at
-- pushover.net/apps/build) rather than sharing one app-level token owned
-- by whoever deployed this instance — this app has no single operator who
-- should be the sole Pushover developer of record for every user's pushes.
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS pushover_app_token TEXT;
