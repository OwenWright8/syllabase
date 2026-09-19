-- Admin role removed: it existed for admin-only support tooling in a
-- multi-tenant cloud SaaS context, which no longer applies now that each
-- deployment is a single self-hosted instance with a small, self-managed
-- set of accounts. Nothing in the app reads has_role()/user_roles/app_role
-- anymore.
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);
DROP TABLE IF EXISTS public.user_roles;
DROP TYPE IF EXISTS public.app_role;
