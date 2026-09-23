import { readFileSync } from "node:fs";
import { test, expect, type Page } from "../playwright-fixture";
import { installFakeBackend, makeCourse, makeTask, COURSE_ID, USER_ID, type FakeBackend, type Row } from "./support/fakeBackend";

const BOOK_ID = "d0000000-0000-4000-8000-000000000001";
const OTHER_COURSE = "c0000000-0000-4000-8000-000000000002";

function book(overrides: Partial<Row> = {}): Row {
  return {
    id: BOOK_ID, user_id: USER_ID, course_id: COURSE_ID, kind: "textbook", filename: "Chemistry 12e.pdf", mime_type: "application/pdf",
    size_bytes: 3 * 1024 * 1024, uploaded_bytes: 3 * 1024 * 1024, status: "ready", progress: 100, error: null, page_count: 400, page_offset: 0,
    created_at: new Date().toISOString(), ...overrides,
  };
}

const chapter = (n: number, title: string, start: number, end: number): Row => ({
  id: `c000000${n}-0000-4000-8000-000000000001`, document_id: BOOK_ID, user_id: USER_ID, number: n, title, start_page: start, end_page: end, source: "toc",
});
const CHAPTERS = [chapter(5, "Cell Structure", 130, 171), chapter(6, "Energy", 172, 220), chapter(7, "Genes", 221, 260)];

let counter = 0;
/** A reading typed in by hand: no link to any textbook. */
function reading(title: string, overrides: Partial<Row> = {}): Row {
  return {
    id: `r${String(++counter).padStart(7, "0")}-0000-4000-8000-000000000001`, user_id: USER_ID, course_id: COURSE_ID, title, pages: null,
    due_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), status: "not_started", document_id: null, start_page: null, end_page: null,
    created_at: new Date().toISOString(), ...overrides,
  };
}

async function download(page: Page, name: string) {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
  return { filename: file.suggestedFilename(), bytes: readFileSync((await file.path())!) };
}

async function readingsPage(page: Page) {
  await page.goto("/readings");
  await expect(page.getByRole("heading", { name: "Readings" }).first()).toBeVisible();
}

