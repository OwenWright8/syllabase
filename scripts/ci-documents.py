#!/usr/bin/env python3
"""End-to-end check of course documents against a RUNNING stack (used by CI).

Generates fixture files, uploads them through the real REST API exactly as the
browser does (a row, then 1 MiB `bytea` chunks, then "queued"), waits for the
background worker, and checks: the text that comes back (including OCR of an
image-only PDF, a photo and a Word file), refusals (encrypted, not-a-PDF), the
database's own rules (limits, ownership, who may change what), and that another
user can see none of it.

Environment: API_URL (default http://localhost:8080), ANON_KEY, ACCESS_TOKEN
(user A), and optionally CI_USER_B_TOKEN; it signs up user B itself if not given.

`--fixtures-only DIR` just writes the fixture files (to inspect them locally).
Needs: reportlab, pillow, pypdf (pip install reportlab pillow pypdf).
"""
import base64
import io
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
import uuid
import zipfile

MiB = 1024 * 1024
RESULTS = []


# --- fixtures ------------------------------------------------------------------------------
def _font(size):
    from PIL import ImageFont

    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def text_image(lines, size=54):
    """A clean white page with black text: what a decent scan looks like."""
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (1700, 2200), "white")
    draw = ImageDraw.Draw(image)
    font = _font(size)
    y = 160
    for line in lines:
        draw.text((140, y), line, fill="black", font=font)
        y += size + 40
    return image


def text_pdf(pages, encrypt_with=None, noise_bytes=0):
    """A real text-layer PDF. `pages` is a list of lists of lines."""
    from reportlab.lib.pdfencrypt import StandardEncryption
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    encryption = StandardEncryption(encrypt_with, canPrint=0) if encrypt_with else None
    pdf = canvas.Canvas(buffer, encrypt=encryption)
    for number, lines in enumerate(pages):
        y = 780
        for line in lines:
            pdf.drawString(72, y, line)
            y -= 22
        if noise_bytes and number == 0:
            from PIL import Image

            noise = Image.frombytes("RGB", (int((noise_bytes / 3) ** 0.5),) * 2, random.Random(1).randbytes(int((noise_bytes / 3) ** 0.5) ** 2 * 3))
            pdf.drawImage(ImageReader(noise), 72, 100, width=200, height=200)
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


BOOK_CHAPTERS = [(1, "Beginnings"), (2, "Middles"), (3, "Endings"), (4, "Aftermath")]


def chapter_book(with_bookmarks):
    """A 14-page book: cover, a printed contents page, then four chapters of three pages each.

    Chapter n starts on PDF page 3 + 3(n-1), printed page 1 + 3(n-1): the printed numbers
    lag the PDF's by 2, which is what the worker has to work out. Every page carries a
    marker ("CH2-P3" = chapter 2, third page) so an extract's pages can be identified.
    """
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer)

    def line(y, text):
        pdf.drawString(72, y, text)

    line(780, "Introductory Chemistry, an example textbook for testing")
    line(750, "Copyright and publisher information appears on this cover page.")
    pdf.showPage()

    line(780, "Contents")
    for index, (number, title) in enumerate(BOOK_CHAPTERS):
        line(740 - index * 24, f"Chapter {number}   {title} " + "." * 40 + f" {1 + 3 * index}")
    line(740 - len(BOOK_CHAPTERS) * 24, "Index " + "." * 50 + " 13")
    pdf.showPage()

    for number, title in BOOK_CHAPTERS:
        for page in range(1, 4):
            if page == 1:
                if with_bookmarks:
                    key = f"ch{number}"
                    pdf.bookmarkPage(key)
                    pdf.addOutlineEntry(f"Chapter {number}: {title}", key, level=0)
                line(780, f"Chapter {number}")
                line(756, title)
            else:
                line(780, f"{title} (continued)")
            line(700, f"CH{number}-P{page} ordinary body text so that this page has a real text layer.")
            line(60, f"Page {(number - 1) * 3 + page}")
            pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def scanned_pdf(lines):
    """A PDF whose only content is a picture of text: no text layer, so it needs OCR."""
    buffer = io.BytesIO()
    text_image(lines).save(buffer, "PDF", resolution=200)
    return buffer.getvalue()


def png(lines):
    buffer = io.BytesIO()
    text_image(lines).save(buffer, "PNG")
    return buffer.getvalue()


def docx(paragraphs):
    body = "".join(f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>" for text in paragraphs)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", f"<w:document><w:body>{body}</w:body></w:document>")
    return buffer.getvalue()


