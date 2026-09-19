-- Copied verbatim from Supabase's official self-hosting reference
-- (supabase/supabase docker/volumes/db/roles.sql) — the plain
-- supabase/postgres image does NOT set these internal roles' passwords
-- to POSTGRES_PASSWORD on its own; this extra init script is what does
-- that, and without it authenticator/supabase_auth_admin (which
-- PostgREST/GoTrue connect as) get password-auth-rejected. Mounted into
-- the db service at /docker-entrypoint-initdb.d/init-scripts/99-roles.sql
-- — see docker-compose.yml.
--
-- NOTE: change to your own passwords for production environments
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
