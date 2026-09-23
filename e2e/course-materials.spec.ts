import { test, expect, type Page } from "../playwright-fixture";
import { installFakeBackend, makeCourse, COURSE_ID, USER_ID, type FakeBackend, type Row } from "./support/fakeBackend";

const MiB = 1024 * 1024;

/** A file that starts like a PDF and is `size` bytes long (the content past the header is filler). */
const pdf = (size: number) => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(size - 9, 0x61)]);
const upload = (name: string, buffer: Buffer, mimeType = "application/pdf") => ({ name, mimeType, buffer });

async function openMaterials(page: Page) {
  await page.goto(`/courses/${COURSE_ID}`);
  await page.getByRole("tab", { name: "Materials" }).click();
  await expect(page.getByRole("heading", { name: "Textbooks" })).toBeVisible();
}

const textbookInput = (page: Page) => page.getByTestId("upload-textbook");
const syllabusInput = (page: Page) => page.getByTestId("upload-syllabus");

function seededDocument(overrides: Partial<Row> = {}): Row {
  return {
    id: "d0000000-0000-4000-8000-000000000001",
    user_id: USER_ID,
    course_id: COURSE_ID,
    kind: "textbook",
    filename: "existing-book.pdf",
    mime_type: "application/pdf",
    size_bytes: 3 * MiB,
    uploaded_bytes: 3 * MiB,
    status: "ready",
    progress: 100,
    error: null,
    page_count: 250,
    page_offset: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test.describe("course materials: uploading", () => {
  let backend: FakeBackend;
  test.beforeEach(async ({ context }) => {
    backend = await installFakeBackend(context, { courses: [makeCourse()] });
  });

  test("a textbook is uploaded in 1 MiB chunks, queued, read, and shown as ready", async ({ page }) => {
    await openMaterials(page);
    await textbookInput(page).setInputFiles(upload("Chemistry 12e.pdf", pdf(2 * MiB + 512 * 1024)));

    // 2.5 MiB -> three chunks, none over 1 MiB (the database rejects bigger ones)
    await expect.poll(() => backend.posts("course_document_chunks").length).toBe(3);
    const created = backend.posts("course_documents");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ kind: "textbook", filename: "Chemistry 12e.pdf", course_id: COURSE_ID, user_id: USER_ID, size_bytes: 2 * MiB + 512 * 1024 });
    expect(backend.posts("course_document_chunks").map((c) => c.seq)).toEqual([0, 1, 2]);

    // ...then it is queued for the worker, and the UI follows it to "Ready"
    await expect.poll(() => backend.patches("course_documents").some((p) => p.status === "queued")).toBe(true);
    const row = page.locator("div.rounded-xl", { hasText: "Chemistry 12e.pdf" });
    await expect(row.getByText(/Ready · 12 pages/)).toBeVisible({ timeout: 10_000 });
  });

  test("chunk data is sent as a Postgres hex bytea", async ({ page }) => {
    await openMaterials(page);
    await textbookInput(page).setInputFiles(upload("tiny.pdf", pdf(64)));
    await expect.poll(() => backend.posts("course_document_chunks").length).toBe(1);
    // the fake blanks stored data, so check what the app sent through the request record instead
    const [chunk] = backend.writes.filter((w) => w.table === "course_document_chunks").flatMap((w) => w.body);
    expect(String(chunk.data)).toMatch(/^\\x[0-9a-f]+$/);
    expect(String(chunk.data).length).toBe(2 + 64 * 2);
    expect(String(chunk.data).startsWith("\\x255044462d")).toBe(true); // "%PDF-"
  });

  test("a syllabus can be a PDF, a Word document or a photo", async ({ page }) => {
    await openMaterials(page);
    for (const [name, type] of [["syllabus.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["photo.jpg", "image/jpeg"], ["scan.png", "image/png"]] as const) {
      await syllabusInput(page).setInputFiles(upload(name, pdf(300), type));
    }
    await expect.poll(() => backend.posts("course_documents").length).toBe(3);
    expect(backend.posts("course_documents").map((d) => d.kind)).toEqual(["syllabus", "syllabus", "syllabus"]);
  });

  test("a progress bar is shown while uploading and can be cancelled, freeing the space", async ({ page }) => {
    await openMaterials(page);
    backend.failChunkAt = null;
    await textbookInput(page).setInputFiles(upload("big.pdf", pdf(40 * MiB)));
    await expect(page.getByRole("progressbar", { name: "Uploading big.pdf" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("progressbar", { name: "Uploading big.pdf" })).toBeHidden();
    // the half-made document is removed, so it doesn't hold quota
    await expect.poll(() => backend.db.course_documents.length).toBe(0);
    expect(backend.db.course_document_chunks.length).toBeLessThan(40);
  });

  test("if a chunk fails, the half-uploaded document is deleted and the user is told", async ({ page }) => {
    backend.failChunkAt = 1;
    await openMaterials(page);
    await textbookInput(page).setInputFiles(upload("book.pdf", pdf(3 * MiB)));

    await expect(page.getByText(/The upload failed part-way/)).toBeVisible();
    await expect.poll(() => backend.db.course_documents.length).toBe(0);
    await expect(page.getByText("No textbooks yet.")).toBeVisible();
  });
});

test.describe("course materials: what is refused", () => {
  test("wrong file types are refused before anything is sent", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { courses: [makeCourse()] });
    await openMaterials(page);

    await textbookInput(page).setInputFiles(upload("book.docx", pdf(100), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    await expect(page.getByText("Textbooks need to be PDF files.")).toBeVisible();

    await syllabusInput(page).setInputFiles(upload("notes.exe", pdf(100), "application/octet-stream"));
    await expect(page.getByText(/A syllabus can be a PDF, a Word/)).toBeVisible();

    expect(backend.posts("course_documents")).toHaveLength(0);
  });

  test("an empty file is refused", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { courses: [makeCourse()] });
    await openMaterials(page);
    await textbookInput(page).setInputFiles(upload("empty.pdf", Buffer.alloc(0)));
    await expect(page.getByText("That file is empty.")).toBeVisible();
    expect(backend.posts("course_documents")).toHaveLength(0);
  });

  test("a file over the per-file limit is refused, saying what the limit is", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { courses: [makeCourse()], documentLimits: { max_file_bytes: 2 * MiB } });
    await openMaterials(page);
    await textbookInput(page).setInputFiles(upload("big.pdf", pdf(3 * MiB)));
    await expect(page.getByText(/limit for one file is 2\.0 MB/)).toBeVisible();
    expect(backend.posts("course_documents")).toHaveLength(0);
  });

  test("a file that would exceed the user's total storage is refused", async ({ context, page }) => {
    const backend = await installFakeBackend(context, {
      courses: [makeCourse()],
      documents: [seededDocument()],
      documentLimits: { max_user_bytes: 5 * MiB },
    });
    await openMaterials(page);
    await textbookInput(page).setInputFiles(upload("another.pdf", pdf(3 * MiB)));
    await expect(page.getByText(/over your storage limit/)).toBeVisible();
    expect(backend.posts("course_documents")).toHaveLength(0);
  });

  test("the database refusing a document (e.g. a stale limit) is explained, not a generic error", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { courses: [makeCourse()] });
    await openMaterials(page);
    // the page has loaded the generous limits; now the server's limit drops
    backend.db.document_limits[0].max_file_bytes = 1 * MiB;
    await textbookInput(page).setInputFiles(upload("book.pdf", pdf(2 * MiB)));
    await expect(page.getByText(/over a storage limit, or uploads are switched off/)).toBeVisible();
    expect(backend.db.course_documents).toHaveLength(0);
  });

  test("when uploads are switched off there is no upload button, only an explanation", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [seededDocument()], documentLimits: { enabled: false } });
    await openMaterials(page);
    await expect(page.getByText(/switched off on this server/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload textbook" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Upload syllabus" })).toHaveCount(0);
    // what was already uploaded is still shown
    await expect(page.getByText("existing-book.pdf")).toBeVisible();
  });
});

