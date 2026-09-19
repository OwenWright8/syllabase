#!/bin/sh
# Runs as PID 1's child (via tini) inside the merged "app" container.
# Waits for the separate `db` container, applies migrations, then starts
# GoTrue, PostgREST, and Edge Runtime in the background and nginx in the
# foreground — nginx exiting (e.g. on SIGTERM from `docker stop`) triggers
# cleanup of the other three via the trap below.
set -eu

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
SUPABASE_URL="http://localhost:8080" \
SUPABASE_ANON_KEY="$ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
CRON_SECRET="$CRON_SECRET" \
JWT_SECRET="$JWT_SECRET" \
  /usr/local/bin/edge-runtime start --main-service /app/functions &
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

wait "$NGINX_PID"
cleanup
