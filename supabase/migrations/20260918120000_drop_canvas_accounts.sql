-- Canvas LMS integration removed: it was tied to one specific school's
-- Canvas instance and doesn't generalize to a self-hostable app used by
-- people at other schools. canvas_accounts is no longer read or written
-- by the app (see also 20260819150200 for the earlier profile-column
-- cleanup from the same integration).
DROP TABLE IF EXISTS public.canvas_accounts;
