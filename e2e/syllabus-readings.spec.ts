import { readFileSync } from "node:fs";
import { test, expect, type Page } from "../playwright-fixture";
import { installFakeBackend, makeCourse, COURSE_ID, USER_ID, ymdInTz, type FakeBackend, type Row } from "./support/fakeBackend";

const BOOK_ID = "d0000000-0000-4000-8000-000000000001";
const SYLLABUS_ID = "d0000000-0000-4000-8000-000000000002";

function doc(overrides: Partial<Row>): Row {
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

// Explicit years, so the specs don't depend on today's date.
const SYLLABUS = [
  "CHEM 111 - Fall 2099",
  "Week   Date            Reading              Assignment",
  "1      Oct 18, 2099    Chapter 5            HW 1 due",
  "2      Oct 25, 2099    Chapters 6-7",
  "3      Nov 1, 2099     Chapter 9",
  "Midterm Exam Nov 8, 2099 (covers Chapters 5-7)",
].join("\n");

const syllabusPage = (text: string): Row => ({ id: "page-1", document_id: SYLLABUS_ID, page: 1, user_id: USER_ID, text, ocr: false });

const syllabusDoc = () => doc({ id: SYLLABUS_ID, kind: "syllabus", filename: "syllabus.pdf", page_count: 1, size_bytes: 1000, uploaded_bytes: 1000 });

async function openMaterials(page: Page) {
  await page.goto(`/courses/${COURSE_ID}`);
  await page.getByRole("tab", { name: "Materials" }).click();
}

async function findReadings(page: Page) {
  await openMaterials(page);
  await page.getByRole("button", { name: "Find readings" }).click();
  await expect(page.getByRole("heading", { name: "Readings found in your syllabus" })).toBeVisible();
}

const rows = (page: Page) => page.getByRole("dialog").getByRole("listitem");

test.describe("finding readings in a syllabus", () => {
  let backend: FakeBackend;
  test.beforeEach(async ({ context }) => {
    backend = await installFakeBackend(context, {
      courses: [makeCourse()],
      documents: [doc({}), syllabusDoc()],
      chapters: CHAPTERS,
      pages: [syllabusPage(SYLLABUS)],
    });
  });

  test("the button is only offered on a syllabus that has been read", async ({ context, page }) => {
    await openMaterials(page);
    await expect(page.getByRole("button", { name: "Find readings" })).toHaveCount(1);
    const other = await installFakeBackend(context, {
      courses: [makeCourse()],
      documents: [doc({}), doc({ id: SYLLABUS_ID, kind: "syllabus", filename: "s.pdf", status: "processing", progress: 30, page_count: null })],
    });
    await openMaterials(page);
    await expect(page.getByRole("button", { name: "Find readings" })).toHaveCount(0);
    expect(other.count("readings", "POST")).toBe(0);
  });

  test("lists what it found, dated, matched to the textbook's chapters, with the line each came from", async ({ page }) => {
    await findReadings(page);
    await expect(rows(page)).toHaveCount(3);

    const first = rows(page).nth(0);
    await expect(first.getByLabel(/^Title for Chapter 5/)).toHaveValue("Chapter 5: Cell Structure");
    await expect(first.getByLabel(/^Due date for Chapter 5/)).toHaveValue("2099-10-18");
    await expect(first).toContainText("Download: Ch. 5 (pp. 130–171)");
    await expect(first).toContainText("Chapter 5            HW 1 due");

    const second = rows(page).nth(1);
    await expect(second.getByLabel(/^Title for Chapters 6–7/)).toHaveValue("Chapters 6–7");
    await expect(second).toContainText("Download: Ch. 6–7 (pp. 172–260)");

    // the book has no chapter 9, so there is a reading but no download
    const third = rows(page).nth(2);
    await expect(third.getByLabel(/^Title for Chapter 9/)).toHaveValue("Chapter 9");
    await expect(third).not.toContainText("Download:");
    await expect(third).toContainText("Not found in your textbooks");
  });

  test("the exam that covers chapters is not offered as a reading", async ({ page }) => {
    await findReadings(page);
    await expect(page.getByRole("dialog")).not.toContainText("Midterm");
  });

  test("nothing is saved until confirmed, and cancelling saves nothing", async ({ page }) => {
    await findReadings(page);
    expect(backend.count("readings", "POST")).toBe(0);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(backend.posts("readings")).toEqual([]);
  });

  test("confirming adds each ticked reading with its date, pages and download link", async ({ page }) => {
    await findReadings(page);
    await page.getByRole("button", { name: "Add 3 readings" }).click();
    await expect(page.getByText("Added 3 readings")).toBeVisible();

    expect(backend.posts("readings")).toEqual([
      { user_id: USER_ID, course_id: COURSE_ID, title: "Chapter 5: Cell Structure", pages: "Ch. 5 (pp. 130–171)", due_date: "2099-10-18", document_id: BOOK_ID, start_page: 130, end_page: 171 },
      { user_id: USER_ID, course_id: COURSE_ID, title: "Chapters 6–7", pages: "Ch. 6–7 (pp. 172–260)", due_date: "2099-10-25", document_id: BOOK_ID, start_page: 172, end_page: 260 },
      { user_id: USER_ID, course_id: COURSE_ID, title: "Chapter 9", pages: "Ch. 9", due_date: "2099-11-01" },
    ]);
    expect(backend.writes.filter((w) => w.table === "readings")).toHaveLength(1); // one request: all or none
  });

  test("a reading can be unticked, retitled and redated first", async ({ page }) => {
    await findReadings(page);
    await rows(page).nth(2).getByRole("checkbox").click();
    await rows(page).nth(0).getByLabel(/^Title for/).fill("Read the cell chapter");
    await rows(page).nth(0).getByLabel(/^Due date for/).fill("2099-10-19");
    await page.getByRole("button", { name: "Add 2 readings" }).click();

    await expect.poll(() => backend.posts("readings").length).toBe(2);
    expect(backend.posts("readings")[0]).toMatchObject({ title: "Read the cell chapter", due_date: "2099-10-19", document_id: BOOK_ID });
    expect(backend.posts("readings").map((r) => r.title)).not.toContain("Chapter 9");
  });

  test("clearing the date adds the reading without one", async ({ page }) => {
    await findReadings(page);
    await rows(page).nth(0).getByLabel(/^Due date for/).fill("");
    await expect(rows(page).nth(0)).toContainText("No date found");
    await page.getByRole("button", { name: "Add 3 readings" }).click();
    await expect.poll(() => backend.posts("readings").length).toBe(3);
    expect(backend.posts("readings")[0]).not.toHaveProperty("due_date");
  });

  test("choosing 'None' for the textbook drops the download and the automatic title", async ({ page }) => {
    await findReadings(page);
    await rows(page).nth(0).getByLabel(/^Textbook for/).selectOption({ label: "None" });
    await expect(rows(page).nth(0).getByLabel(/^Title for/)).toHaveValue("Chapter 5");
    await expect(rows(page).nth(0)).not.toContainText("Download:");
    await page.getByRole("button", { name: "Add 3 readings" }).click();
    await expect.poll(() => backend.posts("readings").length).toBe(3);
    expect(backend.posts("readings")[0]).toEqual({ user_id: USER_ID, course_id: COURSE_ID, title: "Chapter 5", pages: "Ch. 5", due_date: "2099-10-18" });
  });

  test("a title that was typed by hand survives changing the textbook", async ({ page }) => {
    await findReadings(page);
    await rows(page).nth(0).getByLabel(/^Title for/).fill("My own title");
    await rows(page).nth(0).getByLabel(/^Textbook for/).selectOption({ label: "None" });
    await expect(rows(page).nth(0).getByLabel(/^Title for/)).toHaveValue("My own title");
  });

  test("an empty title is refused", async ({ page }) => {
    await findReadings(page);
    await rows(page).nth(0).getByLabel(/^Title for/).fill("  ");
    await page.getByRole("button", { name: "Add 3 readings" }).click();
    await expect(page.getByRole("alert")).toHaveText("Every reading needs a title.");
    expect(backend.posts("readings")).toEqual([]);
  });

  test("with nothing ticked the button says so and does nothing", async ({ page }) => {
    await findReadings(page);
    for (let i = 0; i < 3; i++) await rows(page).nth(i).getByRole("checkbox").click();
    await expect(page.getByRole("button", { name: "Nothing selected" })).toBeDisabled();
  });

  test("a failed save keeps the review open so nothing is lost", async ({ page }) => {
    await findReadings(page);
    backend.db.course_documents.length = 0; // the book vanishes: the database refuses the link
    await page.getByRole("button", { name: "Add 3 readings" }).click();
    await expect(page.getByRole("heading", { name: "Readings found in your syllabus" })).toBeVisible();
    expect(backend.db.readings).toHaveLength(0);
  });
});

test.describe("finding readings: other cases", () => {
  test("readings already in the list start unticked", async ({ context, page }) => {
    await installFakeBackend(context, {
      courses: [makeCourse()], documents: [doc({}), syllabusDoc()], chapters: CHAPTERS, pages: [syllabusPage(SYLLABUS)],
      readings: [{ id: "r1", user_id: USER_ID, course_id: COURSE_ID, title: "Chapter 5: Cell Structure", pages: null, due_date: "2099-10-18", status: "not_started", created_at: new Date().toISOString() }],
    });
    await findReadings(page);
    await expect(rows(page).nth(0)).toContainText("Already in your readings");
    await expect(rows(page).nth(0).getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Add 2 readings" })).toBeVisible();
  });

  test("a syllabus with no readings in it says so", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [syllabusDoc()], pages: [syllabusPage("Welcome! Office hours are Tuesdays 2-4pm.\nAttendance is 10% of your grade.")] });
    await findReadings(page);
    await expect(page.getByText("We couldn't find any readings in this syllabus.")).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("without a textbook, readings are still added, and the dialog explains what a textbook would add", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { courses: [makeCourse()], documents: [syllabusDoc()], pages: [syllabusPage(SYLLABUS)] });
    await findReadings(page);
    await expect(page.getByText(/Upload a textbook for this course/)).toBeVisible();
    await expect(rows(page).nth(0).getByLabel(/^Textbook for/)).toHaveCount(0);
    await page.getByRole("button", { name: "Add 3 readings" }).click();
    await expect.poll(() => backend.posts("readings").length).toBe(3);
    expect(backend.posts("readings").every((r) => !("document_id" in r))).toBe(true);
  });

  test("week numbers are dated from the semester start, and the dialog says the date is an estimate", async ({ context, page }) => {
    await installFakeBackend(context, {
      courses: [makeCourse()], documents: [doc({}), syllabusDoc()], chapters: CHAPTERS, semesterStart: "2099-08-24",
      pages: [syllabusPage("Week 3: Read Chapter 5\nWeek 5: Read Chapter 6")],
    });
    await findReadings(page);
    await expect(rows(page).nth(0).getByLabel(/^Due date for/)).toHaveValue("2099-09-07");
    await expect(rows(page).nth(0)).toContainText("Date estimated from the week number");
    await expect(rows(page).nth(1).getByLabel(/^Due date for/)).toHaveValue("2099-09-21");
  });

  test("an ambiguous date is called out", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [syllabusDoc()], pages: [syllabusPage("Read Chapter 5 by 3/4/2099")] });
    await findReadings(page);
    await expect(rows(page).nth(0)).toContainText("Read as month/day");
    await expect(rows(page).nth(0).getByLabel(/^Due date for/)).toHaveValue("2099-03-04");
  });

  test("printed page numbers are shifted by the book's offset", async ({ context, page }) => {
    const backend = await installFakeBackend(context, {
      courses: [makeCourse()], documents: [doc({ page_offset: 12 }), syllabusDoc()], chapters: [],
      pages: [syllabusPage("Oct 18, 2099   Read pp. 101-130")],
    });
    await findReadings(page);
    await expect(rows(page).nth(0)).toContainText("Download: pp. 101–130");
    await page.getByRole("button", { name: "Add 1 reading" }).click();
    await expect.poll(() => backend.posts("readings").length).toBe(1);
    expect(backend.posts("readings")[0]).toMatchObject({ document_id: BOOK_ID, start_page: 113, end_page: 142, pages: "pp. 101–130", title: "Pages 101–130" });
  });
});

