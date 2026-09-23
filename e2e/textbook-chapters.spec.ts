import { readFileSync } from "node:fs";
import { test, expect, type Page } from "../playwright-fixture";
import { installFakeBackend, makeCourse, COURSE_ID, USER_ID, PIECE_BYTES, type FakeBackend, type Row } from "./support/fakeBackend";

const BOOK_ID = "d0000000-0000-4000-8000-000000000001";

function book(overrides: Partial<Row> = {}): Row {
  return {
    id: BOOK_ID,
    user_id: USER_ID,
    course_id: COURSE_ID,
    kind: "textbook",
    filename: "Chemistry 12e.pdf",
    mime_type: "application/pdf",
    size_bytes: 3 * 1024 * 1024,
    uploaded_bytes: 3 * 1024 * 1024,
    status: "ready",
    progress: 100,
    error: null,
    page_count: 400,
    page_offset: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

let chapterCount = 0;
function chapter(number: number | null, title: string, start: number, end: number, source = "toc"): Row {
  return { id: `c${String(++chapterCount).padStart(7, "0")}-0000-4000-8000-000000000001`, document_id: BOOK_ID, user_id: USER_ID, number, title, start_page: start, end_page: end, source };
}

const CHAPTERS = () => [chapter(4, "Genetics", 88, 129), chapter(5, "Cell Structure", 130, 171), chapter(6, "Energy", 172, 220)];

async function openChapters(page: Page) {
  await page.goto(`/courses/${COURSE_ID}`);
  await page.getByRole("tab", { name: "Materials" }).click();
  await page.getByRole("button", { name: "Chapters and downloads" }).click();
}

async function downloadFrom(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent("download"), click()]);
  return { filename: download.suggestedFilename(), bytes: readFileSync((await download.path())!) };
}

