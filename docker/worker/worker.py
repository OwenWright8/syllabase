#!/usr/bin/env python3
"""Background worker for course documents (textbooks and syllabi).

Runs inside the app container as an unprivileged user, connecting to Postgres as
the restricted `syllabase_worker` role. It picks up documents the browser has
finished uploading (status 'queued'), reassembles the file from its chunks,
extracts each page's text (OCR where a page has none) and stores it, and marks
the document 'ready' or 'failed'. It never opens a port: all coordination is
through the database.

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
        cursor.execute("SELECT enabled, max_pages FROM public.document_limits")
        enabled, max_pages = cursor.fetchone()
    connection.commit()
    return {"enabled": enabled, "max_pages": max_pages}


def requeue_interrupted(connection):
    """A document left 'processing' means the worker died mid-job; start it over."""
    with connection.cursor() as cursor:
        cursor.execute("UPDATE public.course_documents SET status = 'queued', progress = 0 WHERE status = 'processing'")
        if cursor.rowcount:
            log.info("requeued %d interrupted document(s)", cursor.rowcount)
    connection.commit()


def housekeeping(connection):
    """Free the quota held by uploads that were abandoned half way."""
    with connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM public.course_documents WHERE status = 'uploading' AND created_at < now() - make_interval(hours => %s)",
            (STALE_UPLOAD_HOURS,),
        )
        if cursor.rowcount:
            log.info("removed %d abandoned upload(s)", cursor.rowcount)
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


def save_pages(connection, document, pages):
    """Replace the document's stored pages (idempotent, so a retry is safe)."""
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM public.document_pages WHERE document_id = %s", (document["id"],))
        psycopg2.extras.execute_values(
            cursor,
            "INSERT INTO public.document_pages (document_id, page, user_id, text, ocr) VALUES %s",
            [(document["id"], number, document["user_id"], text, ocr) for number, (text, ocr) in enumerate(pages, start=1)],
            page_size=200,
        )
        cursor.execute(
            "UPDATE public.course_documents SET status = 'ready', progress = 100, error = NULL, page_count = %s WHERE id = %s",
            (len(pages), document["id"]),
        )
    connection.commit()


def fail(connection, document_id, message):
    with connection.cursor() as cursor:
        cursor.execute(
            "UPDATE public.course_documents SET status = 'failed', error = %s WHERE id = %s",
            (docproc.friendly_error(message), document_id),
        )
    connection.commit()


def process(connection, tools, cfg, limits, document):
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

        pages, _ = pipeline.extract(tools, path, document["kind"], header, cfg, limits, report, started + cfg.max_seconds)
        save_pages(connection, document, pages)
        log.info("document %s ready: %d page(s), %d OCR'd", document["id"], len(pages), sum(1 for _, ocr in pages if ocr))
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


def main():
    logging.basicConfig(level=logging.INFO, format="[worker] %(message)s", stream=sys.stdout)
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

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
                requeue_interrupted(connection)
                log.info("connected; waiting for documents")

            limits = read_limits(connection)
            if not limits["enabled"]:
                time.sleep(cfg.poll_seconds * 4)
                continue

            if time.monotonic() - last_housekeeping > HOUSEKEEPING_EVERY_SECONDS:
                housekeeping(connection)
                last_housekeeping = time.monotonic()

            document = claim(connection)
            if document is None:
                time.sleep(cfg.poll_seconds)
                continue

            log.info("processing %s (%s, %s)", document["id"], document["kind"], docproc.friendly_error(document["filename"])[:60])
            process(connection, tools, cfg, limits, document)
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
