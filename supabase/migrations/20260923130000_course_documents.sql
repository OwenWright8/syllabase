-- Course materials: textbooks and syllabi uploaded per course, stored in
-- Postgres and processed (text extraction / OCR) by a background worker that
-- runs inside the app container as its own restricted role.
--
-- Everything the browser does goes through PostgREST under the usual
-- per-user row level security; nothing here adds an endpoint. Because sign-up
-- is open, the limits (file size, per-user total, page count) and the "may this
-- row be written" rules are enforced HERE, in the database, not in the UI.

-- ---------------------------------------------------------------------------
-- The role the worker connects as. start.sh creates it (as the image's real
-- superuser) and sets its password on every boot; this only covers running the
-- migrations somewhere start.sh hasn't. It can touch the document tables and
-- nothing else, and has no BYPASSRLS: it gets explicit policies below.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'syllabase_worker') THEN
    CREATE ROLE syllabase_worker LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Limits and the on/off switch: one row, written by start.sh from the
-- environment on every boot (users can read it, never change it).
-- ---------------------------------------------------------------------------
CREATE TABLE public.document_limits (
  singleton       boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled         boolean NOT NULL DEFAULT true,
  max_file_bytes  bigint  NOT NULL DEFAULT 209715200,   -- 200 MB per file
  max_user_bytes  bigint  NOT NULL DEFAULT 1073741824,  -- 1 GB per user
  max_pages       integer NOT NULL DEFAULT 1500
);
INSERT INTO public.document_limits DEFAULT VALUES;

ALTER TABLE public.document_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read the limits" ON public.document_limits
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "The worker can read the limits" ON public.document_limits
  FOR SELECT TO syllabase_worker USING (true);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_documents (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id      uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('textbook', 'syllabus')),
  filename       text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
  mime_type      text CHECK (mime_type IS NULL OR char_length(mime_type) <= 127),
  size_bytes     bigint NOT NULL CHECK (size_bytes > 0),
  uploaded_bytes bigint NOT NULL DEFAULT 0 CHECK (uploaded_bytes >= 0),
  status         text NOT NULL DEFAULT 'uploading'
                   CHECK (status IN ('uploading', 'queued', 'processing', 'ready', 'failed')),
  progress       integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error          text CHECK (error IS NULL OR char_length(error) <= 500),
  page_count     integer CHECK (page_count IS NULL OR page_count >= 0),
  -- printed page number -> PDF page number shift (PDF page = printed + offset).
  page_offset    integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (uploaded_bytes <= size_bytes)
);
CREATE INDEX idx_course_documents_user_course ON public.course_documents (user_id, course_id);
CREATE INDEX idx_course_documents_status ON public.course_documents (status) WHERE status IN ('queued', 'processing');

CREATE TRIGGER update_course_documents_updated_at
  BEFORE UPDATE ON public.course_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.course_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own documents" ON public.course_documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- A new document must be the user's own, for one of the user's own courses (the
-- subquery runs under the caller's RLS, so another user's course id finds
-- nothing), start empty, respect the size limits, and only while uploads are on.
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
  );

-- Users may only ever ask for processing (uploading/failed -> queued, enforced
-- by the trigger below) or correct the page offset. Everything else about a
-- document is the worker's to set, so column privileges below hide it.
CREATE POLICY "Users can update their own documents" ON public.course_documents
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents" ON public.course_documents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "The worker sees every document" ON public.course_documents
  FOR SELECT TO syllabase_worker USING (true);
CREATE POLICY "The worker updates every document" ON public.course_documents
  FOR UPDATE TO syllabase_worker USING (true) WITH CHECK (true);
CREATE POLICY "The worker cleans up documents" ON public.course_documents
  FOR DELETE TO syllabase_worker USING (true);

-- Column-level privileges: the API's default grants give every role ALL on new
-- tables, so start from nothing and grant only what each role needs.
REVOKE ALL ON public.course_documents FROM anon, authenticated, syllabase_worker;
GRANT SELECT, DELETE ON public.course_documents TO authenticated;
GRANT INSERT (id, user_id, course_id, kind, filename, mime_type, size_bytes) ON public.course_documents TO authenticated;
GRANT UPDATE (status, page_offset) ON public.course_documents TO authenticated;
GRANT SELECT, DELETE ON public.course_documents TO syllabase_worker;
GRANT UPDATE (status, progress, error, page_count, uploaded_bytes) ON public.course_documents TO syllabase_worker;

