-- readings.user_id had no foreign key / cascade, unlike courses/exams/tasks/canvas_accounts,
-- which left readings orphaned when an account was deleted.
ALTER TABLE public.readings
  ADD CONSTRAINT readings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
