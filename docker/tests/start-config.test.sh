#!/bin/bash
# Tests the config/secret-loading block of docker/start.sh (everything up to the
# GoTrue placeholder), extracted verbatim from the real file.
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SH=/bin/dash
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS - $1"; }
bad() { fail=$((fail+1)); echo "  FAIL - $1  [$2]"; }
check() { if [ "$2" = "1" ]; then ok "$1"; else bad "$1" "${3:-}"; fi; }

BLOCK=$(mktemp)
awk '/^set -eu/{f=1} f{print} /^GOTRUE_PLACEHOLDER_URL=/{exit}' "$REPO/docker/start.sh" | sed "s#/app/secrets.sh#$REPO/docker/secrets.sh#" > "$BLOCK"
echo 'printf "PW=%s\nJWT=%s\nCRON=%s\nANON=%s\nSVC=%s\nPH=%s\n" "$POSTGRES_PASSWORD" "$JWT_SECRET" "$CRON_SECRET" "$ANON_KEY" "$SERVICE_ROLE_KEY" "$GOTRUE_PLACEHOLDER_URL"' >> "$BLOCK"

# run "ENV..."  -> RC, OUT, ERR ; uses $D as /secrets
run() { ERRF=$(mktemp); OUT=$(env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=1 $1 $SH "$BLOCK" 2>"$ERRF"); RC=$?; ERR=$(cat "$ERRF"); }
get() { echo "$OUT" | grep "^$1=" | cut -d= -f2-; }

echo "== A. fresh install: nothing set, db container already saved its password"
D=$(mktemp -d); printf 'generated-by-db-container-0123456789abcdef0123456789abcdef' > "$D/postgres_password"
run ""
check "starts with zero configuration" "$([ $RC -eq 0 ] && echo 1)" "rc=$RC $ERR"
check "database password taken from the volume" "$([ "$(get PW)" = generated-by-db-container-0123456789abcdef0123456789abcdef ] && echo 1)"
check "JWT + cron secrets generated (64 hex)" "$([[ "$(get JWT)" =~ ^[0-9a-f]{64}$ && "$(get CRON)" =~ ^[0-9a-f]{64}$ ]] && echo 1)"
check "...and persisted for the next start" "$([ -s $D/jwt_secret ] && [ -s $D/cron_secret ] && echo 1)"
check "API keys derived (JWT-shaped)" "$([[ "$(get ANON)" == eyJ*.*.* && "$(get SVC)" == eyJ*.*.* ]] && echo 1)"
check "GoTrue placeholder URL set" "$([ "$(get PH)" = http://localhost:9999 ] && echo 1)"
first="$OUT"; run ""
check "second start: IDENTICAL secrets and keys" "$([ "$OUT" = "$first" ] && echo 1)"

echo "== B. existing install: old .env values (incl. SITE_URL) -> behaviour unchanged"
D=$(mktemp -d)
oldjwt=$(printf 'a%.0s' {1..64});
run "POSTGRES_PASSWORD=oldpassword JWT_SECRET=$oldjwt ANON_KEY=old-anon SERVICE_ROLE_KEY=old-svc CRON_SECRET=oldcron SITE_URL=https://example.com/"
check "starts" "$([ $RC -eq 0 ] && echo 1)" "rc=$RC $ERR"
check "every supplied value is used as-is" "$([ "$(get PW)" = oldpassword ] && [ "$(get JWT)" = "$oldjwt" ] && [ "$(get ANON)" = old-anon ] && [ "$(get SVC)" = old-svc ] && [ "$(get CRON)" = oldcron ] && echo 1)"
check "nothing written to /secrets" "$([ -z "$(ls -A $D)" ] && echo 1)"
check "SITE_URL is ignored (not validated, not used)" "$([ $RC -eq 0 ] && echo 1)"
run "POSTGRES_PASSWORD=oldpassword JWT_SECRET=$oldjwt ANON_KEY=  SERVICE_ROLE_KEY= CRON_SECRET=oldcron"
check "own JWT_SECRET but no keys -> keys derived from THEIR secret" "$([[ "$(get ANON)" == eyJ* ]] && [ ! -e $D/jwt_secret ] && echo 1)" "$ERR"

echo "== C. fails clearly instead of misbehaving"
D=$(mktemp -d); run ""
check "no db password anywhere -> exit 1, says where it expected it" "$([ $RC -ne 0 ] && [[ "$ERR" == *"postgres_password"* ]] && echo 1)" "rc=$RC $ERR"
D=$(mktemp -d); run "POSTGRES_PASSWORD=change-me"
check "placeholder change-me is rejected" "$([ $RC -ne 0 ] && [[ "$ERR" == *"placeholder"* ]] && echo 1)" "$ERR"
run "POSTGRES_PASSWORD=ok JWT_SECRET=tooshort"
check "JWT_SECRET under 32 chars is rejected" "$([ $RC -ne 0 ] && [[ "$ERR" == *"32 characters"* ]] && echo 1)" "$ERR"
run "POSTGRES_PASSWORD=p@ss"
check "URL-breaking password characters rejected" "$([ $RC -ne 0 ] && [[ "$ERR" == *"must not contain"* ]] && echo 1)" "$ERR"

echo; echo "start.sh config block: $pass passed, $fail failed"; [ $fail -eq 0 ]
