-- Copied verbatim from Supabase's official self-hosting reference
-- (supabase/supabase docker/volumes/db/jwt.sql). Runs early enough in
-- the init sequence (before the baked-in migrations revoke postgres's
-- elevated privileges) that this ALTER DATABASE succeeds — running the
-- same kind of statement later, from outside this init sequence, fails
-- with "permission denied to set parameter" (confirmed against a live
-- run — see start.sh's notification-cron comment for how that's worked
-- around elsewhere).
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
