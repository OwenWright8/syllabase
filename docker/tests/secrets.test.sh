#!/bin/bash
# Exercises docker/secrets.sh under dash (the container's /bin/sh).
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SH=/bin/dash
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS - $1"; }
bad() { fail=$((fail+1)); echo "  FAIL - $1  [$2]"; }
check() { if [ "$2" = "1" ]; then ok "$1"; else bad "$1" "${3:-}"; fi; }

new_dir() { d=$(mktemp -d); echo "$d"; }
# run a snippet in a clean dash with secrets.sh sourced; prints its stdout, stderr to $ERR
run() { ERR=$(mktemp); env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=1 "$@" 2>"$ERR"; }
sh_run() { # $1 = extra env assignments (space separated), $2 = snippet
  ERR=$(mktemp)
  env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=${SKIP:-1} $1 $SH -c ". $REPO/docker/secrets.sh; $2" 2>"$ERR"
  RC=$?
}
mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

echo "== load_or_create: generates once, then reuses"
D=$(new_dir)
sh_run "" 'load_or_create JWT_SECRET jwt_secret; printf "%s" "$JWT_SECRET"'; v1="$OUT"; OUT=$(sh_run "" 'load_or_create JWT_SECRET jwt_secret; printf "%s" "$JWT_SECRET"');
first=$(env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=1 $SH -c ". $REPO/docker/secrets.sh; load_or_create JWT_SECRET jwt_secret; printf '%s' \"\$JWT_SECRET\"" 2>/dev/null)
second=$(env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=1 $SH -c ". $REPO/docker/secrets.sh; load_or_create JWT_SECRET jwt_secret; printf '%s' \"\$JWT_SECRET\"" 2>/dev/null)
check "generates 64 hex chars" "$([[ "$first" =~ ^[0-9a-f]{64}$ ]] && echo 1)" "$first"
check "second start reuses the same value" "$([ "$first" = "$second" ] && echo 1)" "$first vs $second"
check "file exists and is owner-only (600)" "$([ "$(mode $D/jwt_secret)" = 600 ] && echo 1)" "$(mode $D/jwt_secret)"
check "no leftover .tmp file" "$([ ! -e $D/jwt_secret.tmp ] && echo 1)"
check "file content equals the value (no trailing newline issues)" "$([ "$(cat $D/jwt_secret)" = "$first" ] && echo 1)"

echo "== precedence: env > file"
D=$(new_dir); printf 'from-file' > "$D/jwt_secret"
out=$(env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=1 JWT_SECRET=from-env $SH -c ". $REPO/docker/secrets.sh; load_or_create JWT_SECRET jwt_secret; printf '%s' \"\$JWT_SECRET\"" 2>/dev/null)
check "env value wins over the file" "$([ "$out" = from-env ] && echo 1)" "$out"
out=$(env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=1 $SH -c ". $REPO/docker/secrets.sh; load_or_create JWT_SECRET jwt_secret; printf '%s' \"\$JWT_SECRET\"" 2>/dev/null)
check "file value is used when env is unset" "$([ "$out" = from-file ] && echo 1)" "$out"
D=$(new_dir)
env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=1 JWT_SECRET=given $SH -c ". $REPO/docker/secrets.sh; load_or_create JWT_SECRET jwt_secret" 2>/dev/null
check "an env-provided secret is NOT written to disk" "$([ ! -e $D/jwt_secret ] && echo 1)"
out=$(env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=1 JWT_SECRET= $SH -c ". $REPO/docker/secrets.sh; load_or_create JWT_SECRET jwt_secret; printf '%s' \"\$JWT_SECRET\"" 2>/dev/null)
check "empty env var (compose pass-through) counts as unset -> generated" "$([[ "$out" =~ ^[0-9a-f]{64}$ ]] && echo 1)" "$out"

echo "== load_existing (database password: never generated here)"
D=$(new_dir)
err=$(env -i PATH="$PATH" SECRETS_DIR="$D" $SH -c ". $REPO/docker/secrets.sh; load_existing POSTGRES_PASSWORD postgres_password" 2>&1 >/dev/null); rc=$?
check "missing file -> exit 1 with a helpful message" "$([ $rc -ne 0 ] && [[ "$err" == *"expected it in"* ]] && echo 1)" "rc=$rc $err"
check "...and it did not invent one" "$([ ! -e $D/postgres_password ] && echo 1)"
printf 'dbpw' > "$D/postgres_password"
out=$(env -i PATH="$PATH" SECRETS_DIR="$D" $SH -c ". $REPO/docker/secrets.sh; load_existing POSTGRES_PASSWORD postgres_password; printf '%s' \"\$POSTGRES_PASSWORD\"" 2>/dev/null)
check "reads the password the db container saved" "$([ "$out" = dbpw ] && echo 1)" "$out"
out=$(env -i PATH="$PATH" SECRETS_DIR="$D" POSTGRES_PASSWORD=override $SH -c ". $REPO/docker/secrets.sh; load_existing POSTGRES_PASSWORD postgres_password; printf '%s' \"\$POSTGRES_PASSWORD\"" 2>/dev/null)
check "an explicit POSTGRES_PASSWORD wins" "$([ "$out" = override ] && echo 1)" "$out"

