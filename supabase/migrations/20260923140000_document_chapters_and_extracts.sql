-- Textbook chapters and per-chapter downloads.
--
-- The worker finds a textbook's chapters (from the PDF's bookmarks, or from its
-- printed contents page) and stores them here; the user can correct them, add
-- their own, or delete them. To download "just chapter 5" the browser asks for
-- an *extract* (a page range of the book), the worker cuts those pages into a
-- small PDF without re-encoding them, and the browser reads it back in pieces.
-- Same rules as the rest of the document tables: row level security per user,
-- column-level privileges, and every limit enforced here rather than in the UI.

-- ---------------------------------------------------------------------------
-- Documents per user. The size quota alone still allows a great many tiny
-- files, so the number of documents is bounded too.
-- ---------------------------------------------------------------------------
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
    AND (SELECT count(*) FROM public.course_documents d WHERE d.user_id = auth.uid()) < 200
  );

ALTER TABLE public.course_documents
  ADD CONSTRAINT course_documents_page_offset_range CHECK (page_offset BETWEEN -2000 AND 2000);

-- The worker records the offset it detects (printed page + offset = PDF page).
GRANT UPDATE (page_offset) ON public.course_documents TO syllabase_worker;

-- ---------------------------------------------------------------------------
-- Chapters. start_page/end_page are PDF page numbers (1 = the first page of the
-- file), so a chapter can always be cut out without knowing the printed numbers.
-- ---------------------------------------------------------------------------
CREATE TABLE public.document_chapters (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES public.course_documents(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The chapter's number as the book prints it ("Chapter 5" = 5); null when it has none.
  number      integer CHECK (number IS NULL OR number BETWEEN 0 AND 999),
  title       text NOT NULL DEFAULT '' CHECK (char_length(title) <= 200),
  start_page  integer NOT NULL CHECK (start_page >= 1),
  end_page    integer NOT NULL,
  -- Where it came from, so the UI can say how far to trust it.
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('outline', 'toc', 'manual')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_page >= start_page)
);
CREATE INDEX idx_document_chapters_document ON public.document_chapters (document_id, start_page);

ALTER TABLE public.document_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chapters" ON public.document_chapters
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can add their own chapters" ON public.document_chapters
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can edit their own chapters" ON public.document_chapters
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own chapters" ON public.document_chapters
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "The worker manages chapters" ON public.document_chapters
  FOR ALL TO syllabase_worker USING (true) WITH CHECK (true);

REVOKE ALL ON public.document_chapters FROM anon, authenticated, syllabase_worker;
GRANT SELECT, DELETE ON public.document_chapters TO authenticated;
GRANT INSERT (document_id, user_id, number, title, start_page, end_page) ON public.document_chapters TO authenticated;
GRANT UPDATE (number, title, start_page, end_page) ON public.document_chapters TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.document_chapters TO syllabase_worker;

