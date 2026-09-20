#!/bin/sh
# CI helper: wait until the gateway serves the app AND GoTrue answers. nginx
# serves the static frontend even when a backend has crashed, so "the page
# loads" proves little; GoTrue also runs a long migration set on first boot.
set -eu
BASE="${BASE_URL:-http://localhost:8080}"
for path in / /auth/v1/health; do
  i=0
  until curl -fs "$BASE$path" >/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then
      echo "$BASE$path never became healthy"
      exit 1
    fi
    sleep 5
  done
  echo "$path OK after $i retries"
done
