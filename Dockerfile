# All-in-one app image: frontend + GoTrue (auth) + PostgREST (REST API) +
# Edge Runtime (the 5 functions), with nginx acting as both the static
# file server and the internal gateway between them (replacing Kong now
# that everything lives in one container — see docker/nginx.app.conf).
# Postgres itself stays in its own container (docker-compose.yml) for
# clean data-volume/backup semantics.
#
# Image versions below (gotrue/postgrest/edge-runtime, and postgres in
# docker-compose.yml) are pinned to match Supabase's own official
# self-hosting reference compose (supabase/supabase docker/docker-compose.yml)
# as of Sept 2026 — earlier versions of this Dockerfile picked
# independent versions of each that turned out to be mutually
# incompatible (confirmed live: GoTrue's own internal schema migrations
# failed against a mismatched postgres baseline). Verify against that
# reference before bumping any one of these independently — they're
# released and tested as a coordinated set, not individually.
#
# The COPY lines below pull compiled binaries out of each upstream
# project's own image at these specific paths — confirmed working via a
# live GitHub Actions build/run of this exact Dockerfile, but re-verify
# if you bump versions and a COPY step starts failing:
#   docker run --rm --entrypoint find supabase/gotrue:<tag> / -maxdepth 3 -iname '*gotrue*'
# Also re-verify these images exist for your host's architecture
# (`docker manifest inspect <image>:<tag>`) before building on ARM (e.g.
# a Raspberry Pi) — only confirmed on linux/amd64 so far.

FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM supabase/gotrue:v2.196.0 AS gotrue-src
FROM postgrest/postgrest:v14.17 AS postgrest-src
FROM supabase/edge-runtime:v1.76.2 AS edge-runtime-src

FROM nginx:1.27-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      postgresql-client gettext-base tini curl ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=gotrue-src /usr/local/bin/gotrue /usr/local/bin/gotrue
COPY --from=postgrest-src /bin/postgrest /usr/local/bin/postgrest
COPY --from=edge-runtime-src /usr/local/bin/edge-runtime /usr/local/bin/edge-runtime

COPY --from=frontend-build /app/dist /app/frontend
COPY supabase/functions /app/functions
COPY supabase/migrations /app/migrations
COPY docker/migrate.sh /app/migrate.sh
# Kept outside the web root (/app/frontend) so it isn't served publicly.
COPY docker/env.js.template /app/env.js.template
COPY docker/nginx.app.conf /etc/nginx/conf.d/default.conf
COPY docker/start.sh /app/start.sh
COPY docker/secrets.sh /app/secrets.sh
RUN chmod +x /app/start.sh /app/migrate.sh

EXPOSE 8080
# Probes GoTrue through the gateway, not just nginx: nginx serves the static
# frontend even when a backend is down, so `GET /` alone reports healthy for
# an instance nobody can sign in to. (start.sh also stops the container if a
# backend process dies; this covers one that's up but not answering.) The
# long start period covers GoTrue's own first-boot schema migrations.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s \
  CMD curl -fsS -o /dev/null http://localhost:8080/auth/v1/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["/app/start.sh"]
