#!/usr/bin/env python3
"""Background worker for course documents (textbooks and syllabi).

Runs inside the app container as an unprivileged user, connecting to Postgres as
the restricted `syllabase_worker` role. Two instances run, one per kind of job,
so that someone waiting on a chapter download is never stuck behind a long OCR:

  documents  picks up documents the browser has finished uploading (status
             'queued'), reassembles the file from its chunks, extracts each
             page's text (OCR where a page has none), finds a textbook's
             chapters, and marks the document 'ready' or 'failed';
  extracts   cuts a page range out of a textbook for download.

It never opens a port: all coordination is through the database.

The decisions live in pipeline.py and the tool calls in tools.py; this file is
only the database and the job loop.
"""
import logging
import os
import shutil
import signal
import sys
import tempfile
import time
import traceback

import psycopg2
import psycopg2.extras

import docproc
import pipeline
from tools import Config, ProcessingError, Tools

log = logging.getLogger("worker")

STALE_UPLOAD_HOURS = 24
STALE_EXTRACT_HOURS = 1
# Postgres can't store a single value over 1 GB, so no extract can be larger than this, whatever the file limit.
EXTRACT_MAX_BYTES = 1_000_000_000
JOB_KINDS = ('documents', 'extracts')
HOUSEKEEPING_EVERY_SECONDS = 600

stopping = False


def _stop(signum, frame):
    global stopping
    stopping = True


def connect(url):
    connection = psycopg2.connect(url, connect_timeout=10)
    connection.autocommit = False
    return connection


def read_limits(connection):
    with connection.cursor() as cursor:
        cursor.execute("SELECT enabled, max_file_bytes FROM public.document_limits")
        enabled, max_file_bytes = cursor.fetchone()
    connection.commit()
    return {"enabled": enabled, "max_file_bytes": max_file_bytes}


def requeue_interrupted(connection, jobs):
    """Something left 'processing' means the worker died mid-job; start it over."""
    with connection.cursor() as cursor:
        if jobs == "documents":
            cursor.execute("UPDATE public.course_documents SET status = 'queued', progress = 0 WHERE status = 'processing'")
        else:
            cursor.execute("UPDATE public.document_extracts SET status = 'pending' WHERE status = 'processing'")
        if cursor.rowcount:
            log.info("requeued %d interrupted %s", cursor.rowcount, jobs)
    connection.commit()


def housekeeping(connection, jobs):
    """Free what abandoned work is holding: uploads left half way, downloads never collected."""
    with connection.cursor() as cursor:
        if jobs == "documents":
            cursor.execute(
                "DELETE FROM public.course_documents WHERE status = 'uploading' AND created_at < now() - make_interval(hours => %s)",
                (STALE_UPLOAD_HOURS,),
            )
            what = "abandoned upload(s)"
        else:
            cursor.execute(
                "DELETE FROM public.document_extracts WHERE created_at < now() - make_interval(hours => %s)",
                (STALE_EXTRACT_HOURS,),
            )
            what = "old download(s)"
        if cursor.rowcount:
            log.info("removed %d %s", cursor.rowcount, what)
    connection.commit()


def claim(connection):
    """Take the oldest queued document (safe with several workers) and mark it processing."""
    with connection.cursor(cursor_factory=psycopg2.extras.DictCursor) as cursor:
        cursor.execute(
            """
            UPDATE public.course_documents
               SET status = 'processing', progress = 0, error = NULL
             WHERE id = (SELECT id FROM public.course_documents
                          WHERE status = 'queued'
                          ORDER BY created_at
                          LIMIT 1
                          FOR UPDATE SKIP LOCKED)
            RETURNING id, user_id, kind, filename, size_bytes
            """
        )
        row = cursor.fetchone()
    connection.commit()
    return dict(row) if row else None


def set_progress(connection, document_id, percent):
    with connection.cursor() as cursor:
        cursor.execute("UPDATE public.course_documents SET progress = %s WHERE id = %s", (percent, document_id))
    connection.commit()


def assemble(connection, document, destination):
    """Write the uploaded chunks, in order, to `destination`; refuse if any are missing."""
    expected_seq = 0
    written = 0
    with connection.cursor(name="document_chunks") as cursor, open(destination, "wb") as out:
        cursor.itersize = 4
        cursor.execute("SELECT seq, data FROM public.course_document_chunks WHERE document_id = %s ORDER BY seq", (document["id"],))
        for seq, data in cursor:
            if seq != expected_seq:
                raise ProcessingError("The upload is incomplete (a piece is missing). Please upload the file again.")
            piece = bytes(data)
            out.write(piece)
            written += len(piece)
            expected_seq += 1
    connection.commit()
    if written != document["size_bytes"]:
        raise ProcessingError("The upload is incomplete or was changed. Please upload the file again.")