test.describe("textbook chapters", () => {
  let backend: FakeBackend;
  test.beforeEach(async ({ context }) => {
    backend = await installFakeBackend(context, { courses: [makeCourse()], documents: [book()], chapters: CHAPTERS() });
  });

  test("lists the chapters found, in page order, and says where they came from", async ({ page }) => {
    await openChapters(page);
    const rows = page.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Ch. 4: Genetics");
    await expect(rows.nth(0)).toContainText("PDF pp. 88–129");
    await expect(rows.nth(2)).toContainText("Ch. 6: Energy");
    await expect(page.getByText("Found automatically from the contents page.")).toBeVisible();
  });

  test("the panel is closed until asked for, and nothing is fetched before that", async ({ page }) => {
    await page.goto(`/courses/${COURSE_ID}`);
    await page.getByRole("tab", { name: "Materials" }).click();
    await expect(page.getByRole("button", { name: "Chapters and downloads" })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
    expect(backend.count("document_chapters")).toBe(0);
  });

  test("downloading a chapter asks for exactly its pages and saves them as a named PDF", async ({ page }) => {
    await openChapters(page);
    const { filename, bytes } = await downloadFrom(page, () => page.getByRole("button", { name: "Download Ch. 5: Cell Structure" }).click());

    expect(backend.posts("document_extracts")).toEqual([{ document_id: BOOK_ID, user_id: USER_ID, start_page: 130, end_page: 171 }]);
    expect(filename).toBe("Chemistry 12e - Ch. 5 Cell Structure - pp130-171.pdf");
    expect(bytes.toString()).toBe("%PDF-1.7 fake extract of pages 130-171");
    // it is only a hand-over: the server's copy is removed once it has been collected
    await expect.poll(() => backend.db.document_extracts.length).toBe(0);
  });

  test("a large result is fetched in pieces and reassembled exactly", async ({ page }) => {
    const big = Buffer.alloc(2 * PIECE_BYTES + 12345);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 0xff;
    backend.extractOutcome = () => ({ status: "ready", bytes: big });

    await openChapters(page);
    const { bytes } = await downloadFrom(page, () => page.getByRole("button", { name: "Download Ch. 6: Energy" }).click());
    expect(bytes.equals(big)).toBe(true);
    expect(backend.pieceRequests).toBe(3);
  });

  test("the button shows it is working and can't be pressed twice", async ({ page }) => {
    backend.workerDelayMs = 700;
    await openChapters(page);
    const button = page.getByRole("button", { name: "Download Ch. 5: Cell Structure" });
    await button.click();
    await expect(button).toBeDisabled();
    await expect(page.getByText("Preparing those pages…")).toBeVisible();
    await expect(page.getByText("Downloaded")).toBeVisible({ timeout: 10_000 });
    expect(backend.posts("document_extracts")).toHaveLength(1);
    await expect(button).toBeEnabled();
  });

  test("when the server can't cut the pages the reason is shown, and trying again works", async ({ page }) => {
    backend.extractOutcome = () => ({ status: "failed", error: "Cutting out those pages failed. The file may be damaged." });
    await openChapters(page);
    const button = page.getByRole("button", { name: "Download Ch. 5: Cell Structure" });
    await button.click();
    await expect(page.getByText("Cutting out those pages failed. The file may be damaged.")).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => backend.db.document_extracts.length).toBe(0);   // nothing left behind

    backend.extractOutcome = (extract) => ({ status: "ready", bytes: Buffer.from(`%PDF fixed ${extract.start_page}`) });
    const { bytes } = await downloadFrom(page, () => button.click());
    expect(bytes.toString()).toBe("%PDF fixed 130");
  });

  test("a refusal from the database (too many at once) is passed on in words", async ({ page }) => {
    for (let n = 0; n < 10; n++) backend.db.document_extracts.push({ id: `e${n}`, document_id: BOOK_ID, user_id: USER_ID, start_page: 300 + n, end_page: 300 + n, status: "pending", error: null, size_bytes: null });
    await openChapters(page);
    await page.getByRole("button", { name: "Download Ch. 5: Cell Structure" }).click();
    await expect(page.getByText("Too many downloads are being prepared at once. Wait for one to finish.")).toBeVisible();
  });

  test("a chapter's pages can be corrected, and it then counts as the user's own", async ({ page }) => {
    await openChapters(page);
    await page.getByRole("button", { name: "Edit Ch. 5: Cell Structure" }).click();
    await page.getByLabel("First page").fill("131");
    await page.getByLabel("Last page").fill("170");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("listitem").nth(1)).toContainText("PDF pp. 131–170");
    expect(backend.patches("document_chapters")).toEqual([{ number: 5, title: "Cell Structure", start_page: 131, end_page: 170 }]);
    expect(backend.db.document_chapters.find((c) => c.number === 5)?.source).toBe("manual");
    await expect(page.getByText(/Some found automatically, some added by you/)).toBeVisible();
  });

  test("a range that doesn't fit the book is refused before anything is sent", async ({ page }) => {
    await openChapters(page);
    await page.getByRole("button", { name: "Edit Ch. 5: Cell Structure" }).click();
    await page.getByLabel("Last page").fill("401");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert")).toHaveText("The book only has 400 pages.");
    await page.getByLabel("Last page").fill("100");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert")).toHaveText("The last page can't be before the first.");
    expect(backend.patches("document_chapters")).toEqual([]);
  });

  test("a chapter can be added by hand", async ({ page }) => {
    await openChapters(page);
    await page.getByRole("button", { name: "Add chapter" }).click();
    await page.getByLabel("Number").fill("7");
    await page.getByLabel("Title").fill("Photosynthesis");
    await page.getByLabel("First page").fill("221");
    await page.getByLabel("Last page").fill("260");
    await page.getByRole("button", { name: "Add chapter" }).last().click();

    await expect(page.getByRole("listitem")).toHaveCount(4);
    await expect(page.getByRole("listitem").nth(3)).toContainText("Ch. 7: Photosynthesis");
    expect(backend.posts("document_chapters")).toEqual([{ number: 7, title: "Photosynthesis", start_page: 221, end_page: 260, document_id: BOOK_ID, user_id: USER_ID }]);
  });

  test("a chapter needs a number or a title", async ({ page }) => {
    await openChapters(page);
    await page.getByRole("button", { name: "Add chapter" }).click();
    await page.getByLabel("First page").fill("1");
    await page.getByLabel("Last page").fill("9");
    await page.getByRole("button", { name: "Add chapter" }).last().click();
    await expect(page.getByRole("alert")).toHaveText("Give the chapter a number or a title.");
    expect(backend.posts("document_chapters")).toEqual([]);
  });

  test("removing a chapter asks first, and leaves the book alone", async ({ page }) => {
    await openChapters(page);
    await page.getByRole("button", { name: "Remove Ch. 4: Genetics" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("listitem")).toHaveCount(3);

    await page.getByRole("button", { name: "Remove Ch. 4: Genetics" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("listitem")).toHaveCount(2);
    expect(backend.db.course_documents).toHaveLength(1);
  });

  test("any range of pages can be downloaded, with checks on what is typed", async ({ page }) => {
    await openChapters(page);
    await page.getByRole("button", { name: "Download pages…" }).click();
    await page.getByLabel("First page").fill("0");
    await page.getByLabel("Last page").fill("9");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Pages start at 1.");
    expect(backend.posts("document_extracts")).toEqual([]);

    await page.getByLabel("First page").fill("3");
    const { filename, bytes } = await downloadFrom(page, () => page.getByRole("button", { name: "Download", exact: true }).click());
    expect(filename).toBe("Chemistry 12e - pp3-9.pdf");
    expect(bytes.toString()).toBe("%PDF-1.7 fake extract of pages 3-9");
  });

  test("a single page is named as one", async ({ page }) => {
    await openChapters(page);
    await page.getByRole("button", { name: "Download pages…" }).click();
    await page.getByLabel("First page").fill("42");
    await page.getByLabel("Last page").fill("42");
    const { filename } = await downloadFrom(page, () => page.getByRole("button", { name: "Download", exact: true }).click());
    expect(filename).toBe("Chemistry 12e - p42.pdf");
  });
});

test.describe("textbook chapters: other cases", () => {
  test("a book with no chapters says so and still offers page ranges", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [book()] });
    await openChapters(page);
    await expect(page.getByText("No chapters were found automatically.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download pages…" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add chapter" })).toBeVisible();
  });

  test("when the book's page numbers are shifted, both numberings are shown", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [book({ page_offset: 12 })], chapters: [chapter(5, "Cell Structure", 113, 142)] });
    await openChapters(page);
    await expect(page.getByRole("listitem")).toContainText("PDF pp. 113–142 · book pp. 101–130");
  });

  test("a chapter with only a title, or only a number, is labelled sensibly", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [book()], chapters: [chapter(null, "Introduction", 5, 20, "manual"), chapter(9, "", 21, 40, "manual")] });
    await openChapters(page);
    await expect(page.getByRole("listitem").nth(0)).toContainText("Introduction");
    await expect(page.getByRole("listitem").nth(1)).toContainText("Ch. 9");
    await expect(page.getByText("Chapters you added.")).toBeVisible();
  });

  test("bookmark-based chapters are described as such", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [book()], chapters: [chapter(1, "A", 1, 9, "outline"), chapter(2, "B", 10, 19, "outline")] });
    await openChapters(page);
    await expect(page.getByText("Found automatically from the PDF's bookmarks.")).toBeVisible();
  });

  test("no chapter panel for a book still being read, a failed one, or a syllabus", async ({ context, page }) => {
    await installFakeBackend(context, {
      courses: [makeCourse()],
      documents: [
        book({ id: "d0000000-0000-4000-8000-000000000002", filename: "reading.pdf", status: "processing", progress: 40, page_count: null }),
        book({ id: "d0000000-0000-4000-8000-000000000003", filename: "broken.pdf", status: "failed", error: "damaged", page_count: null }),
        book({ id: "d0000000-0000-4000-8000-000000000004", filename: "syllabus.pdf", kind: "syllabus", page_count: 3 }),
      ],
    });
    await page.goto(`/courses/${COURSE_ID}`);
    await page.getByRole("tab", { name: "Materials" }).click();
    await expect(page.getByText("syllabus.pdf")).toBeVisible();
    await expect(page.getByRole("button", { name: "Chapters and downloads" })).toHaveCount(0);
  });
});
