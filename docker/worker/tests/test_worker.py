"""Control flow of worker.py against a fake database connection.

psycopg2 isn't needed (or installed) here: it is stubbed. What this checks is
what the worker DECIDES: order of reassembly, what counts as an incomplete
upload, which failures become a message for the user, and which are let through
to the reconnect logic. The SQL itself only runs for real in CI.
"""
import os
import sys
import tempfile
import types
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# --- stub psycopg2 before importing worker ------------------------------------------------
psycopg2 = types.ModuleType("psycopg2")


class DatabaseError(Exception):
    pass


psycopg2.Error = DatabaseError
psycopg2.connect = lambda *a, **k: None
psycopg2.Binary = lambda data: ("BINARY", bytes(data))
extras = types.ModuleType("psycopg2.extras")
extras.DictCursor = object
extras.execute_values = lambda cursor, sql, rows, page_size=100: cursor.executed_many.append((sql, list(rows)))
psycopg2.extras = extras
sys.modules["psycopg2"] = psycopg2
sys.modules["psycopg2.extras"] = extras

import worker  # noqa: E402
from tools import Config, ProcessingError  # noqa: E402

PDF = b"%PDF-1.7\n"


class FakeCursor:
    def __init__(self, db, named):
        self.db = db
        self.named = named
        self.itersize = 0
        self.rowcount = 0
        self.executed_many = db.executed_many
        self._rows = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.db.statements.append((" ".join(sql.split()), params))
        if "FROM public.course_document_chunks" in sql:
            self._rows = list(self.db.chunks)

    def __iter__(self):
        return iter(self._rows)

    def fetchone(self):
        return self.db.next_row


class FakeConnection:
    def __init__(self, chunks):
        self.chunks = chunks
        self.statements = []
        self.executed_many = []
        self.commits = 0
        self.rollbacks = 0
        self.next_row = None  # what fetchone() returns

    def cursor(self, name=None, cursor_factory=None):
        return FakeCursor(self, name)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def statements_like(self, fragment):
        return [(s, p) for s, p in self.statements if fragment in s]


class FakeTools:
    def __init__(self, texts, fail_with=None):
        self.texts = texts
        self.fail_with = fail_with

    def needs_password(self, path):
        return False

    def page_count(self, path):
        if self.fail_with:
            raise self.fail_with
        return len(self.texts)

    def text(self, path, first, last):
        return "".join(t + "\f" for t in self.texts[first - 1:last])

    def ocr_page(self, path, page):
        return "ocr " * 20

    def ocr_image(self, path):
        return "readable text here"


def make_document(size, kind="syllabus"):
    return {"id": "doc-1", "user_id": "user-1", "kind": kind, "filename": "syllabus.pdf", "size_bytes": size}


REAL = "This page has plenty of real text on it."


def run_process(chunks, size, tools=None, kind="syllabus"):
    connection = FakeConnection(chunks)
    cfg = Config({"WORKER_TMPDIR": tempfile.gettempdir()})
    document = make_document(size, kind)
    worker.process(connection, tools or FakeTools([REAL, REAL]), cfg, {"enabled": True, "max_pages": 100}, document)
    return connection


class Reassembly(unittest.TestCase):
    def test_a_complete_upload_is_processed_and_saved_as_ready(self):
        body = PDF + b"x" * 20
        connection = run_process([(0, memoryview(body[:15])), (1, memoryview(body[15:]))], len(body))

        (sql, rows), = connection.executed_many
        self.assertIn("INSERT INTO public.document_pages", sql)
        self.assertEqual([(r[1], r[3], r[4]) for r in rows], [(1, REAL, False), (2, REAL, False)])
        self.assertEqual({r[0] for r in rows}, {"doc-1"})
        self.assertEqual({r[2] for r in rows}, {"user-1"})  # pages are owned by the document's owner
        ready = connection.statements_like("SET status = 'ready'")
        self.assertEqual(len(ready), 1)
        self.assertEqual(ready[0][1], (2, "doc-1"))         # page_count, id
        self.assertEqual(connection.statements_like("SET status = 'failed'"), [])

    def test_pages_are_replaced_not_appended_so_a_retry_is_safe(self):
        body = PDF + b"y" * 5
        connection = run_process([(0, memoryview(body))], len(body))
        delete = connection.statements_like("DELETE FROM public.document_pages")
        insert = connection.statements
        self.assertEqual(len(delete), 1)
        self.assertLess(insert.index(delete[0]), len(insert))

    def test_a_missing_chunk_fails_with_a_message_and_processes_nothing(self):
        body = PDF + b"z" * 10
        connection = run_process([(0, memoryview(body[:5])), (2, memoryview(body[5:]))], len(body))
        failed = connection.statements_like("SET status = 'failed'")
        self.assertEqual(len(failed), 1)
        self.assertIn("incomplete", failed[0][1][0])
        self.assertEqual(connection.executed_many, [])
        self.assertEqual(connection.statements_like("SET status = 'ready'"), [])

    def test_chunks_that_do_not_add_up_to_the_declared_size_fail(self):
        connection = run_process([(0, memoryview(PDF + b"abc"))], 9999)
        failed = connection.statements_like("SET status = 'failed'")
        self.assertEqual(len(failed), 1)
        self.assertIn("incomplete", failed[0][1][0])

    def test_no_chunks_at_all_fails(self):
        connection = run_process([], 100)
        self.assertEqual(len(connection.statements_like("SET status = 'failed'")), 1)


