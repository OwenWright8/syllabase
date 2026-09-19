-- Extensions for the scheduled notification sweep. The actual job
-- (cron.schedule call) is NOT created here — it's (re)created by the
-- `app` container's start.sh on every boot instead, with the current
-- CRON_SECRET value baked directly into the job's command. That avoids
-- needing a custom Postgres GUC to carry the secret between processes:
-- an earlier version of this tried `ALTER DATABASE ... SET
-- app.settings.cron_secret = ...` for that, but the `postgres` role in
-- this image isn't a true superuser (confirmed against a live run —
-- "permission denied to set parameter"), so that approach never worked.
-- cron.schedule() itself runs fine as `postgres`, which is what start.sh
-- now relies on instead.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
