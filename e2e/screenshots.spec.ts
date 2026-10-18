// Regenerates the screenshots in docs/screenshots/ that the README shows:
//
//     SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
//
// Skipped otherwise (it writes files, and its job is to look good, not to
// check anything). It drives the real UI against the in-memory fake backend
// with a believable student's week, so the pictures always match the app.
import { test, expect, type Page } from "../playwright-fixture";
import { installFakeBackend, USER_ID, type Row } from "./support/fakeBackend";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate the README screenshots");
test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const OUT = "docs/screenshots";
const now = () => new Date().toISOString();
const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(7, "0")}-0000-4000-8000-000000000001`;

const CHEM = id("c", 1);
const BIO = id("c", 2);
const PHYS = id("c", 3);
const HIST = id("c", 4);
const course = (cid: string, name: string, short_code: string, color: string, class_time: string | null): Row => ({
  id: cid, user_id: USER_ID, name, short_code, color, semester: "Fall 2026", class_time, is_archived: false, created_at: now(),
});
const COURSES = [
  course(CHEM, "General Chemistry", "CHE-111", "#3b82f6", "09:00:00"),
  course(BIO, "Cell Biology", "BIO-210", "#10b981", "11:30:00"),
  course(PHYS, "Physics I", "PHY-109", "#f59e0b", "14:00:00"),
  course(HIST, "Modern Europe", "HIS-240", "#ec4899", null),
];

/** Today at hh:mm local time, plus `days`. */
const at = (hours: number, minutes = 0, days = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};
const ymd = (days = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let taskN = 0;
const task = (course_id: string, title: string, type: string, due_at: string, extra: Partial<Row> = {}): Row => ({
  id: id("a", ++taskN), user_id: USER_ID, course_id, exam_id: null, title, description: null, type, due_at, work_date: null,
  estimated_minutes: 60, priority: "medium", status: "not_started", completed_at: null, created_at: now(), ...extra,
});
const TASKS = [
  task(CHEM, "Problem set 6: stoichiometry", "homework", at(23, 59), { priority: "high", estimated_minutes: 90, work_date: ymd(0) }),
  task(BIO, "Lab report: osmosis in potato cells", "lab", at(17, 0), { priority: "high", estimated_minutes: 120, work_date: ymd(0) }),
  task(PHYS, "Online homework, chapter 4", "homework", at(22, 0), { estimated_minutes: 45, status: "done", completed_at: now(), work_date: ymd(0) }),
  task(HIST, "Response paper: the Congress of Vienna", "paper", at(23, 59, 2), { estimated_minutes: 180, work_date: ymd(1) }),
  task(CHEM, "Pre-lab: titration", "lab", at(8, 0, 1), { estimated_minutes: 30, priority: "low" }),
  task(PHYS, "Problem set 5", "homework", at(10, 0, 3)),
  task(BIO, "Read and annotate the membrane transport paper", "homework", at(12, 0, 4), { priority: "low" }),
  task(HIST, "Discussion post: nationalism", "homework", at(20, 0, 1), { estimated_minutes: 30, status: "done", completed_at: now(), work_date: ymd(0) }),
];

const EXAMS: Row[] = [
  { id: id("e", 1), user_id: USER_ID, course_id: CHEM, title: "Midterm 2", exam_at: at(10, 0, 6), chapters: "5–8", topics: "Stoichiometry, gases, thermochemistry", created_at: now() },
  { id: id("e", 2), user_id: USER_ID, course_id: BIO, title: "Unit exam: the cell", exam_at: at(11, 30, 9), chapters: "3–6", topics: null, created_at: now() },
];
const QUIZZES: Row[] = [{ id: id("9", 1), user_id: USER_ID, course_id: PHYS, title: "Quiz 4: Newton's laws", quiz_at: at(14, 0, 2), topics: null, created_at: now() }];

let readingN = 0;
const reading = (course_id: string, title: string, pages: string | null, days: number, status = "not_started"): Row => ({
  id: id("r", ++readingN), user_id: USER_ID, course_id, title, pages, due_date: ymd(days), status, document_id: null, start_page: null, end_page: null, created_at: now(),
});
const READINGS = [
  reading(BIO, "Read Chapter 5: Membrane structure", "Ch. 5", 1),
  reading(CHEM, "Read Chapter 6: Thermochemistry", "Ch. 6", 2),
  reading(HIST, "Hobsbawm, The Age of Revolution, ch. 3", "pp. 44–71", 3, "in_progress"),
];

const BOOK = id("d", 1);
const DOCUMENTS: Row[] = [
  {
    id: BOOK, user_id: USER_ID, course_id: CHEM, kind: "textbook", filename: "Chemistry: The Central Science, 15e.pdf", mime_type: "application/pdf",
    size_bytes: 84 * 1024 * 1024, uploaded_bytes: 84 * 1024 * 1024, status: "ready", progress: 100, error: null, page_count: 1248, page_offset: 28, created_at: now(),
  },
];
const CHAPTER_TITLES = [
  "Introduction: Matter, Energy, and Measurement", "Atoms, Molecules, and Ions", "Chemical Reactions and Stoichiometry", "Reactions in Aqueous Solution",
  "Thermochemistry", "Electronic Structure of Atoms", "Periodic Properties of the Elements", "Basic Concepts of Chemical Bonding",
];
const CHAPTERS: Row[] = CHAPTER_TITLES.map((title, i) => ({
  id: id("b", i + 1), document_id: BOOK, user_id: USER_ID, number: i + 1, title, start_page: 30 + i * 42, end_page: 71 + i * 42, source: "outline",
}));

const DECK = id("f", 1);
const DECKS: Row[] = [
  { id: DECK, user_id: USER_ID, course_id: BIO, exam_id: id("e", 2), quiz_id: null, title: "Cell structure", description: "Unit exam vocabulary", settings: {}, created_at: now(), updated_at: now() },
];
const CARDS: Row[] = [
  ["Mitochondrion", "Organelle where cellular respiration makes ATP"],
  ["Ribosome", "Builds proteins from mRNA"],
  ["Golgi apparatus", "Modifies, sorts and packages proteins"],
  ["Lysosome", "Breaks down waste with digestive enzymes"],
].map(([term, definition], i) => ({
  id: id("k", i + 1), deck_id: DECK, user_id: USER_ID, term, definition, position: i + 1, starred: i === 0, known: false, created_at: now(), updated_at: now(),
}));

async function setup(context: Parameters<typeof installFakeBackend>[0], themePreference: "light" | "dark") {
  await installFakeBackend(context, {
    themePreference, colorTheme: "blue", semesterStart: ymd(-52),
    courses: COURSES, tasks: TASKS, exams: EXAMS, quizzes: QUIZZES, readings: READINGS, documents: DOCUMENTS, chapters: CHAPTERS, decks: DECKS, cards: CARDS,
  });
}

/** Wait for page transitions and the spinner to settle so nothing is caught mid-animation. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  await page.waitForTimeout(700);
}

for (const theme of ["light", "dark"] as const) {
  test(`Today (${theme})`, async ({ context, page }) => {
    await setup(context, theme);
    await page.goto("/");
    await expect(page.getByText("Problem set 6: stoichiometry").first()).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${OUT}/today-${theme}.png` });
  });
}

test("a course's chapters", async ({ context, page }) => {
  await setup(context, "light");
  await page.goto(`/courses/${CHEM}`);
  await page.getByRole("tab", { name: "Chapters" }).click();
  await expect(page.getByRole("button", { name: /Download Ch\. 1/ })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${OUT}/chapters.png` });
});

test("flashcards", async ({ context, page }) => {
  await setup(context, "light");
  await page.goto("/flashcards");
  await page.getByText("Cell structure").first().click();
  await settle(page);
  await page.screenshot({ path: `${OUT}/flashcards.png` });
});

test("exams", async ({ context, page }) => {
  await setup(context, "light");
  await page.goto("/exams");
  await expect(page.getByText("Midterm 2").first()).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${OUT}/exams.png` });
});

test("on a phone", async ({ context, page }) => {
  await setup(context, "light");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Problem set 6: stoichiometry").first()).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${OUT}/mobile.png` });
});
