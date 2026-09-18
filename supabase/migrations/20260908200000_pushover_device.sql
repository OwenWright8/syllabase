-- Optional Pushover device name, so notifications can target one specific
-- device (e.g. "iphone") instead of every device registered under the
-- user's key. Left null, Pushover delivers to all of them as before.
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS pushover_device TEXT;
