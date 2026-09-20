#!/bin/bash
# Runs the container-script tests. They exercise the shell logic of the Docker
# setup (secret generation, the database entrypoint wrapper, the start script's
# config handling) under dash, the shell the containers use — no Docker needed.
# Requires: bash, dash, openssl, python3.
set -u
cd "$(dirname "$0")"
status=0
for t in secrets.test.sh db-entrypoint.test.sh start-config.test.sh; do
  echo "=== $t"
  bash "./$t" || status=1
done
exit $status