def save_pages(connection, document, pages, chapters=(), offset=None):
    """Replace the document's stored pages and detected chapters (idempotent, so a
    retry is safe). Chapters the user made or corrected are left alone."""
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM public.document_pages WHERE document_id = %s", (document["id"],))
        psycopg2.extras.execute_values(
            cursor,
            "INSERT INTO public.document_pages (document_id, page, user_id, text, ocr) VALUES %s",
            [(document["id"], number, document["user_id"], text, ocr) for number, (text, ocr) in enumerate(pages, start=1)],
            page_size=200,
        )
        # page_count first: the chapter rows are checked against it.
        cursor.execute(
            "UPDATE public.course_documents SET status = 'ready', progress = 100, error = NULL, page_count = %s WHERE id = %s",
            (len(pages), document["id"]),
        )
        cursor.execute("DELETE FROM public.document_chapters WHERE document_id = %s AND source <> 'manual'", (document["id"],))
        if chapters:
            psycopg2.extras.execute_values(
                cursor,
                "INSERT INTO public.document_chapters (document_id, user_id, number, title, start_page, end_page, source) VALUES %s",
                [
                    (document["id"], document["user_id"], c["number"], c["title"][:200], c["start"], c["end"], c["source"])
                    for c in chapters
                ],
            )
        if offset is not None:
            cursor.execute("UPDATE public.course_documents SET page_offset = %s WHERE id = %s", (offset, document["id"]))
    connection.commit()


def fail(connection, document_id, message):
    with connection.cursor() as cursor:
        cursor.execute(
            "UPDATE public.course_documents SET status = 'failed', error = %s WHERE id = %s",
            (docproc.friendly_error(message), document_id),
        )
    connection.commit()


def process(connection, tools, cfg, document):
    started = time.monotonic()
    workdir = tempfile.mkdtemp(dir=cfg.tmpdir, prefix="doc-")
    try:
        path = os.path.join(workdir, "upload")
        assemble(connection, document, path)
        with open(path, "rb") as handle:
            header = handle.read(2048)

        last = {"percent": -1, "at": 0.0}

        def report(percent):
            # at most one write every couple of seconds, and never for a repeat
            now = time.monotonic()
            if percent != last["percent"] and now - last["at"] >= 2:
                set_progress(connection, document["id"], percent)
                last.update(percent=percent, at=now)

        deadline = started + cfg.max_seconds
        pages, actual = pipeline.extract(tools, path, document["kind"], header, cfg, report, deadline)

        found, offset = [], None
        if document["kind"] == "textbook" and actual == "pdf":
            try:
                found, offset, pages = pipeline.detect_chapters(tools, path, pages, cfg, deadline)
            except Exception:
                # Chapters are a bonus: a book we couldn't split into chapters is still readable.
                log.warning("chapter detection failed for %s:\n%s", document["id"], traceback.format_exc())
                found, offset = [], None

        save_pages(connection, document, pages, found, offset)
        log.info(
            "document %s ready: %d page(s), %d OCR'd, %d chapter(s)",
            document["id"], len(pages), sum(1 for _, ocr in pages if ocr), len(found),
        )
    except ProcessingError as error:
        connection.rollback()
        log.info("document %s failed: %s", document["id"], error)
        fail(connection, document["id"], str(error))
    except psycopg2.Error:
        raise  # database trouble: let the main loop reconnect; the document is requeued on restart
    except Exception:
        connection.rollback()
        log.error("document %s crashed:\n%s", document["id"], traceback.format_exc())
        fail(connection, document["id"], "Processing failed unexpectedly. Try again, or upload a different file.")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def claim_extract(connection):
    """Take the oldest requested extract (safe with several workers) and mark it processing."""
    with connection.cursor(cursor_factory=psycopg2.extras.DictCursor) as cursor:
        cursor.execute(
            """
            UPDATE public.document_extracts
               SET status = 'processing', error = NULL
             WHERE id = (SELECT id FROM public.document_extracts
                          WHERE status = 'pending'
                          ORDER BY created_at
                          LIMIT 1
                          FOR UPDATE SKIP LOCKED)
            RETURNING id, document_id, start_page, end_page
            """
        )
        row = cursor.fetchone()
    connection.commit()
    return dict(row) if row else None


