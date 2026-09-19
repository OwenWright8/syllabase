#!/bin/sh
# Runs as PID 1's child (via tini) inside the merged "app" container.
# Waits for the separate `db` container, applies migrations, then starts
# GoTrue, PostgREST, and Edge Runtime in the background and nginx in the
# foreground — nginx exiting (e.g. on SIGTERM from `docker stop`) triggers
# cleanup of the other three via the trap below.
set -eu

# `docker restart` keeps the container filesystem, so clear the marker the
# watchdog below leaves behind when a backend dies.
rm -f /tmp/backend-died
DB_URL="postgres://postgres:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-postgres}"
# GoTrue and PostgREST connect as their own dedicated roles (created by
# the supabase/postgres image's own init, matching Supabase's official
# reference compose) rather than the plain postgres superuser — GoTrue's
# internal schema migrations specifically expect to run as the role that
# owns the auth schema. Confirmed live: running them as `postgres`
# instead caused GoTrue's own migrations to fail against this image.
GOTRUE_DB_URL="postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-postgres}"
POSTGREST_DB_URL="postgres://authenticator:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-postgres}"

echo "[start] waiting for postgres..."
until pg_isready -h db -p 5432 -U postgres >/dev/null 2>&1; do
  sleep 1
done
echo "[start] postgres is ready"

echo "[start] applying migrations..."
DATABASE_URL="$DB_URL" MIGRATIONS_DIR="/app/migrations" /app/migrate.sh

echo "[start] scheduling notification sweep..."
# (Re)created fresh on every boot with the current CRON_SECRET baked
# directly into the job's command, rather than read via a Postgres GUC at
# run time — the `postgres` role in this image isn't a true superuser, so
# `ALTER DATABASE ... SET app.settings.*` (an earlier approach here) fails
# with "permission denied to set parameter" (confirmed against a live
# run). cron.schedule() itself runs fine as `postgres`, and calling it
# again with the same job name updates the existing job rather than
# duplicating it, so a secret rotation just needs a container restart.
#
# Single quotes are doubled to embed safely inside the SQL string
# literal; the job's own dollar-quote uses a named tag ($cron$) instead
# of bare $$ so it can't collide with "$$" (bash's own PID) when this
# heredoc is interpolated.
CRON_SECRET_SQL=$(printf '%s' "$CRON_SECRET" | sed "s/'/''/g")
psql "$DB_URL" -v ON_ERROR_STOP=1 -f - <<SQLEOF
SELECT cron.schedule(
  'send-notifications-sweep',
  '*/15 * * * *',
  \$cron\$
  SELECT net.http_post(
    url := 'http://app:8080/functions/v1/send-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '${CRON_SECRET_SQL}'),
    body := '{}'::jsonb
  )
  \$cron\$
);
SQLEOF

echo "[start] writing runtime frontend config..."
export VITE_SUPABASE_URL="$SITE_URL"
envsubst '${VITE_SUPABASE_URL} ${VITE_SUPABASE_PUBLISHABLE_KEY}' \
  < /app/frontend/env.js.template \
  > /app/frontend/env.js

echo "[start] checking auth schema ownership..."
# GoTrue's first internal migration (00_init_auth_schema) runs
# `create or replace function auth.uid()` (and role()/email()), which
# Postgres only allows for the function's owner. The supabase/postgres
# image creates those functions as `postgres`, then its
# update-auth-owner migration hands them to supabase_auth_admin — but
# that migration wraps the ALTER in a catch-all that downgrades any
# failure to a mere WARNING, so if it didn't take, GoTrue dies at
# startup with "must be owner of function uid" and every /auth/v1/*
# request 502s while the frontend still loads fine (this is exactly what
# a real deployment hit). Repair it ourselves, idempotently, on every
# boot, as supabase_admin (the image's real superuser: POSTGRES_USER, with
# POSTGRES_PASSWORD as its password, reachable over the compose network).
# Prints the owners before changing anything so the logs show whether the
# repair was actually needed.
ADMIN_DB_URL="postgres://supabase_admin:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-postgres}"
psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 <<'SQLEOF'
SELECT 'auth function owner before repair: ' || p.oid::regprocedure::text || ' -> ' || pg_get_userbyid(p.proowner) AS info
FROM pg_proc p
WHERE p.pronamespace = 'auth'::regnamespace AND p.proname IN ('uid', 'role', 'email');

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['auth.uid()', 'auth.role()', 'auth.email()'] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s OWNER TO supabase_auth_admin', fn);
    END IF;
  END LOOP;
