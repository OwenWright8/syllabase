#!/bin/sh
# One-time setup: copies .env.example to .env and fills in every value
# that can be safely auto-generated (Postgres password, JWT secret, the
# anon/service_role API keys derived from it, the cron secret) — the
# tedious, error-prone part of standing this up by hand. Only real domain
# names are left for you to edit afterward, since those can't be guessed.
#
# Requires only POSIX sh + openssl (no Node/Python/jq needed), so it runs
# the same way on a Raspberry Pi, a Mac, or a plain Linux box.
set -eu

cd "$(dirname "$0")"

if [ -f .env ]; then
  echo ".env already exists — not overwriting it (that would replace live secrets)."
  echo "Delete .env first if you really want to regenerate everything."
  exit 1
fi

cp .env.example .env

rand_hex() {
  openssl rand -hex 32
}

b64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

# Builds an HS256 JWT the same way Supabase's own key generator does, so
# GoTrue/PostgREST/Edge Runtime all accept it as a valid anon/service_role
# API key.
make_jwt() {
  role="$1"
  secret="$2"
  header='{"alg":"HS256","typ":"JWT"}'
  iat=$(date +%s)
  exp=$((iat + 315360000)) # ~10 years — this is a static API key, not a session token
  payload="{\"role\":\"${role}\",\"iss\":\"supabase\",\"iat\":${iat},\"exp\":${exp}}"
  header_b64=$(printf '%s' "$header" | b64url)
  payload_b64=$(printf '%s' "$payload" | b64url)
  signing_input="${header_b64}.${payload_b64}"
  signature=$(printf '%s' "$signing_input" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)
  printf '%s.%s' "$signing_input" "$signature"
}

set_env() {
  key="$1"
  value="$2"
  escaped=$(printf '%s' "$value" | sed -e 's/[&|\\]/\\&/g')
  sed -i.bak "s|^${key}=.*|${key}=${escaped}|" .env
  rm -f .env.bak
}

JWT_SECRET=$(rand_hex)
ANON_KEY=$(make_jwt anon "$JWT_SECRET")
SERVICE_ROLE_KEY=$(make_jwt service_role "$JWT_SECRET")

set_env "POSTGRES_PASSWORD" "$(rand_hex)"
set_env "JWT_SECRET" "$JWT_SECRET"
set_env "ANON_KEY" "$ANON_KEY"
set_env "SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY"
set_env "CRON_SECRET" "$(rand_hex)"
set_env "VITE_SUPABASE_PUBLISHABLE_KEY" "$ANON_KEY"

echo "Generated .env with fresh secrets."
echo
echo "Now edit .env and set the one thing that can't be generated for you:"
echo "  SITE_URL=https://your-domain.example"
echo
echo "Then run: docker compose up -d"