echo "== safety: refuses an unmounted /secrets (would lose secrets on upgrade)"
D=$(new_dir)
err=$(env -i PATH="$PATH" SECRETS_DIR="$D" $SH -c ". $REPO/docker/secrets.sh; load_or_create JWT_SECRET jwt_secret" 2>&1 >/dev/null); rc=$?
# On macOS there is no /proc/self/mountinfo, so the check (correctly) sees no mount.
check "not a mount -> exit 1 with the volume hint" "$([ $rc -ne 0 ] && [[ "$err" == *"not a mounted volume"* ]] && echo 1)" "rc=$rc"
check "...and nothing was written" "$([ -z "$(ls -A $D)" ] && echo 1)"
mkdir -p "$D/ro"; chmod 500 "$D/ro"
err=$(env -i PATH="$PATH" SECRETS_DIR="$D/ro" SECRETS_SKIP_MOUNT_CHECK=1 $SH -c ". $REPO/docker/secrets.sh; load_or_create JWT_SECRET jwt_secret" 2>&1 >/dev/null); rc=$?
[ "$(id -u)" = 0 ] && ok "(running as root: skip read-only dir check)" || check "read-only dir -> exit 1 'not writable'" "$([ $rc -ne 0 ] && [[ "$err" == *"not writable"* ]] && echo 1)" "rc=$rc $err"
chmod 700 "$D/ro"

echo "== derived API keys"
D=$(new_dir)
keys=$(env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=1 $SH -c ". $REPO/docker/secrets.sh; load_or_create JWT_SECRET jwt_secret; derive_api_keys; printf '%s\n%s\n%s\n' \"\$JWT_SECRET\" \"\$ANON_KEY\" \"\$SERVICE_ROLE_KEY\"" 2>/dev/null)
sec=$(echo "$keys" | sed -n 1p); anon=$(echo "$keys" | sed -n 2p); svc=$(echo "$keys" | sed -n 3p)
python3 - "$sec" "$anon" "$svc" > /tmp/jwtcheck.out <<'PY'
import sys,hmac,hashlib,base64,json
sec,anon,svc=sys.argv[1:4]
def chk(tok, want):
    h,p,s=tok.split('.'); pad=lambda x:x+'='*(-len(x)%4)
    good=base64.urlsafe_b64encode(hmac.new(sec.encode(),f"{h}.{p}".encode(),hashlib.sha256).digest()).decode().rstrip('=')
    pl=json.loads(base64.urlsafe_b64decode(pad(p))); hd=json.loads(base64.urlsafe_b64decode(pad(h)))
    return good==s and pl["role"]==want and pl["iss"]=="supabase" and pl["exp"]>4000000000 and hd=={"alg":"HS256","typ":"JWT"} and "=" not in tok and "+" not in tok and "/" not in tok
print("anon", chk(anon,"anon")); print("svc", chk(svc,"service_role"))
PY
check "anon key is a valid HS256 JWT for role=anon" "$(grep -q '^anon True' /tmp/jwtcheck.out && echo 1)"
check "service key is a valid HS256 JWT for role=service_role" "$(grep -q '^svc True' /tmp/jwtcheck.out && echo 1)"
keys2=$(env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=1 $SH -c ". $REPO/docker/secrets.sh; load_or_create JWT_SECRET jwt_secret; derive_api_keys; printf '%s\n%s\n%s\n' \"\$JWT_SECRET\" \"\$ANON_KEY\" \"\$SERVICE_ROLE_KEY\"" 2>/dev/null)
check "keys are IDENTICAL across restarts (frontend key doesn't churn)" "$([ "$keys" = "$keys2" ] && echo 1)"
out=$(env -i PATH="$PATH" SECRETS_DIR="$D" SECRETS_SKIP_MOUNT_CHECK=1 ANON_KEY=my-anon $SH -c ". $REPO/docker/secrets.sh; load_or_create JWT_SECRET jwt_secret; derive_api_keys; printf '%s' \"\$ANON_KEY\"" 2>/dev/null)
check "a provided ANON_KEY is kept (existing installs)" "$([ "$out" = my-anon ] && echo 1)" "$out"

echo; echo "secrets.sh: $pass passed, $fail failed"; [ $fail -eq 0 ]