END $$;
SQLEOF

echo "[start] starting gotrue..."
GOTRUE_API_HOST=0.0.0.0 \
GOTRUE_API_PORT=9999 \
API_EXTERNAL_URL="$SITE_URL" \
GOTRUE_SITE_URL="$SITE_URL" \
GOTRUE_URI_ALLOW_LIST="$SITE_URL" \
GOTRUE_JWT_ISSUER="$SITE_URL" \
GOTRUE_DB_DRIVER=postgres \
GOTRUE_DB_DATABASE_URL="$GOTRUE_DB_URL" \
GOTRUE_JWT_SECRET="$JWT_SECRET" \
GOTRUE_JWT_EXP="${JWT_EXP:-3600}" \
GOTRUE_JWT_AUD=authenticated \
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
GOTRUE_JWT_ADMIN_ROLES=service_role \
GOTRUE_DISABLE_SIGNUP=false \
GOTRUE_MAILER_AUTOCONFIRM=true \
  /usr/local/bin/gotrue &
GOTRUE_PID=$!

echo "[start] starting postgrest..."
PGRST_DB_URI="$POSTGREST_DB_URL" \
PGRST_DB_SCHEMAS=public \
PGRST_DB_ANON_ROLE=anon \
PGRST_DB_USE_LEGACY_GUCS=false \
PGRST_JWT_SECRET="$JWT_SECRET" \
PGRST_SERVER_PORT=3000 \
  /usr/local/bin/postgrest &
POSTGREST_PID=$!

echo "[start] starting edge runtime..."
# --main-service must point at a router entrypoint (main/index.ts), not
# the parent functions directory — newer edge-runtime versions don't
# auto-discover subdirectories as routes on their own (confirmed against
# a live run: "could not find an appropriate entrypoint" without this).
SUPABASE_URL="http://localhost:8080" \
SUPABASE_ANON_KEY="$ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
CRON_SECRET="$CRON_SECRET" \
JWT_SECRET="$JWT_SECRET" \
  /usr/local/bin/edge-runtime start --main-service /app/functions/main &
EDGE_PID=$!

cleanup() {
  echo "[start] shutting down..."
  kill "$GOTRUE_PID" "$POSTGREST_PID" "$EDGE_PID" 2>/dev/null || true
  wait "$GOTRUE_PID" "$POSTGREST_PID" "$EDGE_PID" 2>/dev/null || true
}
trap cleanup TERM INT

echo "[start] starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Without this, a crashed backend (e.g. GoTrue failing its own migrations)
# goes unnoticed: nginx keeps serving the static frontend, so the site
# loads normally while every API call 502s and Docker sees a healthy
# container. Poll the three backend processes; if any dies, log which one
# and stop nginx so the container exits non-zero — `restart:
# unless-stopped` then restarts it, and the backend's own fatal error is
# right above this message in `docker compose logs app`.
# (A dead child stays a zombie until reaped, and `kill -0` succeeds on
# zombies, so check the process state in /proc instead.)
is_alive() {
  [ -r "/proc/$1/status" ] && ! grep -q '^State:[[:space:]]*Z' "/proc/$1/status"
}
(
  while :; do
    for entry in "gotrue:$GOTRUE_PID" "postgrest:$POSTGREST_PID" "edge-runtime:$EDGE_PID"; do
      name="${entry%%:*}"
      pid="${entry##*:}"
      if ! is_alive "$pid"; then
        echo "[start] FATAL: $name (pid $pid) exited — stopping the container so it restarts; see the $name error above." >&2
        touch /tmp/backend-died
        kill "$NGINX_PID" 2>/dev/null || true
        exit 0
      fi
    done
    sleep 2
  done
) &

wait "$NGINX_PID" || true
cleanup
[ ! -f /tmp/backend-died ] || exit 1
