-- Forward-declared: the next migration's "Admins can read all roles" policy
-- calls public.has_role() before it was otherwise defined until much later
-- (20260125203530). A from-scratch replay needs the enum type, the table
-- has_role() reads from, and the function itself to all exist before that
-- policy is created. Everything here is guarded/idempotent so the later
-- migration's own (now-redundant) CREATE TYPE/TABLE statements stay
-- harmless no-ops rather than needing to be edited.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;
