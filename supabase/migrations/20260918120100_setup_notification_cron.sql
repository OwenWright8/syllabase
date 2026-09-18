-- Scheduled sweep that triggers the send-notifications edge function every
-- 15 minutes. This previously only existed as raw SQL run once directly
-- against the live cloud database and was never captured as a migration —
-- needed here so a fresh self-hosted install (or a from-scratch replay)
-- gets the same behavior automatically.
--
-- The secret is read from a Postgres setting rather than hardcoded here,
-- so no credential lives in a version-controlled file. docker-compose.yml
-- sets it on the `db` service at startup (`-c app.settings.cron_secret=...`,
-- sourced from CRON_SECRET), matching the same secret the `functions`
-- service checks incoming requests against.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'send-notifications-sweep',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'http://kong:8000/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  )
  $$
);
