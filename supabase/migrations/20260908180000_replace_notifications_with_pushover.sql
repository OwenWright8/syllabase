-- Replaces the old browser-Notification-API system (which only fired while
-- a tab was open) with server-side push via Pushover, so notifications
-- arrive on the user's phone/desktop whether or not the app is open. The
-- actual sending happens in the send-notifications edge function on a
-- pg_cron schedule (set up separately, outside migrations, since it needs
-- the function's deployed URL and a shared secret).

CREATE TABLE public.notification_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pushover_user_key TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,

  assignments_enabled BOOLEAN NOT NULL DEFAULT true,
  assignments_lead_hours INTEGER NOT NULL DEFAULT 24 CHECK (assignments_lead_hours > 0),

  exams_enabled BOOLEAN NOT NULL DEFAULT true,
  exams_lead_days INTEGER[] NOT NULL DEFAULT '{7,1}',

  quizzes_enabled BOOLEAN NOT NULL DEFAULT true,
  quizzes_lead_days INTEGER[] NOT NULL DEFAULT '{1}',

  daily_digest_enabled BOOLEAN NOT NULL DEFAULT false,
  daily_digest_time TIME NOT NULL DEFAULT '08:00:00',

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification settings"
  ON public.notification_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification settings"
  ON public.notification_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification settings"
  ON public.notification_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Dedupe log so the cron sweep (every few minutes) never sends the same
-- notice twice — e.g. "exam in 1 day" fires once per exam, not once per run.
CREATE TABLE public.notification_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification log"
  ON public.notification_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX idx_notification_log_user ON public.notification_log(user_id);

-- New users get a default (disabled) settings row, same as profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (new.id, new.raw_user_meta_data->>'display_name', new.email);
  INSERT INTO public.notification_settings (user_id)
  VALUES (new.id);
  RETURN new;
END;
$$;

-- Retire the old browser-notification prefs.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS notifications_enabled;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS notification_time;
