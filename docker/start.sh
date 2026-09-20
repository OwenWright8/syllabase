#!/bin/sh
# Runs as PID 1's child (via tini) inside the merged "app" container.
# Waits for the separate `db` container, applies migrations, then starts
# GoTrue, PostgREST, and Edge Runtime in the background and nginx in the
# foreground — nginx exiting (e.g. on SIGTERM from `docker stop`) triggers
# cleanup of the other three via the trap below.
set -eu

fail() {
  echo "[start] FATAL: $*" >&2
  exit 1
}

# Secrets: an environment variable if set (an existing .env keeps working),
# else the persistent /secrets volume, else generated on first start — so a
# fresh install needs no configuration at all (see secrets.sh). The database
# password is written by the db container on *its* first start.
. /app/secrets.sh
load_existing POSTGRES_PASSWORD postgres_password
load_or_create JWT_SECRET jwt_secret
load_or_create CRON_SECRET cron_secret
derive_api_keys

# Generated values always pass these; they catch values an operator supplied.
for var in POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY CRON_SECRET; do
  eval "value=\${$var:-}"
  [ "$value" != "change-me" ] || fail "$var is still the .env.example placeholder — remove it to have one generated, or set a real value."
done
[ "${#JWT_SECRET}" -ge 32 ] || fail "JWT_SECRET must be at least 32 characters (PostgREST rejects shorter)."

# POSTGRES_PASSWORD is embedded in the connection URLs below, so characters
# with meaning inside a URL would make GoTrue/PostgREST fail with an obscure
# "invalid port"/"invalid URL" error.
if printf '%s' "$POSTGRES_PASSWORD" | grep -q '[]@:/?#%[[:space:]]'; then
  fail "POSTGRES_PASSWORD must not contain any of  @ : / ? # % [ ]  or whitespace (it is embedded in connection URLs)."
fi

# GoTrue insists on being given a base URL and a site URL, but they only feed
# email links and OAuth redirects — neither of which this app uses (sign-in is
# username/password with auto-confirm). The app calls whatever address it was
# opened from, so there is no real public URL to configure; a fixed
# placeholder satisfies GoTrue. (Checked against GoTrue's source: the values
# only have to be valid URLs, and the token issuer isn't validated.)
GOTRUE_PLACEHOLDER_URL="http://localhost:9999"

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
# The browser-facing key IS the anon key (same value, different name in the
# frontend). The API address isn't written here at all: the app calls the
# address it was loaded from.
export VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
envsubst '${VITE_SUPABASE_PUBLISHABLE_KEY}' \
  < /app/env.js.template \
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

# Each backend below is started through `env -u ...` so it only inherits the
# secrets it actually needs. In particular the Postgres superuser password
# and the service-role key stay out of the edge runtime, which executes
# code fetched from esm.sh at run time.
echo "[start] starting gotrue..."
env -u POSTGRES_PASSWORD -u SERVICE_ROLE_KEY -u ANON_KEY -u CRON_SECRET \
GOTRUE_API_HOST=0.0.0.0 \
GOTRUE_API_PORT=9999 \
API_EXTERNAL_URL="$GOTRUE_PLACEHOLDER_URL" \
GOTRUE_SITE_URL="$GOTRUE_PLACEHOLDER_URL" \
GOTRUE_URI_ALLOW_LIST="$GOTRUE_PLACEHOLDER_URL" \
GOTRUE_JWT_ISSUER=syllabase \
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
env -u POSTGRES_PASSWORD -u JWT_SECRET -u SERVICE_ROLE_KEY -u ANON_KEY -u CRON_SECRET \
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
# None of the functions verify JWTs themselves (they ask GoTrue), so
# JWT_SECRET isn't passed at all.
env -u POSTGRES_PASSWORD -u JWT_SECRET \
SUPABASE_URL="http://localhost:8080" \
SUPABASE_ANON_KEY="$ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
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
