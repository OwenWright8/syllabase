-- A reading can point at the part of a textbook it covers, so the readings list
-- can offer "download just this chapter". The pages are PDF page numbers, like
-- document_chapters. If the book is deleted the reading stays (with its title,
-- date and page text) and only loses the download.
ALTER TABLE public.readings
  ADD COLUMN document_id uuid REFERENCES public.course_documents(id) ON DELETE SET NULL,
  ADD COLUMN start_page integer CHECK (start_page IS NULL OR start_page >= 1),
  ADD COLUMN end_page integer,
  ADD CONSTRAINT readings_page_range CHECK (
    (start_page IS NULL AND end_page IS NULL)
    OR (start_page IS NOT NULL AND end_page IS NOT NULL AND end_page >= start_page)
  );

CREATE INDEX idx_readings_document ON public.readings (document_id) WHERE document_id IS NOT NULL;

-- The link must be to one of the user's own documents (the existing row policies
-- only check the reading's own user_id). This runs as the caller, so another
-- user's document is invisible to it and is refused.
CREATE OR REPLACE FUNCTION public.check_reading_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.document_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.document_id IS DISTINCT FROM OLD.document_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.course_documents d
       WHERE d.id = NEW.document_id AND d.user_id = NEW.user_id
     ) THEN
    RAISE EXCEPTION 'A reading can only link to one of your own documents.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_reading_document
  BEFORE INSERT OR UPDATE ON public.readings
  FOR EACH ROW EXECUTE FUNCTION public.check_reading_document();