class Failures(unittest.TestCase):
    body = PDF + b"q" * 8

    def chunks(self):
        return [(0, memoryview(self.body))], len(self.body)

    def test_a_processing_error_becomes_the_users_message(self):
        chunks, size = self.chunks()
        connection = run_process(chunks, size, tools=FakeTools([REAL], fail_with=ProcessingError("Reading the PDF failed. The file may be damaged.")))
        failed = connection.statements_like("SET status = 'failed'")
        self.assertEqual(failed[0][1], ("Reading the PDF failed. The file may be damaged.", "doc-1"))
        self.assertEqual(connection.rollbacks, 1)

    def test_an_unexpected_exception_gives_a_generic_message_not_a_traceback(self):
        chunks, size = self.chunks()
        connection = run_process(chunks, size, tools=FakeTools([REAL], fail_with=RuntimeError("secret internal detail /var/lib/x")))
        failed = connection.statements_like("SET status = 'failed'")
        message = failed[0][1][0]
        self.assertNotIn("secret internal detail", message)
        self.assertNotIn("Traceback", message)
        self.assertIn("unexpectedly", message)

    def test_a_database_error_is_not_swallowed_so_the_worker_can_reconnect(self):
        chunks, size = self.chunks()
        with self.assertRaises(DatabaseError):
            run_process(chunks, size, tools=FakeTools([REAL], fail_with=DatabaseError("connection lost")))

    def test_error_text_is_clipped_to_the_column_limit(self):
        chunks, size = self.chunks()
        connection = run_process(chunks, size, tools=FakeTools([REAL], fail_with=ProcessingError("x" * 2000)))
        self.assertLessEqual(len(connection.statements_like("SET status = 'failed'")[0][1][0]), 500)

    def test_the_temp_directory_is_always_cleaned_up(self):
        chunks, size = self.chunks()
        tmp = tempfile.mkdtemp()
        connection = FakeConnection(chunks)
        cfg = Config({"WORKER_TMPDIR": tmp})
        worker.process(connection, FakeTools([REAL], fail_with=ProcessingError("no")), cfg, {"enabled": True, "max_pages": 10}, make_document(size))
        self.assertEqual(os.listdir(tmp), [])


