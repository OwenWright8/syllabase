-- Scheduled sweep that triggers the send-notifications edge function every
-- 15 minutes. This previously only existed as raw SQL run once directly
-- against the live cloud database and was never captured as a migration —
-- needed here so a fresh self-hosted install (or a from-scratch replay)
-- gets the same behavior automatically.
--
-- The secret is read from a Postgres setting rather than hardcoded here,
-- so no credential lives in a version-controlled file. docker-compose.yml
-- sets it on the `db` service at startup (`-c app.settings.cron_secret=...`,
-- sourced from CRON_SECRET), matching the same secret the `app` container's
-- edge runtime checks incoming requests against. The URL below hits the
-- `app` service's internal nginx gateway (Docker Compose's built-in DNS
-- resolves the "app" hostname to that container) on the port it listens
-- on inside the compose network.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'send-notifications-sweep',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'http://app:8080/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  )
  $$
);
