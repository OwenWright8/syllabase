# Multi-stage build: compile the static SPA, then serve it with nginx.
#
# VITE_* variables are baked into the JS bundle at BUILD time (Vite doesn't
# read them at runtime), so they must be passed as build args — see the
# `frontend` service's `build.args` in docker-compose.yml, which sources
# them from your .env file.

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

FROM nginx:alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
