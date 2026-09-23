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
Needs: reportlab, pillow (pip install reportlab pillow).
"""
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
    status, body = a.chunk(partial, 1, b"x" * (3 * MiB))
    check("chunks past the declared size are refused", status in (400, 403), (status, body))
    status, body = a.queue(partial)
    check("an incomplete upload can't be queued", status in (400, 403), (status, body))
    status, doc_now = a.rest("GET", f"/course_documents?id=eq.{partial}&select=uploaded_bytes")
    check("the running byte total counted only the accepted chunk", doc_now and doc_now[0]["uploaded_bytes"] == MiB, doc_now)
    status, body = b.chunk(partial, 1, b"y" * 10)
    check("user B can't add chunks to A's document", status in (400, 401, 403), (status, body))

    status, body = a.rest("PATCH", f"/course_documents?id=eq.{text_doc}", body={"status": "ready"})
    check("a user can't set a document's status to anything but queued", status in (400, 403), (status, body))
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