test.describe("course materials: after upload", () => {
  test("a file the worker couldn't read shows why, and Retry queues it again", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { courses: [makeCourse()] });
    let attempt = 0;
    backend.workerOutcome = () =>
      ++attempt === 1
        ? { status: "failed", error: "That PDF is password-protected. Remove the password and upload it again." }
        : { status: "ready", page_count: 7 };
    await openMaterials(page);
    await textbookInput(page).setInputFiles(upload("locked.pdf", pdf(2048)));

    const row = page.locator("div.rounded-xl", { hasText: "locked.pdf" });
    await expect(row.getByRole("alert")).toContainText("password-protected", { timeout: 10_000 });

    await row.getByRole("button", { name: "Retry" }).click();
    await expect(row.getByText(/Ready · 7 pages/)).toBeVisible({ timeout: 10_000 });
    expect(backend.patches("course_documents").filter((p) => p.status === "queued")).toHaveLength(2);
  });

  test("deleting a file asks first, then removes it and everything read from it", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { courses: [makeCourse()], documents: [seededDocument()] });
    await openMaterials(page);
    await page.getByRole("button", { name: "Delete existing-book.pdf" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("existing-book.pdf");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(backend.db.course_documents).toHaveLength(1);

    await page.getByRole("button", { name: "Delete existing-book.pdf" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("existing-book.pdf")).toBeHidden();
    expect(backend.db.course_documents).toHaveLength(0);
  });

  test("an upload left half-finished (tab closed) says so and can be deleted", async ({ context, page }) => {
    await installFakeBackend(context, {
      courses: [makeCourse()],
      documents: [seededDocument({ status: "uploading", uploaded_bytes: MiB, progress: 0, page_count: null, filename: "half.pdf" })],
    });
    await openMaterials(page);
    await expect(page.getByText("Upload interrupted. Delete it and upload again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete half.pdf" })).toBeVisible();
  });

  test("documents are shown under the right heading, and only for this course", async ({ context, page }) => {
    await installFakeBackend(context, {
      courses: [makeCourse()],
      documents: [
        seededDocument({ id: "d1", filename: "the-textbook.pdf" }),
        seededDocument({ id: "d2", kind: "syllabus", filename: "the-syllabus.pdf", page_count: 3 }),
        seededDocument({ id: "d3", course_id: "c0000000-0000-4000-8000-0000000000ff", filename: "another-courses-book.pdf" }),
      ],
    });
    await openMaterials(page);
    await expect(page.getByText("the-textbook.pdf")).toBeVisible();
    await expect(page.getByText("the-syllabus.pdf")).toBeVisible();
    await expect(page.getByText("another-courses-book.pdf")).toHaveCount(0);
    await expect(page.getByText(/Ready · 3 pages/)).toBeVisible();
  });

  test("shows how much of the storage is used", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [seededDocument()] });
    await openMaterials(page);
    await expect(page.getByText(/Using 3\.0 MB of 1\.0 GB/)).toBeVisible();
  });
});

