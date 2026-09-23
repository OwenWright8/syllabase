#!/bin/bash
# Tests docker/documents.sh under dash (the containers' shell).
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SH=/bin/dash
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS - $1"; }
bad() { fail=$((fail+1)); echo "  FAIL - $1  [$2]"; }
check() { if [ "$2" = "1" ]; then ok "$1"; else bad "$1" "${3:-}"; fi; }

# run "ENV..." -> RC, OUT (the resulting settings), ERR.
# Each argument is one NAME=value assignment, kept intact (a value may contain spaces).
run() {
  ERRF=$(mktemp)
  OUT=$(env -i PATH="$PATH" "$@" $SH -c 'set -eu; fail() { echo "[start] FATAL: $*" >&2; exit 1; }; . "$0/docker/documents.sh"; documents_settings; echo "$DOC_ENABLED $DOC_MAX_FILE_BYTES $DOC_USER_QUOTA_BYTES $DOC_MAX_COUNT"' "$REPO" 2>"$ERRF"); RC=$?
  ERR=$(cat "$ERRF")
}

echo "== defaults"
run
check "defaults: on, 200 MB file, 1 GB per user, 200 documents" "$([ "$OUT" = "true 209715200 1073741824 200" ] && echo 1)" "rc=$RC out=$OUT $ERR"

echo "== the on/off switch"
for v in on ON On true 1 yes YES; do run "DOCUMENTS=$v"; check "DOCUMENTS=$v -> enabled" "$([ "${OUT%% *}" = true ] && echo 1)" "$OUT $ERR"; done
for v in off OFF false 0 no; do run "DOCUMENTS=$v"; check "DOCUMENTS=$v -> disabled" "$([ "${OUT%% *}" = false ] && echo 1)" "$OUT $ERR"; done
run DOCUMENTS=maybe; check "DOCUMENTS=maybe is rejected, says what is allowed" "$([ $RC -ne 0 ] && [[ "$ERR" == *"on or off"* ]] && echo 1)" "rc=$RC $ERR"
run DOCUMENTS=; check "empty DOCUMENTS (compose pass-through) means the default, on" "$([ "${OUT%% *}" = true ] && echo 1)" "$OUT $ERR"

echo "== limits"
run DOCUMENT_MAX_FILE_MB=50 DOCUMENT_USER_QUOTA_MB=500
check "custom values are converted to bytes" "$([ "$OUT" = "true 52428800 524288000 200" ] && echo 1)" "$OUT $ERR"
run DOCUMENT_MAX_FILE_MB= DOCUMENT_USER_QUOTA_MB= DOCUMENT_MAX_COUNT=
check "empty values (compose pass-through) mean the defaults" "$([ "$OUT" = "true 209715200 1073741824 200" ] && echo 1)" "$OUT $ERR"
run DOCUMENT_MAX_FILE_MB=08 DOCUMENT_USER_QUOTA_MB=0100
check "leading zeros are decimal, not octal" "$([ "$OUT" = "true 8388608 104857600 200" ] && echo 1)" "rc=$RC $OUT $ERR"

for bad_value in abc 0 -5 1.5 "1 2" 100001; do
  run "DOCUMENT_MAX_FILE_MB=$bad_value"
  check "DOCUMENT_MAX_FILE_MB='$bad_value' is rejected" "$([ $RC -ne 0 ] && [[ "$ERR" == *"DOCUMENT_MAX_FILE_MB"* ]] && echo 1)" "rc=$RC $ERR"
done
run DOCUMENT_MAX_PAGES=0;       check "an old DOCUMENT_MAX_PAGES setting is ignored, not an error (there is no page limit any more)" "$([ $RC -eq 0 ] && [ "$OUT" = "true 209715200 1073741824 200" ] && echo 1)" "rc=$RC $OUT $ERR"
run DOCUMENT_MAX_PAGES=abc;     check "...even a nonsense value" "$([ $RC -eq 0 ] && echo 1)" "$ERR"
run DOCUMENT_MAX_FILE_MB=500 DOCUMENT_USER_QUOTA_MB=100
check "a file limit above the per-user quota is rejected" "$([ $RC -ne 0 ] && [[ "$ERR" == *"can't be larger"* ]] && echo 1)" "rc=$RC $ERR"
run DOCUMENT_MAX_FILE_MB=100 DOCUMENT_USER_QUOTA_MB=100
check "equal file limit and quota is fine" "$([ $RC -eq 0 ] && echo 1)" "$ERR"

echo "== unlimited"
run DOCUMENT_MAX_FILE_MB=unlimited DOCUMENT_USER_QUOTA_MB=unlimited DOCUMENT_MAX_COUNT=unlimited
check "unlimited becomes numbers far beyond anything real (1 PB, a million documents)" "$([ "$OUT" = "true 1000000000000000 1000000000000000 1000000" ] && echo 1)" "rc=$RC $OUT $ERR"
run DOCUMENT_MAX_FILE_MB=UNLIMITED DOCUMENT_USER_QUOTA_MB=Unlimited
check "the word is case-insensitive" "$([ "$OUT" = "true 1000000000000000 1000000000000000 200" ] && echo 1)" "rc=$RC $OUT $ERR"
run DOCUMENT_USER_QUOTA_MB=unlimited
check "an unlimited quota with the default file limit is fine" "$([ "$OUT" = "true 209715200 1000000000000000 200" ] && echo 1)" "rc=$RC $OUT $ERR"
run DOCUMENT_MAX_FILE_MB=unlimited DOCUMENT_USER_QUOTA_MB=500
check "an unlimited file size under a finite quota is fine (the quota still bounds it)" "$([ $RC -eq 0 ] && [ "$OUT" = "true 1000000000000000 524288000 200" ] && echo 1)" "rc=$RC $OUT $ERR"
run DOCUMENT_MAX_FILE_MB=5000000 DOCUMENT_USER_QUOTA_MB=unlimited
check "a file limit above the numeric maximum is still rejected (use unlimited)" "$([ $RC -ne 0 ] && [[ "$ERR" == *"DOCUMENT_MAX_FILE_MB"* ]] && echo 1)" "rc=$RC $ERR"
run DOCUMENT_MAX_FILE_MB=unlimitedd
check "a misspelt 'unlimited' is rejected, not treated as unlimited" "$([ $RC -ne 0 ] && [[ "$ERR" == *"DOCUMENT_MAX_FILE_MB"* ]] && echo 1)" "rc=$RC $ERR"
run DOCUMENT_MAX_COUNT=50;  check "DOCUMENT_MAX_COUNT is read" "$([ "${OUT##* }" = 50 ] && echo 1)" "$OUT $ERR"
run DOCUMENT_MAX_COUNT=0;   check "DOCUMENT_MAX_COUNT=0 is rejected" "$([ $RC -ne 0 ] && [[ "$ERR" == *"DOCUMENT_MAX_COUNT"* ]] && echo 1)" "$ERR"

echo; echo "documents.sh: $pass passed, $fail failed"; [ $fail -eq 0 ]
