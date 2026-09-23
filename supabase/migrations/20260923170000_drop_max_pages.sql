-- There is no longer a limit on the number of pages in a PDF (the file-size limit
-- and the worker's time limit are what bound the work), so the setting goes.
ALTER TABLE public.document_limits DROP COLUMN max_pages;