-- What a signed-in user may do to a document's status, and when.
CREATE OR REPLACE FUNCTION public.guard_document_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- The worker and the migrations are trusted; only the API's user role is checked.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status IN ('uploading', 'failed') AND NEW.status = 'queued') THEN
      RAISE EXCEPTION 'A document can only be queued for processing (from uploading or failed), not moved from % to %.', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status = 'uploading' AND OLD.uploaded_bytes <> OLD.size_bytes THEN
      RAISE EXCEPTION 'The upload is incomplete (% of % bytes).', OLD.uploaded_bytes, OLD.size_bytes
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_course_documents_update
  BEFORE UPDATE ON public.course_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_update();

-- ---------------------------------------------------------------------------
-- The file itself, in 1 MiB chunks (so no single request or row is huge).
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_document_chunks (
  document_id uuid NOT NULL REFERENCES public.course_documents(id) ON DELETE CASCADE,
  seq         integer NOT NULL CHECK (seq >= 0),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        bytea NOT NULL,
  PRIMARY KEY (document_id, seq)
);

ALTER TABLE public.course_document_chunks ENABLE ROW LEVEL SECURITY;

-- A chunk is added only to the user's own document that is still uploading.
CREATE POLICY "Users can upload chunks of their own documents" ON public.course_document_chunks
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.course_documents d
      WHERE d.id = document_id AND d.user_id = auth.uid() AND d.status = 'uploading'
    )
  );
-- Users can list which chunks exist (to resume) but never read the bytes back:
-- SELECT is granted on the two key columns only.
CREATE POLICY "Users can list the chunks of their own documents" ON public.course_document_chunks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "The worker reads every chunk" ON public.course_document_chunks
  FOR SELECT TO syllabase_worker USING (true);

REVOKE ALL ON public.course_document_chunks FROM anon, authenticated, syllabase_worker;
GRANT SELECT (document_id, seq) ON public.course_document_chunks TO authenticated;
GRANT INSERT (document_id, seq, user_id, data) ON public.course_document_chunks TO authenticated;
GRANT SELECT ON public.course_document_chunks TO syllabase_worker;

-- Enforce the per-chunk size and the declared total, and keep the running total
-- (uploaded_bytes) on the document. SECURITY DEFINER because users have no
-- UPDATE right on that column.
CREATE OR REPLACE FUNCTION public.account_for_document_chunk()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chunk_bytes integer := octet_length(NEW.data);
  doc public.course_documents%ROWTYPE;
BEGIN
  IF chunk_bytes = 0 OR chunk_bytes > 1048576 THEN
    RAISE EXCEPTION 'A chunk must be between 1 byte and 1 MiB (got % bytes).', chunk_bytes
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the document row so concurrent chunk uploads keep an exact total.
  SELECT * INTO doc FROM public.course_documents WHERE id = NEW.document_id FOR UPDATE;
  IF NOT FOUND OR doc.user_id <> NEW.user_id OR doc.status <> 'uploading' THEN
    RAISE EXCEPTION 'That document is not accepting chunks.' USING ERRCODE = 'check_violation';
  END IF;
  IF doc.uploaded_bytes + chunk_bytes > doc.size_bytes THEN
    RAISE EXCEPTION 'The chunks are larger than the declared file size (% bytes).', doc.size_bytes
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.course_documents SET uploaded_bytes = uploaded_bytes + chunk_bytes WHERE id = doc.id;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.account_for_document_chunk() FROM PUBLIC;

CREATE TRIGGER account_for_course_document_chunk
  BEFORE INSERT ON public.course_document_chunks
  FOR EACH ROW EXECUTE FUNCTION public.account_for_document_chunk();

-- ---------------------------------------------------------------------------
-- Extracted text, one row per page. Written by the worker; users read it (the
-- syllabus text feeds the reading extractor in the browser).
-- ---------------------------------------------------------------------------
CREATE TABLE public.document_pages (
  document_id uuid NOT NULL REFERENCES public.course_documents(id) ON DELETE CASCADE,
  page        integer NOT NULL CHECK (page >= 1),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text        text NOT NULL DEFAULT '',
  ocr         boolean NOT NULL DEFAULT false,
  PRIMARY KEY (document_id, page)
);

ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read the pages of their own documents" ON public.document_pages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "The worker manages pages" ON public.document_pages
  FOR ALL TO syllabase_worker USING (true) WITH CHECK (true);

REVOKE ALL ON public.document_pages FROM anon, authenticated, syllabase_worker;
GRANT SELECT ON public.document_pages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.document_pages TO syllabase_worker;

-- ---------------------------------------------------------------------------
-- The rest of the API's grants for these tables.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.document_limits FROM anon, authenticated, syllabase_worker;
GRANT SELECT ON public.document_limits TO authenticated, syllabase_worker;

GRANT USAGE ON SCHEMA public TO syllabase_worker;