test.describe("the readings page offers the chapter when the textbook has been read", () => {
  let backend: FakeBackend;
  test.beforeEach(async ({ context }) => {
    backend = await installFakeBackend(context, {
      courses: [makeCourse(), makeCourse({ id: OTHER_COURSE, name: "Physics", short_code: "PHY 109" })],
      documents: [book()],
      chapters: CHAPTERS,
      readings: [reading("Read Chapter 5"), reading("Chapter 9 problems set reading"), reading("Skim the intro", { course_id: COURSE_ID })],
    });
  });

  test("a reading typed by hand that names a chapter gets a download of just that chapter", async ({ page }) => {
    await readingsPage(page);
    const { filename, bytes } = await download(page, "Download Ch. 5 (pp. 130–171)");
    expect(bytes.toString()).toBe("%PDF-1.7 fake extract of pages 130-171");
    expect(filename).toBe("Chemistry 12e - Read Chapter 5 - pp130-171.pdf");
    expect(backend.posts("document_extracts")).toEqual([{ document_id: BOOK_ID, user_id: USER_ID, start_page: 130, end_page: 171 }]);
  });

  test("no button for a chapter the book doesn't have, or for a reading that names no chapter", async ({ page }) => {
    await readingsPage(page);
    await expect(page.getByText("Read Chapter 5")).toBeVisible();
    await expect(page.getByText("Chapter 9 problems set reading")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Download/ })).toHaveCount(1); // only chapter 5's
  });

  test("the chapter can be named in the pages field instead of the title", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [book()], chapters: CHAPTERS, readings: [reading("Cell biology", { pages: "Ch. 6" })] });
    await readingsPage(page);
    const { bytes } = await download(page, "Download Ch. 6 (pp. 172–220)");
    expect(bytes.toString()).toContain("pages 172-220");
  });

  test("a range of chapters downloads as one file", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [book()], chapters: CHAPTERS, readings: [reading("Read Chapters 5-6")] });
    await readingsPage(page);
    const { bytes } = await download(page, "Download Ch. 5–6 (pp. 130–220)");
    expect(bytes.toString()).toContain("pages 130-220");
  });

  test("page numbers are shifted by the book's offset", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [book({ page_offset: 12 })], readings: [reading("Read pp. 101-130")] });
    await readingsPage(page);
    const { bytes } = await download(page, "Download pp. 101–130");
    expect(bytes.toString()).toContain("pages 113-142");
  });

  test("a chapter plus pages ('Ch. 4, pp. 101-130') downloads exactly those pages", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [book()], chapters: CHAPTERS, readings: [reading("Ch. 5, pp. 140-150")] });
    await readingsPage(page);
    const { bytes } = await download(page, "Download pp. 140–150");
    expect(bytes.toString()).toContain("pages 140-150");
  });

  test("the same reading in a course without a textbook has no button", async ({ context, page }) => {
    await installFakeBackend(context, {
      courses: [makeCourse(), makeCourse({ id: OTHER_COURSE, name: "Physics", short_code: "PHY 109" })],
      documents: [book()], chapters: CHAPTERS, readings: [reading("Read Chapter 5", { course_id: OTHER_COURSE })],
    });
    await readingsPage(page);
    await expect(page.getByText("Read Chapter 5")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Download/ })).toHaveCount(0);
  });

  test("each course's readings use that course's own textbook", async ({ context, page }) => {
    const second = book({ id: "d0000000-0000-4000-8000-000000000002", course_id: OTHER_COURSE, filename: "Physics 9e.pdf" });
    const backend2 = await installFakeBackend(context, {
      courses: [makeCourse(), makeCourse({ id: OTHER_COURSE, name: "Physics", short_code: "PHY 109" })],
      documents: [book(), second],
      chapters: [...CHAPTERS, { ...chapter(5, "Motion", 10, 30), id: "c9000005-0000-4000-8000-000000000001", document_id: second.id }],
      readings: [reading("Read Chapter 5", { course_id: OTHER_COURSE })],
    });
    await readingsPage(page);
    const { filename, bytes } = await download(page, "Download Ch. 5 (pp. 10–30)");
    expect(filename).toContain("Physics 9e");
    expect(bytes.toString()).toContain("pages 10-30");
    expect(backend2.posts("document_extracts")[0]).toMatchObject({ document_id: second.id });
  });

  test("a textbook that hasn't finished being read offers nothing yet", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [book({ status: "processing", progress: 40, page_count: null })], readings: [reading("Read Chapter 5")] });
    await readingsPage(page);
    await expect(page.getByText("Read Chapter 5")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Download/ })).toHaveCount(0);
  });

  test("a syllabus is not a textbook", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [book({ kind: "syllabus" })], chapters: CHAPTERS, readings: [reading("Read Chapter 5")] });
    await readingsPage(page);
    await expect(page.getByRole("button", { name: /^Download/ })).toHaveCount(0);
  });

  test("a reading linked from a syllabus keeps its exact range, whatever its title says", async ({ context, page }) => {
    await installFakeBackend(context, {
      courses: [makeCourse()], documents: [book()], chapters: CHAPTERS,
      readings: [reading("Chapter 5: Cell Structure", { pages: "Ch. 5 (pp. 130–171)", document_id: BOOK_ID, start_page: 131, end_page: 140 })],
    });
    await readingsPage(page);
    const { bytes } = await download(page, "Download Ch. 5 (pp. 130–171)");
    expect(bytes.toString()).toContain("pages 131-140");
  });

  test("a reading whose textbook was deleted, but that still names a chapter, matches the course's other textbook", async ({ context, page }) => {
    await installFakeBackend(context, {
      courses: [makeCourse()], documents: [book()], chapters: CHAPTERS,
      readings: [reading("Read Chapter 6", { document_id: null, start_page: 1, end_page: 5 })],
    });
    await readingsPage(page);
    const { bytes } = await download(page, "Download Ch. 6 (pp. 172–220)");
    expect(bytes.toString()).toContain("pages 172-220");
  });

  test("a reading task (a task of type 'reading') gets the download too", async ({ context, page }) => {
    await installFakeBackend(context, {
      courses: [makeCourse()], documents: [book()], chapters: CHAPTERS,
      tasks: [makeTask({ title: "Read Chapter 7", type: "reading", course_id: COURSE_ID })],
    });
    await readingsPage(page);
    const { bytes } = await download(page, "Download Ch. 7 (pp. 221–260)");
    expect(bytes.toString()).toContain("pages 221-260");
  });

  test("the course page's reading list has it too, and so does the Today page", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [book()], chapters: CHAPTERS, readings: [reading("Read Chapter 5")] });
    await page.goto(`/courses/${COURSE_ID}`);
    await page.getByRole("tab", { name: /Readings/ }).click();
    await expect(page.getByRole("button", { name: "Download Ch. 5 (pp. 130–171)" })).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Download Ch. 5 (pp. 130–171)" })).toBeVisible();
  });

  test("deleting the textbook takes the buttons away", async ({ context, page }) => {
    const b = await installFakeBackend(context, { courses: [makeCourse()], documents: [book()], chapters: CHAPTERS, readings: [reading("Read Chapter 5")] });
    await page.goto(`/courses/${COURSE_ID}`);
    await page.getByRole("tab", { name: "Materials" }).click();
    await page.getByRole("button", { name: "Delete Chemistry 12e.pdf" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(() => b.db.course_documents.length).toBe(0);
    await page.getByRole("tab", { name: /Readings/ }).click();
    await expect(page.getByText("Read Chapter 5")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Download/ })).toHaveCount(0);
  });
});
