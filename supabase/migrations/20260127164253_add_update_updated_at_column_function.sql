-- Forward-declared: several later migrations attach triggers that call
-- this function, but it was never actually defined in any migration file
-- (it only ever existed live on the cloud project, applied out-of-band).
-- Needed for a from-scratch replay (fresh self-hosted installs, local
-- `supabase db reset`) to succeed.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
