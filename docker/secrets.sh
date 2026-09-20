#!/bin/sh
# Sourced by start.sh (POSIX sh). Gives the app container its secrets without
# the operator having to create any: each one is taken from the environment if
# set, otherwise from a file in the persistent /secrets volume, otherwise
# generated once and saved there.
#
#   environment variable  >  /secrets/<file>  >  generate + save
#
# Setting them yourself (e.g. an existing .env) still works exactly as before.
# The database password is different: the db container generates it (see
# db-entrypoint.sh), because Postgres needs it before this container exists.

SECRETS_DIR="${SECRETS_DIR:-/secrets}"

secrets_fail() {
  echo "[start] FATAL: $*" >&2
  exit 1
}

# Secrets we generate must survive the container being recreated (every
# `docker compose pull && up -d`). If /secrets is just a folder inside the
# container they'd be silently lost on the first upgrade, so insist on a real
# mount. SECRETS_SKIP_MOUNT_CHECK=1 is for tests only.
secrets_require_mount() {
  [ "${SECRETS_SKIP_MOUNT_CHECK:-0}" = "1" ] && return 0
  if ! awk -v dir="$SECRETS_DIR" '$5 == dir { found = 1 } END { exit !found }' /proc/self/mountinfo 2>/dev/null; then
    secrets_fail "$SECRETS_DIR is not a mounted volume, so generated secrets would be lost when the container is recreated. Add 'secrets:$SECRETS_DIR' to this service's volumes (see docker-compose.yml), or set JWT_SECRET and CRON_SECRET yourself."
  fi
}

# load_or_create VAR FILENAME — set and export VAR.
load_or_create() {
  _var="$1"
  _file="$SECRETS_DIR/$2"
  eval "_current=\${$_var:-}"
  if [ -n "$_current" ]; then
    export "$_var"
    return 0
  fi
  if [ -s "$_file" ]; then
    _value=$(cat "$_file")
  else
    secrets_require_mount
    [ -w "$SECRETS_DIR" ] || secrets_fail "$SECRETS_DIR is not writable, so $_var can't be saved."
    _value=$(openssl rand -hex 32)
    [ -n "$_value" ] || secrets_fail "could not generate $_var (is openssl working?)."
    # Write-then-rename so a crash can't leave a half-written secret behind.
    (umask 077 && printf '%s' "$_value" > "$_file.tmp") && mv "$_file.tmp" "$_file" \
      || secrets_fail "could not save $_var to $_file."
    echo "[start] generated $_var (saved to $_file)" >&2
  fi
  eval "$_var=\$_value"
  export "$_var"
}

# load_existing VAR FILENAME — like load_or_create but never generates: for
# secrets some other container owns (the database password).
load_existing() {
  _var="$1"
  _file="$SECRETS_DIR/$2"
  eval "_current=\${$_var:-}"
  if [ -z "$_current" ]; then
    [ -s "$_file" ] || secrets_fail "no value for $_var: expected it in $_file (the db container writes it on its first start; is the same 'secrets' volume mounted in both services?) or set $_var yourself."
    _value=$(cat "$_file")
    eval "$_var=\$_value"
  fi
  export "$_var"
}

b64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

# make_jwt ROLE SECRET — an HS256 API key, like Supabase's own generator makes.
# iat/exp are fixed (a static key, valid until 2100), so the same secret always
# yields the same key: the anon key baked into the frontend doesn't change on
# every restart.
make_jwt() {
  _header='{"alg":"HS256","typ":"JWT"}'
  _payload="{\"role\":\"$1\",\"iss\":\"supabase\",\"iat\":1700000000,\"exp\":4102444800}"
  _h=$(printf '%s' "$_header" | b64url)
  _p=$(printf '%s' "$_payload" | b64url)
  _s=$(printf '%s' "$_h.$_p" | openssl dgst -sha256 -hmac "$2" -binary | b64url)
  printf '%s.%s.%s' "$_h" "$_p" "$_s"
}

# derive_api_keys — ANON_KEY / SERVICE_ROLE_KEY from JWT_SECRET, unless given.
derive_api_keys() {
  if [ -z "${ANON_KEY:-}" ]; then
    ANON_KEY=$(make_jwt anon "$JWT_SECRET")
  fi
  if [ -z "${SERVICE_ROLE_KEY:-}" ]; then
    SERVICE_ROLE_KEY=$(make_jwt service_role "$JWT_SECRET")
  fi
  export ANON_KEY SERVICE_ROLE_KEY
}
