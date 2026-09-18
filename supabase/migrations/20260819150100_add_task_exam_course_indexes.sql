-- tasks/exams/courses were missing indexes on the columns every RLS-scoped
-- query filters on (user_id) and the common join/filter columns.
CREATE INDEX idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX idx_tasks_course_id ON public.tasks(course_id);
CREATE INDEX idx_tasks_exam_id ON public.tasks(exam_id);
CREATE INDEX idx_exams_user_id ON public.exams(user_id);
CREATE INDEX idx_exams_course_id ON public.exams(course_id);
CREATE INDEX idx_courses_user_id ON public.courses(user_id);
