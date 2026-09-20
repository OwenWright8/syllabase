#!/bin/sh
# Applies every migration in supabase/migrations/ that hasn't already been
# applied, tracked in supabase_migrations.schema_migrations (same table
# name/shape the Supabase CLI itself uses) so re-running this on every
# `docker compose up` is a no-op once a migration has landed.
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
"

for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"
  version="${name%%_*}"

  already_applied="$(psql "$DATABASE_URL" -tAc \
    "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '${version}'")"

  if [ "$already_applied" = "1" ]; then
    echo "skip  $name (already applied)"
    continue
  fi

  echo "apply $name"
  # One transaction per migration, covering both the schema change and the
  # bookkeeping row: if any statement fails the whole file rolls back.
  # Applied separately, a failure halfway through left the migration
  # half-applied but unrecorded, so every restart re-ran it and tripped on
  # the parts that had already landed (a permanent crash loop).
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
    -f "$file" \
    -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${version}')"
done

echo "All migrations applied."