-- A chapter belongs to the writer's own textbook and lies inside it. Anything a
-- signed-in user writes counts as manual, whatever they send.
CREATE OR REPLACE FUNCTION public.check_document_chapter()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  doc public.course_documents%ROWTYPE;
BEGIN
  SELECT * INTO doc FROM public.course_documents WHERE id = NEW.document_id;
  IF NOT FOUND OR doc.user_id <> NEW.user_id OR doc.kind <> 'textbook' THEN
    RAISE EXCEPTION 'Chapters can only be added to one of your own textbooks.' USING ERRCODE = 'check_violation';
  END IF;
  -- (The worker adds chapters while it is still finishing the book, so only a
  -- signed-in user is held to "already read".)
  IF current_user = 'authenticated' AND doc.status <> 'ready' THEN
    RAISE EXCEPTION 'That textbook has not been read yet.' USING ERRCODE = 'check_violation';
  END IF;
  IF doc.page_count IS NULL OR NEW.end_page > doc.page_count THEN
    RAISE EXCEPTION 'That range ends after the last page (the book has % pages).', COALESCE(doc.page_count, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  IF current_user = 'authenticated' THEN
    NEW.source := 'manual';
    IF TG_OP = 'INSERT'
       AND (SELECT count(*) FROM public.document_chapters c WHERE c.document_id = NEW.document_id) >= 500 THEN
      RAISE EXCEPTION 'A book can have at most 500 chapters.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_document_chapter
  BEFORE INSERT OR UPDATE ON public.document_chapters
  FOR EACH ROW EXECUTE FUNCTION public.check_document_chapter();

-- ---------------------------------------------------------------------------
-- Extracts: a page range cut out of a textbook. Short-lived: the browser deletes
-- one once it has downloaded it and the worker sweeps up any left over, so they
-- never pile up as stored data.
-- ---------------------------------------------------------------------------
CREATE TABLE public.document_extracts (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES public.course_documents(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_page  integer NOT NULL CHECK (start_page >= 1),
  end_page    integer NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  error       text CHECK (error IS NULL OR char_length(error) <= 500),
  size_bytes  bigint CHECK (size_bytes IS NULL OR size_bytes > 0),
  data        bytea,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_page >= start_page),
  CHECK (status <> 'ready' OR (data IS NOT NULL AND size_bytes IS NOT NULL)),
  UNIQUE (document_id, start_page, end_page)
);
CREATE INDEX idx_document_extracts_status ON public.document_extracts (status) WHERE status IN ('pending', 'processing');

-- Already-compressed PDF data doesn't shrink, and storing it uncompressed lets
-- Postgres read one slice without unpacking the whole value.
ALTER TABLE public.document_extracts ALTER COLUMN data SET STORAGE EXTERNAL;

ALTER TABLE public.document_extracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own extracts" ON public.document_extracts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can request their own extracts" ON public.document_extracts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Users can delete their own extracts" ON public.document_extracts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "The worker sees every extract" ON public.document_extracts
  FOR SELECT TO syllabase_worker USING (true);
CREATE POLICY "The worker fills extracts in" ON public.document_extracts
  FOR UPDATE TO syllabase_worker USING (true) WITH CHECK (true);
CREATE POLICY "The worker sweeps up extracts" ON public.document_extracts
  FOR DELETE TO syllabase_worker USING (true);

-- Users can't read the bytes with a plain SELECT (that would be one enormous
-- JSON value); they fetch them a piece at a time with extract_piece() below.
REVOKE ALL ON public.document_extracts FROM anon, authenticated, syllabase_worker;
GRANT SELECT (id, document_id, user_id, start_page, end_page, status, error, size_bytes, created_at)
  ON public.document_extracts TO authenticated;
GRANT DELETE ON public.document_extracts TO authenticated;
GRANT INSERT (document_id, user_id, start_page, end_page) ON public.document_extracts TO authenticated;
GRANT SELECT, DELETE ON public.document_extracts TO syllabase_worker;
GRANT UPDATE (status, error, data, size_bytes) ON public.document_extracts TO syllabase_worker;

-- May this user ask for these pages? Their own, finished textbook; a real range;
-- uploads switched on; and not too many at once.
CREATE OR REPLACE FUNCTION public.check_document_extract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  doc public.course_documents%ROWTYPE;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO doc FROM public.course_documents WHERE id = NEW.document_id;
  IF NOT FOUND OR doc.user_id <> NEW.user_id OR doc.kind <> 'textbook' OR doc.status <> 'ready' THEN
    RAISE EXCEPTION 'Pages can only be taken from one of your own textbooks that has been read.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.end_page > doc.page_count THEN
    RAISE EXCEPTION 'That range ends after the last page (the book has % pages).', doc.page_count
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (SELECT enabled FROM public.document_limits) THEN
    RAISE EXCEPTION 'Course materials are switched off on this server.' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.document_extracts e WHERE e.user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Too many downloads are being prepared at once. Wait for one to finish.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_document_extract
  BEFORE INSERT ON public.document_extracts
  FOR EACH ROW EXECUTE FUNCTION public.check_document_extract();

-- One piece (768 KiB, which is exactly 1 MiB once base64-encoded) of a finished
-- extract, for its owner only. Past the end it returns an empty string.
-- SECURITY DEFINER because users have no right to the data column itself.
CREATE OR REPLACE FUNCTION public.extract_piece(p_extract uuid, p_piece integer)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT replace(encode(substring(e.data FROM p_piece * 786432 + 1 FOR 786432), 'base64'), E'\n', '')
    FROM public.document_extracts e
   WHERE e.id = p_extract
     AND e.user_id = auth.uid()
     AND e.status = 'ready'
     AND p_piece >= 0
$$;
REVOKE EXECUTE ON FUNCTION public.extract_piece(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extract_piece(uuid, integer) TO authenticated;