def build_fixtures():
    textbook_pages = [[f"Chapter {n}  Filler heading for page {n}", "This page has plenty of ordinary text so it counts as a text page."] for n in range(1, 6)]
    textbook_pages[2].append("MARKER-THREE thermodynamics and the first law")
    return {
        "textbook": text_pdf(textbook_pages),
        "big_textbook": text_pdf(textbook_pages, noise_bytes=int(1.6 * MiB)),
        "book_bookmarks": chapter_book(with_bookmarks=True),
        "book_contents": chapter_book(with_bookmarks=False),
        "scanned_syllabus": scanned_pdf(["SYLLABUS", "Week 3 readings", "Read Chapter 5 due October 18"]),
        "photo_syllabus": png(["SYLLABUS PHOTO", "Week 4 readings", "Read Chapter 6 due October 25"]),
        "docx_syllabus": docx(["Week 5 Reading: Chapter 7 due 11/2", "Week 6 Reading: Chapter 8 due 11/9"]),
        "encrypted": text_pdf([["secret"]], encrypt_with="userpw"),
        "garbage": b"MZ\x90\x00this is definitely not a document" * 20,
    }


# --- tiny REST client ------------------------------------------------------------------------
class Client:
    def __init__(self, base, anon):
        self.base = base.rstrip("/")
        self.anon = anon

    def call(self, method, path, token=None, body=None, prefer=None, accept=None, raw_ok=False):
        headers = {"apikey": self.anon, "Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if prefer:
            headers["Prefer"] = prefer
        if accept:
            headers["Accept"] = accept
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                status, payload = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, payload = error.code, error.read()
        try:
            parsed = json.loads(payload) if payload else None
        except ValueError:
            parsed = payload.decode(errors="replace")
        return status, parsed


def check(name, condition, detail=""):
    RESULTS.append((name, bool(condition)))
    print(f"  {'ok  ' if condition else 'FAIL'} - {name}" + ("" if condition else f"   [{str(detail)[:300]}]"), flush=True)
    return bool(condition)


def hexbytes(data):
    return "\\x" + data.hex()


# --- the flow the browser performs -------------------------------------------------------------
class Session:
    def __init__(self, client, token, user_id):
        self.client, self.token, self.user_id = client, token, user_id

    def rest(self, method, path, **kw):
        return self.client.call(method, "/rest/v1" + path, token=self.token, **kw)

    def make_course(self, name="CI Course"):
        status, rows = self.rest("POST", "/courses", body={"user_id": self.user_id, "name": name, "short_code": "CI 1", "color": "#3b82f6"}, prefer="return=representation")
        assert status == 201, (status, rows)
        return rows[0]["id"]

    def start(self, course_id, kind, filename, size):
        return self.rest(
            "POST",
            "/course_documents",
            body={"user_id": self.user_id, "course_id": course_id, "kind": kind, "filename": filename, "size_bytes": size},
            prefer="return=representation",
            accept="application/vnd.pgrst.object+json",
        )

    def chunk(self, doc_id, seq, data):
        return self.rest("POST", "/course_document_chunks", body={"document_id": doc_id, "seq": seq, "user_id": self.user_id, "data": hexbytes(data)})

    def queue(self, doc_id):
        return self.rest("PATCH", f"/course_documents?id=eq.{doc_id}", body={"status": "queued"})

    def upload(self, course_id, kind, filename, data):
        status, doc = self.start(course_id, kind, filename, len(data))
        assert status == 201, (status, doc)
        for seq, start in enumerate(range(0, len(data), MiB)):
            status, body = self.chunk(doc["id"], seq, data[start : start + MiB])
            assert status == 201, (status, body)
        status, body = self.queue(doc["id"])
        assert status in (200, 204), (status, body)
        return doc["id"]

    def document(self, doc_id):
        status, rows = self.rest("GET", f"/course_documents?id=eq.{doc_id}&select=status,progress,error,page_count,size_bytes,uploaded_bytes")
        return rows[0] if status == 200 and rows else None

    def wait(self, doc_id, timeout=300):
        deadline, last = time.time() + timeout, None
        while time.time() < deadline:
            doc = self.document(doc_id)
            if doc and doc["status"] != last:
                last = doc["status"]
                print(f"      ... {doc_id[:8]} is {last} ({doc['progress']}%)", flush=True)
            if doc and doc["status"] in ("ready", "failed"):
                return doc
            time.sleep(2)
        return self.document(doc_id)

    def document_offset(self, doc_id):
        status, rows = self.rest("GET", f"/course_documents?id=eq.{doc_id}&select=page_offset")
        return rows[0]["page_offset"] if status == 200 and rows else None

    def chapters(self, doc_id):
        status, rows = self.rest("GET", f"/document_chapters?document_id=eq.{doc_id}&select=id,number,title,start_page,end_page,source&order=start_page")
        return rows if status == 200 else []

    def ask_for_pages(self, doc_id, start, end):
        return self.rest(
            "POST",
            "/document_extracts?select=id,status,size_bytes",
            body={"document_id": doc_id, "user_id": self.user_id, "start_page": start, "end_page": end},
            prefer="return=representation",
            accept="application/vnd.pgrst.object+json",
        )

    def extract_state(self, extract_id):
        status, rows = self.rest("GET", f"/document_extracts?id=eq.{extract_id}&select=id,status,error,size_bytes")
        return rows[0] if status == 200 and rows else None

    def download_pages(self, doc_id, start, end, timeout=120):
        """What the browser does: ask, wait, read back piece by piece. Returns (bytes, pieces, extract_id)."""
        status, extract = self.ask_for_pages(doc_id, start, end)
        assert status == 201, (status, extract)
        deadline = time.time() + timeout
        state = extract
        while state and state["status"] not in ("ready", "failed") and time.time() < deadline:
            time.sleep(1)
            state = self.extract_state(extract["id"])
        assert state and state["status"] == "ready", state
        data, piece = b"", 0
        while len(data) < state["size_bytes"]:
            status, text = self.rest("POST", "/rpc/extract_piece", body={"p_extract": extract["id"], "p_piece": piece})
            assert status == 200 and text, (status, text)
            data += base64.b64decode(text)
            piece += 1
        return data, piece, extract["id"]

    def pages(self, doc_id):
        status, rows = self.rest("GET", f"/document_pages?document_id=eq.{doc_id}&select=page,text,ocr&order=page")
        return rows if status == 200 else []


def main():
    if "--fixtures-only" in sys.argv:
        target = sys.argv[sys.argv.index("--fixtures-only") + 1]
        os.makedirs(target, exist_ok=True)
        for name, data in build_fixtures().items():
            with open(os.path.join(target, name + (".docx" if name == "docx_syllabus" else ".png" if name == "photo_syllabus" else ".pdf")), "wb") as handle:
                handle.write(data)
        print("fixtures written to", target)
        return 0

    from pypdf import PdfReader

    api = os.environ.get("API_URL", "http://localhost:8080")
    anon = os.environ["ANON_KEY"]
    client = Client(api, anon)

    token_a = os.environ["ACCESS_TOKEN"]
    status, user = client.call("GET", "/auth/v1/user", token=token_a)
    assert status == 200, ("could not identify user A", status, user)
    a = Session(client, token_a, user["id"])

    # user B: someone else on the same instance
    email_b = f"ci-user-b-{uuid.uuid4().hex[:8]}@accounts.local"
    status, signup = client.call("POST", "/auth/v1/signup", body={"email": email_b, "password": "ci-test-password-123"})
    assert status == 200, ("could not sign up user B", status, signup)
    b = Session(client, signup["access_token"], signup["user"]["id"])

    fixtures = build_fixtures()
    course = a.make_course()
    print(f"\nuser A course {course[:8]}; user B {b.user_id[:8]}\n")

    print("== a text PDF textbook (multi-page, real text layer)")
    doc = a.upload(course, "textbook", "textbook.pdf", fixtures["textbook"])
    result = a.wait(doc)
    check("becomes ready", result and result["status"] == "ready", result)
    check("page count is right (5)", result and result["page_count"] == 5, result)
    pages = a.pages(doc)
    check("every page's text was stored", len(pages) == 5, len(pages))
    check("the text of page 3 is there", pages and "MARKER-THREE" in pages[2]["text"], pages[2]["text"][:120] if len(pages) > 2 else "no page 3")
    check("a text PDF needed no OCR", pages and not any(p["ocr"] for p in pages), [p["ocr"] for p in pages])
    text_doc = doc

    print("== a bigger PDF is sent as several chunks")
    doc = a.upload(course, "textbook", "big.pdf", fixtures["big_textbook"])
    status, chunks = a.rest("GET", f"/course_document_chunks?document_id=eq.{doc}&select=seq&order=seq")
    check("stored as 2+ chunks numbered from 0", status == 200 and [c["seq"] for c in chunks] == list(range(len(chunks))) and len(chunks) >= 2, (status, chunks))
    result = a.wait(doc)
    check("and still becomes ready", result and result["status"] == "ready", result)
    big_doc = doc

    print("== an image-only (scanned) PDF syllabus is OCR'd")
    doc = a.upload(course, "syllabus", "scanned.pdf", fixtures["scanned_syllabus"])
    result = a.wait(doc)
    check("becomes ready", result and result["status"] == "ready", result)
    pages = a.pages(doc)
    joined = " ".join(p["text"] for p in pages).lower()
    check("its text was read by OCR", "chapter" in joined and "syllabus" in joined, joined[:200])
    check("the page is marked as OCR'd", pages and all(p["ocr"] for p in pages), [p["ocr"] for p in pages])

    print("== a photo (PNG) syllabus")
    doc = a.upload(course, "syllabus", "photo.png", fixtures["photo_syllabus"])
    result = a.wait(doc)
    check("becomes ready with one page", result and result["status"] == "ready" and result["page_count"] == 1, result)
    check("its text was read", "chapter" in " ".join(p["text"] for p in a.pages(doc)).lower(), a.pages(doc))

    print("== a Word (.docx) syllabus")
    doc = a.upload(course, "syllabus", "syllabus.docx", fixtures["docx_syllabus"])
    result = a.wait(doc)
    check("becomes ready", result and result["status"] == "ready", result)
    joined = " ".join(p["text"] for p in a.pages(doc))
    check("paragraphs came through", "Chapter 7 due 11/2" in joined and "Chapter 8" in joined, joined[:200])

    print("== a textbook with bookmarks: chapters come from them")
    outline_book = a.upload(course, "textbook", "bookmarked.pdf", fixtures["book_bookmarks"])
    result = a.wait(outline_book)
    check("becomes ready with 14 pages", result and result["status"] == "ready" and result["page_count"] == 14, result)
    found = a.chapters(outline_book)
    check(
        "the four chapters were found, with the right page ranges",
        [(c["number"], c["start_page"], c["end_page"]) for c in found] == [(1, 3, 5), (2, 6, 8), (3, 9, 11), (4, 12, 14)],
        found,
    )
    check("their titles were split from the numbering", [c["title"] for c in found] == [t for _, t in BOOK_CHAPTERS], found)
    check("and they're marked as coming from the bookmarks", {c["source"] for c in found} == {"outline"}, found)
    check("the offset was worked out from the contents page (PDF page = printed + 2)", (a.document_offset(outline_book)) == 2, a.document_offset(outline_book))

    print("== a textbook with only a printed contents page: chapters come from that")
    contents_book = a.upload(course, "textbook", "contents-only.pdf", fixtures["book_contents"])
    result = a.wait(contents_book)
    check("becomes ready", result and result["status"] == "ready" and result["page_count"] == 14, result)
    found = a.chapters(contents_book)
    check(
        "chapters found with the printed page numbers converted to PDF pages",
        [(c["number"], c["start_page"], c["end_page"]) for c in found] == [(1, 3, 5), (2, 6, 8), (3, 9, 11), (4, 12, 14)],
        found,
    )
    check("marked as coming from the contents page", {c["source"] for c in found} == {"toc"}, found)
    check("the offset is recorded (2)", a.document_offset(contents_book) == 2, a.document_offset(contents_book))
    check("a book with no chapters at all (the plain text PDF) has none", a.chapters(text_doc) == [], a.chapters(text_doc))

    print("== downloading only a chapter")
    data, pieces, extract_id = a.download_pages(outline_book, 6, 8)
    reader = PdfReader(io.BytesIO(data))
    texts = [page.extract_text() for page in reader.pages]
    check("the download is a PDF with exactly the 3 pages of chapter 2", len(texts) == 3, len(texts))
    check("and they are chapter 2's pages, in order", all(f"CH2-P{i + 1}" in texts[i] for i in range(len(texts))), texts)
    check("nothing from the neighbouring chapters", not any("CH1-" in t or "CH3-" in t for t in texts), texts)
    check("the pages kept their real text (not re-rendered)", "ordinary body text" in texts[0], texts[0][:100])
    status, again = a.ask_for_pages(outline_book, 6, 8)
    check("asking again for the same pages is refused as a duplicate while one exists", status == 409, (status, again))
    status, _ = a.rest("DELETE", f"/document_extracts?id=eq.{extract_id}")
    check("the browser can delete its extract after collecting it", status in (200, 204) and a.extract_state(extract_id) is None, status)

    data, pieces, extract_id = a.download_pages(contents_book, 12, 14)
    texts = [page.extract_text() for page in PdfReader(io.BytesIO(data)).pages]
    check("the last chapter (contents-only book) is right too", len(texts) == 3 and "CH4-P1" in texts[0] and "CH4-P3" in texts[2], texts)
    a.rest("DELETE", f"/document_extracts?id=eq.{extract_id}")

    data, pieces, extract_id = a.download_pages(big_doc, 1, 5)
    check("a result bigger than one piece is read back in several", pieces >= 2, pieces)
    reader = PdfReader(io.BytesIO(data))
    check("and reassembles into a valid PDF with all 5 pages", len(reader.pages) == 5, len(reader.pages))
    check("with the text of page 3 intact", "MARKER-THREE" in reader.pages[2].extract_text(), reader.pages[2].extract_text()[:100])
    a.rest("DELETE", f"/document_extracts?id=eq.{extract_id}")

    print("== the rules for chapters and page downloads")
    status, body = a.ask_for_pages(outline_book, 10, 15)
    check("pages past the end of the book are refused", status in (400, 403), (status, body))
    status, body = a.ask_for_pages(outline_book, 9, 4)
    check("a backwards range is refused", status in (400, 403), (status, body))
    status, body = a.ask_for_pages(outline_book, 0, 4)
    check("page 0 is refused", status in (400, 403), (status, body))
    syllabus_id = a.upload(course, "syllabus", "syl-for-extract.docx", fixtures["docx_syllabus"])
    a.wait(syllabus_id)
    status, body = a.ask_for_pages(syllabus_id, 1, 1)
    check("pages can't be requested from a syllabus", status in (400, 403), (status, body))
    status, body = a.ask_for_pages("00000000-0000-4000-8000-00000000dead", 1, 2)
    check("or from a document that doesn't exist", status in (400, 403), (status, body))
    status, body = b.ask_for_pages(outline_book, 3, 5)
    check("user B can't ask for pages of A's book", status in (400, 403), (status, body))
    status, held = a.ask_for_pages(outline_book, 3, 5)
    status_b, rows = b.rest("GET", "/document_extracts?select=id")
    check("user B can't see A's extracts", status_b == 200 and rows == [], (status_b, rows))
    status_b, piece = b.rest("POST", "/rpc/extract_piece", body={"p_extract": held["id"], "p_piece": 0})
    check("user B can't read A's extract through extract_piece", status_b == 200 and not piece, (status_b, piece))
    status_a, rows = a.rest("GET", f"/document_extracts?id=eq.{held['id']}&select=data")
    check("even A can't SELECT the extract's data column (only the piece function)", status_a in (401, 403), (status_a, rows))
    status_a, body = a.rest("PATCH", f"/document_extracts?id=eq.{held['id']}", body={"status": "ready"})
    check("a user can't mark their own extract ready", status_a in (401, 403), (status_a, body))
    check("anonymous callers can't use extract_piece", client.call("POST", "/rest/v1/rpc/extract_piece", body={"p_extract": held["id"], "p_piece": 0})[0] in (401, 403), "")
    a.rest("DELETE", f"/document_extracts?id=eq.{held['id']}")

    open_ids = []
    for start in range(1, 12):
        status, body = a.ask_for_pages(outline_book, start, start)
        if status != 201:
            break
        open_ids.append(body["id"])
    check("at most 10 downloads can be open at once", len(open_ids) == 10 and status in (400, 403), (len(open_ids), status, body))
    for extract_id in open_ids:
        a.rest("DELETE", f"/document_extracts?id=eq.{extract_id}")

    status, mine = a.rest(
        "POST",
        "/document_chapters",
        body={"document_id": outline_book, "user_id": a.user_id, "number": 9, "title": "Mine", "start_page": 1, "end_page": 2},
        prefer="return=representation",
    )
    check("a user can add their own chapter", status == 201 and mine and mine[0]["source"] == "manual", (status, mine))
    status, body = a.rest("POST", "/document_chapters", body={"document_id": outline_book, "user_id": a.user_id, "number": 10, "title": "Forged", "start_page": 1, "end_page": 2, "source": "outline"})
    check("a user can't claim a chapter was detected (source isn't writable)", status in (401, 403), (status, body))
    status, body = a.rest("POST", "/document_chapters", body={"document_id": outline_book, "user_id": a.user_id, "title": "Too far", "start_page": 5, "end_page": 15})
    check("a chapter past the end of the book is refused", status in (400, 403), (status, body))
    status, body = a.rest("POST", "/document_chapters", body={"document_id": outline_book, "user_id": a.user_id, "title": "Backwards", "start_page": 9, "end_page": 3})
    check("a backwards chapter is refused", status in (400, 403), (status, body))
    status, body = a.rest("POST", "/document_chapters", body={"document_id": syllabus_id, "user_id": a.user_id, "title": "On a syllabus", "start_page": 1, "end_page": 1})
    check("chapters can't be added to a syllabus", status in (400, 403), (status, body))
    status, body = b.rest("POST", "/document_chapters", body={"document_id": outline_book, "user_id": b.user_id, "title": "Sneaky", "start_page": 1, "end_page": 2})
    check("user B can't add chapters to A's book", status in (400, 403), (status, body))
    status, body = b.rest("POST", "/document_chapters", body={"document_id": outline_book, "user_id": a.user_id, "title": "Impersonated", "start_page": 1, "end_page": 2})
    check("...nor by pretending to be A", status in (400, 401, 403), (status, body))
    status, rows = b.rest("GET", f"/document_chapters?document_id=eq.{outline_book}&select=id")
    check("user B can't see A's chapters", status == 200 and rows == [], (status, rows))
    status, body = b.rest("PATCH", f"/document_chapters?id=eq.{mine[0]['id']}", body={"title": "Hijacked"})
    check("B's edit of A's chapter changes nothing", [c["title"] for c in a.chapters(outline_book) if c["number"] == 9] == ["Mine"], (status, body))
    status, body = b.rest("DELETE", f"/document_chapters?id=eq.{mine[0]['id']}")
    check("B's delete of A's chapter changes nothing", any(c["number"] == 9 for c in a.chapters(outline_book)), (status, body))
    status, body = a.rest("PATCH", f"/document_chapters?id=eq.{mine[0]['id']}", body={"document_id": contents_book})
    check("a chapter can't be moved to another book", status in (401, 403), (status, body))
    detected = [c for c in a.chapters(outline_book) if c["source"] == "outline"]
    status, body = a.rest("PATCH", f"/document_chapters?id=eq.{detected[0]['id']}", body={"end_page": 4})
    edited = [c for c in a.chapters(outline_book) if c["id"] == detected[0]["id"]][0]
    check("correcting a detected chapter works and makes it the user's own", status in (200, 204) and edited["end_page"] == 4 and edited["source"] == "manual", (status, edited))
    status, body = a.rest("DELETE", f"/document_chapters?id=eq.{mine[0]['id']}")
    check("a user can delete a chapter", status in (200, 204) and not any(c["number"] == 9 for c in a.chapters(outline_book)), (status, body))

    print("== readings that point at a textbook")
    def reading(**extra):
        body = {"user_id": a.user_id, "course_id": course, "title": "Chapter 2: Middles", "pages": "Ch. 2", "due_date": "2026-10-18"}
        body.update(extra)
        return a.rest("POST", "/readings", body=body, prefer="return=representation")

    status, made = reading(document_id=outline_book, start_page=6, end_page=8)
    check("a reading can link to the user's own textbook and its pages", status == 201 and made[0]["document_id"] == outline_book and made[0]["start_page"] == 6, (status, made))
    linked_reading = made[0]["id"] if status == 201 else None
    status, rows = a.rest("GET", "/readings?select=title,document_id,start_page,end_page,document:course_documents(id,filename)&document_id=not.is.null")
    check("the reading list can include the textbook's file name (for the download's name)", status == 200 and rows and rows[0]["document"]["filename"] == "bookmarked.pdf", (status, rows))
    status, body = reading()
    check("a reading with no textbook is unchanged", status == 201, (status, body))
    if status == 201:
        a.rest("DELETE", f"/readings?id=eq.{body[0]['id']}")

    b_course = b.make_course("B early course")
    status, b_doc = b.start(b_course, "textbook", "b-book.pdf", 100)
    check("(user B has a document of their own)", status == 201, (status, b_doc))
    status, body = reading(document_id=b_doc["id"], start_page=1, end_page=2)
    check("a reading can't link to someone else's document", status in (400, 403), (status, body))
    status, body = reading(document_id="00000000-0000-4000-8000-00000000dead", start_page=1, end_page=2)
    check("...nor to one that doesn't exist", status in (400, 403, 409), (status, body))
    status, body = a.rest("PATCH", f"/readings?id=eq.{linked_reading}", body={"document_id": b_doc["id"]})
    check("an existing reading can't be re-pointed at someone else's document", status in (400, 403), (status, body))
    status, body = reading(document_id=outline_book, start_page=5)
    check("a start page without an end page is refused", status in (400, 403), (status, body))
    status, body = reading(document_id=outline_book, start_page=9, end_page=3)
    check("a backwards page range is refused", status in (400, 403), (status, body))

    status, throwaway = a.start(course, "textbook", "link-target.pdf", 10)
    status, made = reading(document_id=throwaway["id"], start_page=1, end_page=3, title="Outlives its book")
    a.rest("DELETE", f"/course_documents?id=eq.{throwaway['id']}")
    status, rows = a.rest("GET", f"/readings?id=eq.{made[0]['id']}&select=title,document_id,start_page,end_page")
    check("deleting the textbook keeps the reading and only clears the link", status == 200 and rows and rows[0]["document_id"] is None and rows[0]["title"] == "Outlives its book", (status, rows))
    status, rows = b.rest("GET", "/readings?select=id")
    check("user B sees none of A's readings", status == 200 and rows == [], (status, rows))
    a.rest("DELETE", f"/readings?id=eq.{made[0]['id']}")
    a.rest("DELETE", f"/readings?id=eq.{linked_reading}")

    print("== the number of documents per user is bounded too")
    tiny = []
    refused = None
    for i in range(210):
        status, doc = a.start(course, "textbook", f"tiny-{i}.pdf", 1)
        if status != 201:
            refused = (i, status)
            break
        tiny.append(doc["id"])
    status, existing = a.rest("GET", "/course_documents?select=id")
    check("a user can't create documents without limit", refused is not None and len(existing) <= 200, (refused, len(existing)))
    a.rest("DELETE", "/course_documents?id=in.(" + ",".join(tiny) + ")")

    print("== files that must be refused, with a message")
    doc = a.upload(course, "textbook", "locked.pdf", fixtures["encrypted"])
    result = a.wait(doc)
    check("a password-protected PDF fails", result and result["status"] == "failed", result)
    check("...and says why", result and "password" in (result["error"] or "").lower(), result)
    doc = a.upload(course, "textbook", "fake.pdf", fixtures["garbage"])
    result = a.wait(doc)
    check("a file that isn't a document fails", result and result["status"] == "failed", result)
    check("...and says so", result and "doesn't look like" in (result["error"] or ""), result)
    doc = a.upload(course, "textbook", "photo-as-book.pdf", fixtures["photo_syllabus"])
    result = a.wait(doc)
    check("a textbook that is really an image is refused", result and result["status"] == "failed" and "PDF" in (result["error"] or ""), result)

    print("== the database's own rules (a user can't skip the UI)")
    status, body = a.start(course, "textbook", "huge.pdf", 300 * MiB)
    check("a file over the per-file limit is refused", status in (401, 403), (status, body))
    status, body = a.start("00000000-0000-4000-8000-00000000dead", "textbook", "x.pdf", 1000)
    check("a document for a course that isn't yours is refused", status in (401, 403), (status, body))
    status, body = b.start(course, "textbook", "steal.pdf", 1000)
    check("user B can't attach a document to user A's course", status in (401, 403), (status, body))

    status, doc = a.start(course, "textbook", "partial.pdf", 3 * MiB)
    partial = doc["id"]
    check("a new document starts as 'uploading', empty", doc["status"] == "uploading" and doc["uploaded_bytes"] == 0, doc)
    status, body = a.chunk(partial, 0, b"x" * (MiB + 1))
    check("a chunk over 1 MiB is refused", status in (400, 403) and status != 201, (status, body))
    status, body = a.chunk(partial, 0, b"")
    check("an empty chunk is refused", status in (400, 403), (status, body))
    status, body = a.chunk(partial, 0, b"x" * MiB)
    check("a normal chunk is accepted", status == 201, (status, body))
    status, body = a.chunk(partial, 0, b"x" * MiB)
    check("the same chunk number twice is refused", status in (400, 409), (status, body))
    # (a legal-sized chunk that overflows a SMALL declared size; anything over ~4 MB is
    # stopped by nginx before it reaches the database rule this is meant to test)
    status, small = a.start(course, "textbook", "small.pdf", MiB + 512 * 1024)
    check("a 1.5 MiB document can be started", status == 201, (status, small))
    status, body = a.chunk(small["id"], 0, b"x" * MiB)
    check("its first chunk is accepted", status == 201, (status, body))
    status, body = a.chunk(small["id"], 1, b"x" * MiB)
    check("a chunk that would pass the declared size is refused", status in (400, 403), (status, body))
    status, body = a.chunk(small["id"], 1, b"x" * (512 * 1024))
    check("the remaining exact amount is accepted", status == 201, (status, body))
    a.rest("DELETE", f"/course_documents?id=eq.{small['id']}")
    status, body = a.chunk(partial, 1, b"x" * (3 * MiB))
    check("a chunk far over the body limit is stopped at the gateway (413)", status == 413, (status, body))
    status, body = a.queue(partial)
    check("an incomplete upload can't be queued", status in (400, 403), (status, body))
    status, doc_now = a.rest("GET", f"/course_documents?id=eq.{partial}&select=uploaded_bytes")
    check("the running byte total counted only the accepted chunk", doc_now and doc_now[0]["uploaded_bytes"] == MiB, doc_now)
    status, body = b.chunk(partial, 1, b"y" * 10)
    check("user B can't add chunks to A's document", status in (400, 401, 403), (status, body))

    for target in ("processing", "failed", "uploading"):
        status, body = a.rest("PATCH", f"/course_documents?id=eq.{text_doc}", body={"status": target})
        check(f"a user can't move a ready document to '{target}'", status in (400, 403), (status, body))
    status, body = a.rest("PATCH", f"/course_documents?id=eq.{text_doc}", body={"status": "queued"})
    check("...nor re-queue one that already finished (only uploading/failed can be queued)", status in (400, 403), (status, body))
    still = a.document(text_doc)
    check("and its status is still ready", still and still["status"] == "ready", still)
    status, body = a.rest("PATCH", f"/course_documents?id=eq.{text_doc}", body={"progress": 5})
    check("a user can't change progress (column privilege)", status in (401, 403), (status, body))
    status, body = a.rest("PATCH", f"/course_documents?id=eq.{text_doc}", body={"page_count": 9999})
    check("a user can't change the page count", status in (401, 403), (status, body))
    status, body = a.rest("PATCH", f"/course_documents?id=eq.{text_doc}", body={"size_bytes": 1})
    check("a user can't change the size (it's the quota)", status in (401, 403), (status, body))
    status, body = a.rest("PATCH", f"/course_documents?id=eq.{text_doc}", body={"page_offset": 12})
    check("a user CAN correct the page offset", status in (200, 204), (status, body))
    status, body = a.rest("POST", "/document_pages", body={"document_id": text_doc, "page": 99, "user_id": a.user_id, "text": "forged"})
    check("a user can't write page text", status in (401, 403), (status, body))
    status, body = a.rest("GET", f"/course_document_chunks?document_id=eq.{text_doc}&select=data")
    check("a user can't read the stored file bytes back", status in (401, 403), (status, body))
    status, body = a.rest("GET", f"/course_document_chunks?document_id=eq.{text_doc}&select=document_id,seq")
    check("...but can list which chunks exist", status == 200 and len(body) >= 1, (status, body))
    status, body = client.call("GET", "/rest/v1/course_documents?select=id", token=None)
    check("someone not signed in sees nothing", status in (401, 403) or body == [], (status, body))

    print("== the per-user storage quota")
    made = []
    refused_at = None
    for i in range(8):
        status, doc = a.start(course, "textbook", f"quota-{i}.pdf", 190 * MiB)
        if status == 201:
            made.append(doc["id"])
        else:
            refused_at = i
            break
    check("declared sizes stop being accepted once over 1 GB in total", refused_at is not None and 4 <= refused_at <= 6, (refused_at, len(made)))
    for doc_id in made + [partial]:
        a.rest("DELETE", f"/course_documents?id=eq.{doc_id}")

    print("== user B can't see any of user A's material")
    status, rows = b.rest("GET", "/course_documents?select=id")
    check("no documents", status == 200 and rows == [], (status, rows))
    status, rows = b.rest("GET", f"/document_pages?document_id=eq.{text_doc}&select=text")
    check("no page text", status == 200 and rows == [], (status, rows))
    status, rows = b.rest("GET", f"/course_document_chunks?document_id=eq.{text_doc}&select=seq")
    check("not even the chunk list", status == 200 and rows == [], (status, rows))
    status, body = b.rest("DELETE", f"/course_documents?id=eq.{text_doc}")
    check("B's delete of A's document changes nothing", a.document(text_doc) is not None, (status, body))
    status, body = b.rest("PATCH", f"/course_documents?id=eq.{text_doc}", body={"page_offset": 99})
    still = a.rest("GET", f"/course_documents?id=eq.{text_doc}&select=page_offset")[1]
    check("B's edit of A's document changes nothing", still and still[0]["page_offset"] == 12, (status, still))

    print("== deleting a document removes its file and text")
    doc = a.upload(course, "syllabus", "to-delete.docx", fixtures["docx_syllabus"])
    a.wait(doc)
    status, _ = a.rest("DELETE", f"/course_documents?id=eq.{doc}")
    check("delete succeeds", status in (200, 204), status)
    check("its pages are gone", a.pages(doc) == [], a.pages(doc))
    status, chunks = a.rest("GET", f"/course_document_chunks?document_id=eq.{doc}&select=seq")
    check("its chunks are gone", status == 200 and chunks == [], (status, chunks))

    status, _ = a.rest("DELETE", f"/courses?id=eq.{course}")
    status, left = a.rest("GET", "/course_documents?select=id")
    check("deleting the course removes its documents", status == 200 and left == [], (status, left))
    check("...and their chapters", a.chapters(outline_book) == [] and a.chapters(contents_book) == [], "")

    print("== deleting an account removes everything it uploaded (and leaves the instance as it was)")
    doc_b_course = b.make_course("B's course")
    doc_b = b.upload(doc_b_course, "syllabus", "b.docx", fixtures["docx_syllabus"])
    b.wait(doc_b)
    check("user B has a document of their own", b.document(doc_b) is not None, b.document(doc_b))
    status, body = client.call("POST", "/functions/v1/delete-user", token=b.token)
    check("delete-user removes B's account", status == 200, (status, body))
    status, body = client.call("POST", "/auth/v1/token?grant_type=password", body={"email": email_b, "password": "ci-test-password-123"})
    check("B can no longer sign in", status in (400, 401, 422), (status, body))

    failed = [name for name, ok in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(failed)} of {len(RESULTS)} checks passed")
    if failed:
        print("FAILED:\n  - " + "\n  - ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
