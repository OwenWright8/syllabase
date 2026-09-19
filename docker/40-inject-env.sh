#!/bin/sh
# Runs automatically at container start (nginx:alpine's own entrypoint
# executes every /docker-entrypoint.d/*.sh before starting nginx) — writes
# this deployment's actual config into env.js from whatever
# VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY were passed to the
# container, so the same prebuilt image works for any self-hoster.
set -eu

envsubst '${VITE_SUPABASE_URL} ${VITE_SUPABASE_PUBLISHABLE_KEY}' \
  < /usr/share/nginx/html/env.js.template \
  > /usr/share/nginx/html/env.js
