-- Sets the password of the internal roles the stack logs in as. Based on
-- Supabase's official self-hosting reference (supabase/supabase
-- docker/volumes/db/roles.sql) — the plain supabase/postgres image does NOT
-- set these roles' passwords to POSTGRES_PASSWORD on its own, and without this
-- authenticator/supabase_auth_admin (which PostgREST/GoTrue connect as) get
-- password-auth-rejected. Copied into the image as
-- /docker-entrypoint-initdb.d/init-scripts/99-roles.sql — see Dockerfile.db.
--
-- This runs exactly once, while the image initialises an empty database, and a
-- failure here aborts that initialisation for good: the container restarts,
-- sees a data directory, and "skips initialization", leaving the database
-- half-configured. So it must not depend on anything that can be missing.
--
-- The upstream version altered five roles unconditionally. That failed
-- intermittently ("role supabase_functions_admin does not exist"): some of the
-- image's roles are only created as a side effect of extension setup (an event
-- trigger fires when pg_net is created), so whether they exist at this point in
-- initialisation is not something we control. Nothing here ever logs in as
-- those roles, so:
--   * the two roles the stack DOES use must exist (created by the image's own
--     init scripts, which have already run) — a failure for them is real and
--     should stay loud;
--   * the others get the password only if they exist yet.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';

-- \gexec runs each row of the result as a statement: one ALTER per optional
-- role that exists, nothing for the rest. (A DO block can't be used because
-- psql doesn't interpolate :'pgpass' inside dollar-quoted text.)
SELECT format('ALTER USER %I WITH PASSWORD %L', rolname, :'pgpass')
FROM pg_roles
WHERE rolname IN ('pgbouncer', 'supabase_functions_admin', 'supabase_storage_admin')
\gexec
