#!/bin/sh
# Wraps the base image's own entrypoint so the database needs no password to be
# supplied. On the very first start it generates a random one, saves it in the
# persistent /secrets volume (which the app container mounts too, and reads
# from), and hands it to the official Postgres entrypoint through
# POSTGRES_PASSWORD_FILE — which that script reads while still root and exports
# as POSTGRES_PASSWORD, so init scripts like roles.sql see it as before.
#
# Anything the operator sets themselves wins, so existing installs that pass
# POSTGRES_PASSWORD (e.g. from an old .env) are unchanged.
set -eu

SECRETS_DIR="${SECRETS_DIR:-/secrets}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
secret="$SECRETS_DIR/postgres_password"

# docker/init/jwt.sql reads this; it used to come from the compose file.
export JWT_EXP="${JWT_EXP:-3600}"

fail() {
  echo "[db] FATAL: $*" >&2
  exit 1
}

if [ -z "${POSTGRES_PASSWORD:-}" ] && [ -z "${POSTGRES_PASSWORD_FILE:-}" ]; then
  if [ -s "$secret" ]; then
    : # already generated on an earlier start
  elif [ -s "$PGDATA/PG_VERSION" ]; then
    # The cluster exists, so its password is already set — and we don't have
    # it. Inventing a new one would just make the app fail to log in.
    fail "this database already exists, but its password isn't in $secret. Either the 'secrets' volume was removed or this is a database from an earlier setup. If you used a .env file before, keep it next to docker-compose.yml (it holds POSTGRES_PASSWORD); otherwise restore the secrets volume."
  else
    # The mount check is skipped only by tests (SECRETS_SKIP_MOUNT_CHECK=1).
    if [ "${SECRETS_SKIP_MOUNT_CHECK:-0}" != "1" ] \
       && ! awk -v dir="$SECRETS_DIR" '$5 == dir { found = 1 } END { exit !found }' /proc/self/mountinfo 2>/dev/null; then
      fail "$SECRETS_DIR is not a mounted volume, so the generated database password would be lost when the container is recreated. Add 'secrets:$SECRETS_DIR' to this service's volumes (see docker-compose.yml), or set POSTGRES_PASSWORD."
    fi
    mkdir -p "$SECRETS_DIR"
    password=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    [ "${#password}" -eq 64 ] || fail "could not generate a password."
    (umask 077 && printf '%s' "$password" > "$secret.tmp") && mv "$secret.tmp" "$secret" \
      || fail "could not save the generated password to $secret."
    echo "[db] generated a database password (saved to $secret)" >&2
  fi
  export POSTGRES_PASSWORD_FILE="$secret"
fi

exec docker-entrypoint.sh "$@"