def fail_extract(connection, extract_id, message):
    with connection.cursor() as cursor:
        cursor.execute(
            "UPDATE public.document_extracts SET status = 'failed', error = %s WHERE id = %s",
            (docproc.friendly_error(message), extract_id),
        )
    connection.commit()


def process_extract(connection, tools, cfg, limits, extract):
    """Build the PDF of one page range and store it on the extract."""
    workdir = tempfile.mkdtemp(dir=cfg.tmpdir, prefix="extract-")
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT size_bytes FROM public.course_documents WHERE id = %s", (extract["document_id"],))
            row = cursor.fetchone()
        connection.commit()
        if row is None:
            return  # the book was deleted while this waited; the extract went with it

        source = os.path.join(workdir, "book.pdf")
        assemble(connection, {"id": extract["document_id"], "size_bytes": row[0]}, source)
        result = os.path.join(workdir, "extract.pdf")
        tools.extract_pages(source, extract["start_page"], extract["end_page"], result)

        size = os.path.getsize(result) if os.path.exists(result) else 0
        if size == 0:
            raise ProcessingError("Those pages couldn't be cut out of the book.")
        if size > min(limits["max_file_bytes"], EXTRACT_MAX_BYTES):
            raise ProcessingError("Those pages make a file larger than this server allows. Try a smaller range.")
        with open(result, "rb") as handle:
            data = handle.read()

        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE public.document_extracts SET status = 'ready', error = NULL, data = %s, size_bytes = %s WHERE id = %s",
                (psycopg2.Binary(data), size, extract["id"]),
            )
        connection.commit()
        log.info("extract %s ready: pages %d-%d, %d bytes", extract["id"], extract["start_page"], extract["end_page"], size)
    except ProcessingError as error:
        connection.rollback()
        log.info("extract %s failed: %s", extract["id"], error)
        fail_extract(connection, extract["id"], str(error))
    except psycopg2.Error:
        raise
    except Exception:
        connection.rollback()
        log.error("extract %s crashed:\n%s", extract["id"], traceback.format_exc())
        fail_extract(connection, extract["id"], "Preparing that download failed unexpectedly. Try again.")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main():
    logging.basicConfig(level=logging.INFO, format="[worker] %(message)s", stream=sys.stdout)
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    jobs = sys.argv[1] if len(sys.argv) > 1 else ""
    if jobs not in JOB_KINDS:
        log.error("usage: worker.py %s", " | ".join(JOB_KINDS))
        return 2

    url = os.environ.get("WORKER_DATABASE_URL")
    if not url:
        log.error("WORKER_DATABASE_URL is not set")
        return 1

    cfg = Config()
    os.makedirs(cfg.tmpdir, exist_ok=True)
    tools = Tools(cfg)
    missing = tools.missing()
    if missing:
        log.error("required programs are not installed: %s (documents will fail until they are)", ", ".join(missing))

    connection = None
    last_housekeeping = 0.0
    while not stopping:
        try:
            if connection is None:
                connection = connect(url)
                requeue_interrupted(connection, jobs)
                log.info("connected; waiting for %s", jobs)

            limits = read_limits(connection)
            if not limits["enabled"]:
                time.sleep(cfg.poll_seconds * 4)
                continue

            if time.monotonic() - last_housekeeping > HOUSEKEEPING_EVERY_SECONDS:
                housekeeping(connection, jobs)
                last_housekeeping = time.monotonic()

            if jobs == "extracts":
                extract = claim_extract(connection)
                if extract is None:
                    time.sleep(min(cfg.poll_seconds, 1.0))  # someone is waiting on these
                    continue
                process_extract(connection, tools, cfg, limits, extract)
                continue

            document = claim(connection)
            if document is None:
                time.sleep(cfg.poll_seconds)
                continue

            log.info("processing %s (%s, %s)", document["id"], document["kind"], docproc.friendly_error(document["filename"])[:60])
            process(connection, tools, cfg, document)
        except psycopg2.Error as error:
            log.warning("database error, will reconnect: %s", str(error).strip().splitlines()[0] if str(error).strip() else error)
            try:
                if connection is not None:
                    connection.close()
            except psycopg2.Error:
                pass
            connection = None
            time.sleep(5)

    log.info("stopping")
    if connection is not None:
        connection.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