class Housekeeping(unittest.TestCase):
    def test_claim_marks_the_oldest_queued_document_and_skips_locked_rows(self):
        connection = FakeConnection([])
        worker.claim(connection)
        sql = connection.statements[0][0]
        self.assertIn("status = 'queued'", sql)
        self.assertIn("ORDER BY created_at", sql)
        self.assertIn("FOR UPDATE SKIP LOCKED", sql)
        self.assertIn("SET status = 'processing'", sql)

    def test_claim_returns_nothing_when_the_queue_is_empty(self):
        self.assertIsNone(worker.claim(FakeConnection([])))

    def test_claim_returns_the_document_as_a_plain_dict(self):
        connection = FakeConnection([])
        connection.next_row = {"id": "d", "user_id": "u", "kind": "syllabus", "filename": "f.pdf", "size_bytes": 5}
        self.assertEqual(worker.claim(connection)["id"], "d")

    def test_startup_requeues_documents_a_dead_worker_left_processing(self):
        connection = FakeConnection([])
        worker.requeue_interrupted(connection, "documents")
        self.assertIn("SET status = 'queued'", connection.statements[0][0])
        self.assertIn("WHERE status = 'processing'", connection.statements[0][0])

    def test_abandoned_uploads_are_removed_only_when_still_uploading(self):
        connection = FakeConnection([])
        worker.housekeeping(connection, "documents")
        sql, params = connection.statements[0]
        self.assertIn("DELETE FROM public.course_documents WHERE status = 'uploading'", sql)
        self.assertEqual(params, (worker.STALE_UPLOAD_HOURS,))

    def test_startup_requeues_extracts_a_dead_worker_left_processing(self):
        connection = FakeConnection([])
        worker.requeue_interrupted(connection, "extracts")
        self.assertIn("UPDATE public.document_extracts SET status = 'pending'", connection.statements[0][0])
        self.assertIn("WHERE status = 'processing'", connection.statements[0][0])

    def test_old_extracts_are_swept_up_whatever_their_state(self):
        connection = FakeConnection([])
        worker.housekeeping(connection, "extracts")
        sql, params = connection.statements[0]
        self.assertIn("DELETE FROM public.document_extracts", sql)
        self.assertNotIn("status", sql)
        self.assertEqual(params, (worker.STALE_EXTRACT_HOURS,))

    def test_claim_extract_takes_the_oldest_pending_one_and_skips_locked_rows(self):
        connection = FakeConnection([])
        self.assertIsNone(worker.claim_extract(connection))
        sql = connection.statements[0][0]
        for fragment in ("status = 'pending'", "ORDER BY created_at", "FOR UPDATE SKIP LOCKED", "SET status = 'processing'"):
            self.assertIn(fragment, sql)


class ChapterDetection(unittest.TestCase):
    """A textbook's chapters are saved with its pages; they can never make the book fail."""

    CONTENTS = "Contents\nChapter 1   A ......... 1\nChapter 2   B ......... 11\nChapter 3   C ......... 21\n"

    def tools(self, tree):
        texts = [REAL] * 40
        texts[1] = self.CONTENTS
        tools = FakeTools(texts)
        tools.outline = lambda path: tree
        return tools

    def run_book(self, tools):
        body = PDF + b"b" * 20
        return run_process([(0, memoryview(body))], len(body), tools=tools, kind="textbook")

    def test_chapters_and_offset_are_saved_with_the_book(self):
        tree = [{"title": f"Chapter {n}", "page": p, "kids": []} for n, p in [(1, 5), (2, 15), (3, 25)]]
        connection = self.run_book(self.tools(tree))
        chapter_sql, rows = connection.executed_many[1]
        self.assertIn("INSERT INTO public.document_chapters", chapter_sql)
        self.assertEqual([(r[2], r[3], r[4], r[5], r[6]) for r in rows], [(1, "", 5, 14, "outline"), (2, "", 15, 24, "outline"), (3, "", 25, 40, "outline")])
        self.assertEqual({r[1] for r in rows}, {"user-1"})
        offset = connection.statements_like("SET page_offset")
        self.assertEqual(offset[0][1], (4, "doc-1"))             # bookmarks (page 5) vs contents (printed 1)

    def test_page_count_is_recorded_before_the_chapters_that_are_checked_against_it(self):
        tree = [{"title": f"Chapter {n}", "page": p, "kids": []} for n, p in [(1, 5), (2, 15), (3, 25)]]
        connection = self.run_book(self.tools(tree))
        statements = [sql for sql, _ in connection.statements]
        ready = next(i for i, sql in enumerate(statements) if "SET status = 'ready'" in sql)
        chapters_at = next(i for i, sql in enumerate(statements) if "DELETE FROM public.document_chapters" in sql)
        self.assertLess(ready, chapters_at)

    def test_only_detected_chapters_are_replaced_never_ones_the_user_made(self):
        connection = self.run_book(self.tools([]))
        (sql, _), = connection.statements_like("DELETE FROM public.document_chapters")
        self.assertIn("source <> 'manual'", sql)

    def test_a_syllabus_is_never_searched_for_chapters(self):
        body = PDF + b"s" * 20
        tools = self.tools([])
        tools.outline = lambda path: (_ for _ in ()).throw(AssertionError("looked for bookmarks in a syllabus"))
        connection = run_process([(0, memoryview(body))], len(body), tools=tools, kind="syllabus")
        self.assertEqual(connection.statements_like("SET status = 'failed'"), [])

    def test_chapter_detection_crashing_still_leaves_a_readable_book(self):
        def boom(path):
            raise RuntimeError("qpdf blew up")

        tools = self.tools([])
        tools.outline = boom
        connection = self.run_book(tools)
        self.assertEqual(len(connection.statements_like("SET status = 'ready'")), 1)
        self.assertEqual(connection.statements_like("SET status = 'failed'"), [])
        self.assertEqual(len(connection.executed_many), 1)       # pages only, no chapter insert

    def test_a_book_without_chapters_saves_none(self):
        connection = self.run_book(self.tools([]))
        self.assertEqual(len(connection.executed_many), 1)
        self.assertEqual(connection.statements_like("SET page_offset"), [])


