-- The number of documents per user was fixed at 200 in the upload policy. Make it
-- a setting (DOCUMENT_MAX_COUNT, written by start.sh like the other limits) so a
-- private instance can raise it or turn it off.
ALTER TABLE public.document_limits ADD COLUMN max_documents integer NOT NULL DEFAULT 200 CHECK (max_documents >= 1);

DROP POLICY "Users can start their own uploads" ON public.course_documents;
CREATE POLICY "Users can start their own uploads" ON public.course_documents
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND status = 'uploading'
    AND uploaded_bytes = 0
    AND progress = 0
    AND page_count IS NULL
    AND error IS NULL
    AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.user_id = auth.uid())
    AND (SELECT enabled FROM public.document_limits)
    AND size_bytes <= (SELECT max_file_bytes FROM public.document_limits)
    AND size_bytes + (SELECT COALESCE(SUM(d.size_bytes), 0) FROM public.course_documents d WHERE d.user_id = auth.uid())
        <= (SELECT max_user_bytes FROM public.document_limits)
    AND (SELECT count(*) FROM public.course_documents d WHERE d.user_id = auth.uid())
        < (SELECT max_documents FROM public.document_limits)
  );