test.describe("course materials: limits", () => {
  test("the usage line states the limits when there are some", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()] });
    await openMaterials(page);
    await expect(page.getByText("Using 0 B of 1.0 GB across all your courses. One file can be up to 200 MB.")).toBeVisible();
  });

  test("with unlimited settings it says there is no limit instead of showing a huge number", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documentLimits: { max_file_bytes: 1e15, max_user_bytes: 1e15 } });
    await openMaterials(page);
    await expect(page.getByText("Using 0 B across all your courses. There's no limit on the size of one file.")).toBeVisible();
    await expect(page.getByText(/1000 TB|PB| of 1/)).toHaveCount(0);
  });

  test("a file over the default limit is accepted when the limits are unlimited, and refused when they aren't", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { courses: [makeCourse()], documentLimits: { max_file_bytes: 10 * MiB, max_user_bytes: 10 * MiB } });
    await openMaterials(page);
    await textbookInput(page).setInputFiles(upload("atlas.pdf", pdf(12 * MiB)));
    await expect(page.getByText(/the limit for one file is 10\.0 MB|the limit for one file is 10 MB/)).toBeVisible();
    expect(backend.posts("course_documents")).toEqual([]);

    backend.db.document_limits[0].max_file_bytes = 1e15;
    backend.db.document_limits[0].max_user_bytes = 1e15;
    await page.reload();
    await page.getByRole("tab", { name: "Materials" }).click();
    await textbookInput(page).setInputFiles(upload("atlas.pdf", pdf(12 * MiB)));
    await expect.poll(() => backend.posts("course_documents").length).toBe(1);
  });
});
