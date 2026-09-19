# Multi-stage build: compile the static SPA, then serve it with nginx.
#
# Deployment-specific config (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)
# is NOT baked in at build time — it's injected at container *start* from
# environment variables (see docker/40-inject-env.sh), so this same image
# works for anyone's self-hosted domain/keys without rebuilding. This is
# what makes a prebuilt image on GHCR actually useful across deployments.

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine AS serve
RUN apk add --no-cache gettext

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/env.js.template /usr/share/nginx/html/env.js.template
COPY docker/40-inject-env.sh /docker-entrypoint.d/40-inject-env.sh
RUN chmod +x /docker-entrypoint.d/40-inject-env.sh

EXPOSE 80
