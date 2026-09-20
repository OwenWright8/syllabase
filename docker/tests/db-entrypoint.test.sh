#!/bin/bash
# Exercises docker/db-entrypoint.sh under dash with a stub in place of the real
# docker-entrypoint.sh. The stub records the env it was exec'd with + its args.
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SH=/bin/dash
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS - $1"; }
bad() { fail=$((fail+1)); echo "  FAIL - $1  [$2]"; }
check() { if [ "$2" = "1" ]; then ok "$1"; else bad "$1" "${3:-}"; fi; }
mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

setup() {   # fresh sandbox: $S/bin/docker-entrypoint.sh stub, $S/secrets, $S/pgdata
  S=$(mktemp -d); mkdir -p "$S/bin" "$S/secrets" "$S/pgdata"
  cat > "$S/bin/docker-entrypoint.sh" <<EOF
#!/bin/sh
{
  echo "ARGS=\$*"
  echo "POSTGRES_PASSWORD=\${POSTGRES_PASSWORD-<unset>}"
  echo "POSTGRES_PASSWORD_FILE=\${POSTGRES_PASSWORD_FILE-<unset>}"
  echo "JWT_EXP=\${JWT_EXP-<unset>}"
  # what the REAL entrypoint does first, as root: read the file -> value
  if [ -n "\${POSTGRES_PASSWORD_FILE:-}" ]; then echo "FILE_CONTENT=\$(cat \$POSTGRES_PASSWORD_FILE)"; fi
} > "$S/stub.out"
exit 0
EOF
  chmod +x "$S/bin/docker-entrypoint.sh"
}
# run_db "ENV=.. ENV2=.." [args...]   -> RC, ERR, and stub.out at $S/stub.out
run_db() {
  local envs="$1"; shift
  ERR=$(env -i PATH="$S/bin:$PATH" SECRETS_DIR="$S/secrets" PGDATA="$S/pgdata" SECRETS_SKIP_MOUNT_CHECK=${SKIP:-1} $envs $SH "$REPO/docker/db-entrypoint.sh" "$@" 2>&1 >/dev/null); RC=$?
}
out() { grep "^$1=" "$S/stub.out" 2>/dev/null | head -1 | cut -d= -f2-; }

echo "== fresh install (no env, empty data dir)"
setup; run_db "" postgres -D /etc/postgresql
pw=$(cat "$S/secrets/postgres_password" 2>/dev/null)
check "starts (exit 0) and hands over to the real entrypoint" "$([ $RC -eq 0 ] && [ -f $S/stub.out ] && echo 1)" "rc=$RC $ERR"
check "generated a 64-hex password" "$([[ "$pw" =~ ^[0-9a-f]{64}$ ]] && echo 1)" "$pw"
check "password file is owner-only (600), no .tmp left" "$([ "$(mode $S/secrets/postgres_password)" = 600 ] && [ ! -e $S/secrets/postgres_password.tmp ] && echo 1)"
check "real entrypoint got POSTGRES_PASSWORD_FILE -> that file" "$([ "$(out POSTGRES_PASSWORD_FILE)" = "$S/secrets/postgres_password" ] && echo 1)" "$(out POSTGRES_PASSWORD_FILE)"
check "...and reading that file yields the password" "$([ "$(out FILE_CONTENT)" = "$pw" ] && echo 1)"
check "original args passed through untouched" "$([ "$(out ARGS)" = "postgres -D /etc/postgresql" ] && echo 1)" "$(out ARGS)"
check "JWT_EXP defaulted to 3600 (init scripts need it)" "$([ "$(out JWT_EXP)" = 3600 ] && echo 1)" "$(out JWT_EXP)"
check "plaintext password is NOT put in POSTGRES_PASSWORD env" "$([ "$(out POSTGRES_PASSWORD)" = "<unset>" ] && echo 1)"

echo "== restart (secret exists, data dir now initialised)"
echo 17 > "$S/pgdata/PG_VERSION"; cp "$S/secrets/postgres_password" "$S/pw.before"
run_db "" postgres
check "starts and REUSES the saved password" "$([ $RC -eq 0 ] && cmp -s $S/pw.before $S/secrets/postgres_password && echo 1)" "rc=$RC"

echo "== SAFETY: database exists but no saved password"
setup; echo 17 > "$S/pgdata/PG_VERSION"; run_db "" postgres
check "refuses to start (non-zero exit)" "$([ $RC -ne 0 ] && echo 1)" "rc=$RC"
check "real entrypoint was NOT run" "$([ ! -f $S/stub.out ] && echo 1)"
check "did NOT invent a password" "$([ ! -e $S/secrets/postgres_password ] && echo 1)"
check "message explains what to do (.env / restore volume)" "$([[ "$ERR" == *"already exists"* && "$ERR" == *".env"* && "$ERR" == *"secrets volume"* ]] && echo 1)" "$ERR"

echo "== existing installs: POSTGRES_PASSWORD supplied"
setup; run_db "POSTGRES_PASSWORD=from-old-env" postgres
check "passes straight through (starts)" "$([ $RC -eq 0 ] && echo 1)" "rc=$RC $ERR"
check "no secret file created" "$([ -z "$(ls -A $S/secrets)" ] && echo 1)"
check "POSTGRES_PASSWORD forwarded, no _FILE injected" "$([ "$(out POSTGRES_PASSWORD)" = from-old-env ] && [ "$(out POSTGRES_PASSWORD_FILE)" = "<unset>" ] && echo 1)"
setup; echo 17 > "$S/pgdata/PG_VERSION"; run_db "POSTGRES_PASSWORD=from-old-env" postgres
check "existing DB + supplied password -> starts (the upgrade path)" "$([ $RC -eq 0 ] && echo 1)" "rc=$RC $ERR"

echo "== compose pass-through: POSTGRES_PASSWORD='' (empty) counts as unset"
setup; run_db "POSTGRES_PASSWORD=" postgres
check "empty value -> generated" "$([ $RC -eq 0 ] && [ -s $S/secrets/postgres_password ] && echo 1)" "rc=$RC $ERR"

echo "== operator-supplied POSTGRES_PASSWORD_FILE is respected"
setup; echo custom > "$S/custom.pw"; run_db "POSTGRES_PASSWORD_FILE=$S/custom.pw" postgres
check "not overridden, no secret generated" "$([ "$(out POSTGRES_PASSWORD_FILE)" = "$S/custom.pw" ] && [ -z "$(ls -A $S/secrets)" ] && echo 1)" "$(out POSTGRES_PASSWORD_FILE)"

echo "== operator JWT_EXP is respected"
setup; run_db "JWT_EXP=900" postgres
check "JWT_EXP=900 kept" "$([ "$(out JWT_EXP)" = 900 ] && echo 1)" "$(out JWT_EXP)"

echo "== safety: /secrets not a real mount (password would be lost on recreate)"
setup; SKIP=0 run_db "" postgres
check "fresh DB + no mount -> refuses with the volume hint" "$([ $RC -ne 0 ] && [[ "$ERR" == *"not a mounted volume"* ]] && [ ! -f $S/stub.out ] && echo 1)" "rc=$RC $ERR"
check "...and wrote nothing" "$([ -z "$(ls -A $S/secrets)" ] && echo 1)"
setup; SKIP=0 run_db "POSTGRES_PASSWORD=x" postgres
check "but with an env password no mount is needed" "$([ $RC -eq 0 ] && echo 1)" "rc=$RC $ERR"

echo; echo "db-entrypoint.sh: $pass passed, $fail failed"; [ $fail -eq 0 ]
