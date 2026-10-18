#!/bin/bash
# Tests docker/update-check.sh under dash (the containers' shell). The GitHub
# API is replaced by files on disk (curl reads file:// URLs).
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SH=/bin/dash
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS - $1"; }
bad() { fail=$((fail+1)); echo "  FAIL - $1  [$2]"; }
check() { if [ "$2" = "1" ]; then ok "$1"; else bad "$1" "${3:-}"; fi; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# settings "ENV..." -> RC, OUT ("enabled version repo"), ERR.
settings() {
  ERRF=$(mktemp)
  OUT=$(env -i PATH="$PATH" "$@" $SH -c 'set -eu; fail() { echo "[start] FATAL: $*" >&2; exit 1; }; . "$0/docker/update-check.sh"; update_check_settings; echo "$UPDATE_CHECK_ENABLED $SYLLABASE_BUILD_VERSION $SYLLABASE_REPO"' "$REPO" 2>"$ERRF"); RC=$?
  ERR=$(cat "$ERRF")
}

# fetch <release JSON or "-" for none> -> RC; the result is in $WORK/update.json.
fetch() {
  rm -rf "$WORK/api"; mkdir -p "$WORK/api/repos/OwenWright8/syllabase/releases"
  [ "$1" = "-" ] || printf '%s' "$1" > "$WORK/api/repos/OwenWright8/syllabase/releases/latest"
  env -i PATH="$PATH" UPDATE_CHECK_API="file://$WORK/api" $SH -c 'set -eu; fail() { exit 1; }; . "$0/docker/update-check.sh"; update_check_settings; update_check_once "$1"' "$REPO" "$WORK/update.json" 2>/dev/null; RC=$?
}
field() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2], ""))' "$WORK/update.json" "$1"; }

echo "== settings"
settings
check "defaults: on, a dev build, the main repository" "$([ "$OUT" = "true dev OwenWright8/syllabase" ] && echo 1)" "rc=$RC out=$OUT $ERR"
for v in off OFF false 0 no; do settings "UPDATE_CHECK=$v"; check "UPDATE_CHECK=$v -> off" "$([ "${OUT%% *}" = false ] && echo 1)" "$OUT $ERR"; done
settings UPDATE_CHECK=; check "empty UPDATE_CHECK (compose pass-through) means on" "$([ "${OUT%% *}" = true ] && echo 1)" "$OUT $ERR"
settings UPDATE_CHECK=sometimes; check "UPDATE_CHECK=sometimes is rejected, says what is allowed" "$([ $RC -ne 0 ] && [[ "$ERR" == *"on or off"* ]] && echo 1)" "rc=$RC $ERR"
settings SYLLABASE_BUILD_VERSION=v1.2.3 SYLLABASE_REPO=someone/fork
check "a release build and a fork are passed through" "$([ "$OUT" = "true v1.2.3 someone/fork" ] && echo 1)" "$OUT $ERR"
settings 'SYLLABASE_BUILD_VERSION=v1"; alert(1); "'
check "a version that could break out of env.js is refused" "$([ $RC -ne 0 ] && echo 1)" "rc=$RC $OUT"
settings 'SYLLABASE_REPO=a/b/../c'
check "a repository that isn't owner/name is refused" "$([ $RC -ne 0 ] && [[ "$ERR" == *"owner/name"* ]] && echo 1)" "rc=$RC $ERR"

echo "== fetching the latest release"
rm -f "$WORK/update.json"
fetch '{"tag_name":"v0.7.0","html_url":"https://github.com/OwenWright8/syllabase/releases/tag/v0.7.0","name":"Chapters tab","published_at":"2026-10-18T12:00:00Z","body":"lots of notes","assets":[]}'
check "a release is written with only the fields the app needs" "$([ $RC -eq 0 ] && [ "$(field latest)" = v0.7.0 ] && [ "$(field name)" = "Chapters tab" ] && [ -z "$(field body)" ] && echo 1)" "rc=$RC $(cat "$WORK/update.json" 2>/dev/null)"
check "the file is readable by nginx" "$([ "$(stat -c %a "$WORK/update.json" 2>/dev/null || stat -f %Lp "$WORK/update.json")" = 644 ] && echo 1)"

fetch -
check "no answer (offline, rate limited) fails and keeps the last good result" "$([ $RC -ne 0 ] && [ "$(field latest)" = v0.7.0 ] && echo 1)" "rc=$RC"
fetch 'not json'
check "garbage keeps the last good result" "$([ $RC -ne 0 ] && [ "$(field latest)" = v0.7.0 ] && echo 1)" "rc=$RC"
fetch '{"tag_name":"<script>","html_url":"https://github.com/x"}'
check "a tag that isn't a version is refused" "$([ $RC -ne 0 ] && [ "$(field latest)" = v0.7.0 ] && echo 1)" "rc=$RC"
fetch '{"tag_name":"v9.9.9","html_url":"https://evil.example/notes"}'
check "release notes that aren't on github.com are refused" "$([ $RC -ne 0 ] && [ "$(field latest)" = v0.7.0 ] && echo 1)" "rc=$RC"
fetch '{"tag_name":"v0.8.0-beta.1","html_url":"https://github.com/OwenWright8/syllabase/releases/tag/v0.8.0-beta.1"}'
check "a pre-release tag is accepted (the frontend decides what to show)" "$([ $RC -eq 0 ] && [ "$(field latest)" = v0.8.0-beta.1 ] && echo 1)" "rc=$RC"
check "no temporary files are left behind" "$([ -z "$(ls "$WORK" | grep tmp)" ] && echo 1)" "$(ls "$WORK")"

echo; echo "update-check.sh: $pass passed, $fail failed"; [ $fail -eq 0 ]