class Extracts(unittest.TestCase):
    body = PDF + b"e" * 30

    def extract(self):
        return {"id": "ex-1", "document_id": "doc-1", "start_page": 3, "end_page": 9}

    def run_extract(self, tools, limits=None, size=None):
        connection = FakeConnection([(0, memoryview(self.body))])
        connection.next_row = (size if size is not None else len(self.body),)
        cfg = Config({"WORKER_TMPDIR": tempfile.gettempdir()})
        worker.process_extract(connection, tools, cfg, limits or {"max_file_bytes": 1000}, self.extract())
        return connection

    class Cutter:
        def __init__(self, output=b"%PDF-cut", fail_with=None):
            self.output, self.fail_with, self.calls = output, fail_with, []

        def extract_pages(self, path, first, last, destination):
            self.calls.append((first, last))
            if self.fail_with:
                raise self.fail_with
            if self.output is not None:
                with open(destination, "wb") as handle:
                    handle.write(self.output)

    def test_the_requested_pages_are_cut_and_stored(self):
        cutter = self.Cutter()
        connection = self.run_extract(cutter)
        self.assertEqual(cutter.calls, [(3, 9)])
        (sql, params), = connection.statements_like("SET status = 'ready'")
        self.assertEqual(params, (("BINARY", b"%PDF-cut"), 8, "ex-1"))

    def test_a_result_larger_than_the_server_allows_fails_with_a_message(self):
        connection = self.run_extract(self.Cutter(output=b"x" * 2000))
        (sql, params), = connection.statements_like("SET status = 'failed'")
        self.assertIn("larger than this server allows", params[0])
        self.assertEqual(connection.statements_like("SET status = 'ready'"), [])

    def test_nothing_produced_fails_with_a_message(self):
        connection = self.run_extract(self.Cutter(output=None))
        self.assertEqual(len(connection.statements_like("SET status = 'failed'")), 1)

    def test_a_tool_error_becomes_the_users_message(self):
        connection = self.run_extract(self.Cutter(fail_with=ProcessingError("Cutting out those pages failed. The file may be damaged.")))
        (sql, params), = connection.statements_like("SET status = 'failed'")
        self.assertEqual(params, ("Cutting out those pages failed. The file may be damaged.", "ex-1"))

    def test_an_unexpected_error_gives_a_generic_message(self):
        connection = self.run_extract(self.Cutter(fail_with=RuntimeError("secret /var/lib/x")))
        (sql, params), = connection.statements_like("SET status = 'failed'")
        self.assertNotIn("secret", params[0])

    def test_a_database_error_is_not_swallowed(self):
        with self.assertRaises(DatabaseError):
            self.run_extract(self.Cutter(fail_with=DatabaseError("connection lost")))

    def test_an_incomplete_book_upload_fails_rather_than_cutting_garbage(self):
        connection = self.run_extract(self.Cutter(), size=len(self.body) + 5)
        self.assertEqual(len(connection.statements_like("SET status = 'failed'")), 1)

    def test_a_book_deleted_while_waiting_is_quietly_dropped(self):
        connection = FakeConnection([])
        connection.next_row = None
        worker.process_extract(connection, self.Cutter(), Config({"WORKER_TMPDIR": tempfile.gettempdir()}), {"max_file_bytes": 10}, self.extract())
        self.assertEqual(connection.statements_like("SET status"), [])

    def test_the_temp_directory_is_always_cleaned_up(self):
        tmp = tempfile.mkdtemp()
        connection = FakeConnection([(0, memoryview(self.body))])
        connection.next_row = (len(self.body),)
        worker.process_extract(connection, self.Cutter(fail_with=ProcessingError("no")), Config({"WORKER_TMPDIR": tmp}), {"max_file_bytes": 10}, self.extract())
        self.assertEqual(os.listdir(tmp), [])


if __name__ == "__main__":
    unittest.main()