test.describe("readings with a download", () => {
  const linked = (overrides: Partial<Row> = {}): Row => ({
    id: "r-linked", user_id: USER_ID, course_id: COURSE_ID, title: "Chapter 5: Cell Structure", pages: "Ch. 5 (pp. 130–171)",
    due_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), status: "not_started", document_id: BOOK_ID, start_page: 130, end_page: 171,
    created_at: new Date().toISOString(), ...overrides,
  });

  async function download(page: Page, name: string) {
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
    return { filename: file.suggestedFilename(), bytes: readFileSync((await file.path())!) };
  }

  test("a reading in the course's list offers just its chapter", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { courses: [makeCourse()], documents: [doc({})], readings: [linked()] });
    await page.goto(`/courses/${COURSE_ID}`);
    await page.getByRole("tab", { name: /Readings/ }).click();
    const { filename, bytes } = await download(page, "Download Ch. 5 (pp. 130–171)");
    expect(filename).toBe("Chemistry 12e - Chapter 5 Cell Structure - pp130-171.pdf");
    expect(bytes.toString()).toBe("%PDF-1.7 fake extract of pages 130-171");
    expect(backend.posts("document_extracts")).toEqual([{ document_id: BOOK_ID, user_id: USER_ID, start_page: 130, end_page: 171 }]);
  });

  test("so does the Today page's upcoming readings", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], documents: [doc({})], readings: [linked()] });
    await page.goto("/");
    const { bytes } = await download(page, "Download Ch. 5 (pp. 130–171)");
    expect(bytes.toString()).toContain("pages 130-171");
  });

  test("a reading with no textbook link has no download button", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], readings: [linked({ document_id: null, start_page: null, end_page: null })] });
    await page.goto("/");
    await expect(page.getByText("Chapter 5: Cell Structure")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Download/ })).toHaveCount(0);
  });

  test("deleting the textbook keeps the reading and only takes away its download", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { courses: [makeCourse()], documents: [doc({})], readings: [linked()] });
    await openMaterials(page);
    await page.getByRole("button", { name: "Delete Chemistry 12e.pdf" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(() => backend.db.course_documents.length).toBe(0);
    expect(backend.db.readings).toHaveLength(1);
    expect(backend.db.readings[0].document_id).toBeNull();

    await page.getByRole("tab", { name: /Readings/ }).click();
    await expect(page.getByText("Chapter 5: Cell Structure")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Download/ })).toHaveCount(0);
  });
});

test.describe("readings that were due in the past", () => {
  const TZ = "America/New_York";
  const today = () => ymdInTz(new Date(), TZ);

  async function withSyllabus(context: Parameters<typeof installFakeBackend>[0], text: string) {
    return installFakeBackend(context, { timezone: TZ, courses: [makeCourse()], documents: [doc({}), syllabusDoc()], chapters: CHAPTERS, pages: [syllabusPage(text)] });
  }

  test("a reading whose date has passed is added as done, and one that hasn't is not", async ({ context, page }) => {
    const backend = await withSyllabus(context, ["Mar 5, 2020   Read Chapter 5", "Oct 18, 2099   Read Chapter 6"].join("\n"));
    await findReadings(page);
    await expect(rows(page).nth(0)).toContainText("Due in the past: added as done");
    await expect(rows(page).nth(1)).not.toContainText("Due in the past");
    await page.getByRole("button", { name: "Add 2 readings" }).click();

    await expect.poll(() => backend.posts("readings").length).toBe(2);
    const [past, future] = backend.posts("readings");
    expect(past).toMatchObject({ title: "Chapter 5: Cell Structure", due_date: "2020-03-05", status: "done" });
    // dated to the end of its due day in the profile's timezone, so it isn't counted as finished this week
    expect(past.completed_at).toBe("2020-03-06T04:59:00.000Z");
    expect(future).not.toHaveProperty("status");
    expect(future).not.toHaveProperty("completed_at");
  });

  test("a reading due today is not in the past", async ({ context, page }) => {
    const backend = await withSyllabus(context, `${today()}   Read Chapter 5`);
    await findReadings(page);
    await expect(rows(page).nth(0)).not.toContainText("Due in the past");
    await page.getByRole("button", { name: "Add 1 reading" }).click();
    await expect.poll(() => backend.posts("readings").length).toBe(1);
    expect(backend.posts("readings")[0]).not.toHaveProperty("status");
  });

  test("a reading with no date is not marked done", async ({ context, page }) => {
    const backend = await withSyllabus(context, "Required reading: Chapter 5");
    await findReadings(page);
    await page.getByRole("button", { name: "Add 1 reading" }).click();
    await expect.poll(() => backend.posts("readings").length).toBe(1);
    expect(backend.posts("readings")[0]).not.toHaveProperty("status");
  });

  test("changing the date in the review changes whether it counts as past", async ({ context, page }) => {
    const backend = await withSyllabus(context, "Oct 18, 2099   Read Chapter 5");
    await findReadings(page);
    await expect(rows(page).nth(0)).not.toContainText("Due in the past");
    await rows(page).nth(0).getByLabel(/^Due date for/).fill("2020-01-02");
    await expect(rows(page).nth(0)).toContainText("Due in the past: added as done");
    await page.getByRole("button", { name: "Add 1 reading" }).click();
    await expect.poll(() => backend.posts("readings").length).toBe(1);
    expect(backend.posts("readings")[0]).toMatchObject({ due_date: "2020-01-02", status: "done" });
  });

  test("clearing the date of a past reading makes it an ordinary undone reading", async ({ context, page }) => {
    const backend = await withSyllabus(context, "Mar 5, 2020   Read Chapter 5");
    await findReadings(page);
    await rows(page).nth(0).getByLabel(/^Due date for/).fill("");
    await expect(rows(page).nth(0)).not.toContainText("Due in the past");
    await page.getByRole("button", { name: "Add 1 reading" }).click();
    await expect.poll(() => backend.posts("readings").length).toBe(1);
    expect(backend.posts("readings")[0]).not.toHaveProperty("status");
  });
});
