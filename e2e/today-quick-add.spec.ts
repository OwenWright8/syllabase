import { test, expect, type Page } from "../playwright-fixture";
import { installFakeBackend, makeCourse, addDaysYmd, daysBetweenYmd, weekdayInTz, ymdInTz } from "./support/fakeBackend";

async function openForm(page: Page, label: string) {
  await page.getByRole("button", { name: "Quick add", exact: true }).click();
  await page.getByRole("button", { name: `Add ${label}`, exact: true }).click();
}

const onToday = (page: Page) => new URL(page.url()).pathname === "/";

/** Page the week strip to `targetYmd`'s week and pick that day. */
async function selectDay(page: Page, timeZone: string, targetYmd: string) {
  const weekStart = addDaysYmd(ymdInTz(new Date(), timeZone), -weekdayInTz(new Date(), timeZone));
  const weeks = Math.floor(daysBetweenYmd(weekStart, targetYmd) / 7);
  const nav = page.getByRole("button", { name: weeks > 0 ? "Next week" : "Previous week", exact: true });
  for (let i = 0; i < Math.abs(weeks); i++) await nav.click();
  // Each day button reads like "Su27": weekday letters, then the day of the month.
  await page.getByRole("button", { name: new RegExp(`\\D${Number(targetYmd.slice(8))}$`) }).click();
}

test.describe("Today: quick add", () => {
  test.beforeEach(async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()] });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Today");
  });

  const forms: [label: string, heading: string][] = [
    ["Assignment", "Add Assignment"],
    ["Reading", "Add Reading"],
    ["Study Item", "Add Study Item"],
    ["Exam", "Add Exam"],
    ["Quiz", "Add Quiz"],
    ["Course", "Create New Course"],
  ];

  for (const [label, heading] of forms) {
    test(`${label} opens its form in place, without leaving Today`, async ({ page }) => {
      await openForm(page, label);
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: heading })).toBeVisible();
      expect(onToday(page)).toBe(true);

      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(dialog).toBeHidden();
      expect(onToday(page)).toBe(true);
    });
  }

  test("the menu entries are buttons that open forms, not links to other pages", async ({ page }) => {
    await page.getByRole("button", { name: "Quick add", exact: true }).click();
    await expect(page.locator('button[aria-label^="Add "]')).toHaveCount(forms.length);
    await expect(page.locator('a[aria-label^="Add "]')).toHaveCount(0);
  });

  test("a new assignment shows up on Today straight away", async ({ page }) => {
    await openForm(page, "Assignment");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Title/).fill("Problem Set 4");
    await dialog.getByRole("button", { name: "Add Assignment" }).click();
    await expect(dialog).toBeHidden();

    // Planned for today, so it shows in "Your Plan" (and also in "Coming Up", as it is due tomorrow).
    await expect(page.getByText("Problem Set 4").first()).toBeVisible();
    expect(onToday(page)).toBe(true);
  });

  test("a new exam appears in the countdown without a reload", async ({ page }) => {
    await openForm(page, "Exam");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /CHEM 111/ }).click();
    await dialog.getByLabel(/Title/).fill("Midterm");
    await dialog.locator('input[type="date"]').fill(addDaysYmd(ymdInTz(new Date(), "America/New_York"), 5));
    await dialog.getByRole("button", { name: "Add Exam" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText("Midterm")).toBeVisible();
  });

  test("a new quiz appears in the countdown without a reload", async ({ page }) => {
    await openForm(page, "Quiz");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /CHEM 111/ }).click();
    await dialog.getByLabel(/Title/).fill("Pop quiz");
    await dialog.locator('input[type="date"]').fill(addDaysYmd(ymdInTz(new Date(), "America/New_York"), 3));
    await dialog.getByRole("button", { name: "Add Quiz" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText("Pop quiz")).toBeVisible();
  });

  test("a new course is created without leaving Today", async ({ page }) => {
    await openForm(page, "Course");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Course Name").fill("Organic Chemistry");
    await dialog.getByLabel("Short Code").fill("CHEM 220");
    await dialog.getByRole("button", { name: "Create Course" }).click();
    await expect(dialog).toBeHidden();
    expect(onToday(page)).toBe(true);
  });
});

// A new assignment defaults to due tomorrow, planned for today. That was wrong
// for anyone behind UTC: bare "yyyy-MM-dd" strings were parsed as UTC, so the
// date slipped back a day. The browser's timezone must not matter — only the
// profile's does.
const zones: [profile: string, browser: string][] = [
  ["America/New_York", "America/Los_Angeles"],
  ["America/New_York", "UTC"],
  ["Asia/Tokyo", "America/Los_Angeles"],
  ["America/Los_Angeles", "Asia/Tokyo"],
  ["Pacific/Auckland", "America/New_York"],
];

for (const [profileTz, browserTz] of zones) {
  test.describe(`New assignment defaults (profile ${profileTz}, browser ${browserTz})`, () => {
    test.use({ timezoneId: browserTz });

    test("is due tomorrow and planned for today", async ({ page, context }) => {
      const backend = await installFakeBackend(context, { timezone: profileTz });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Today");

      const today = ymdInTz(new Date(), profileTz);
      await openForm(page, "Assignment");
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(/^Title/).fill("Defaults check");
      await dialog.getByRole("button", { name: "Add Assignment" }).click();
      await expect(dialog).toBeHidden();

      await expect.poll(() => backend.posts("tasks").length).toBe(1);
      const [task] = backend.posts("tasks");
      expect(ymdInTz(new Date(task.due_at as string), profileTz)).toBe(addDaysYmd(today, 1));
      expect(task.work_date).toBe(today);
    });
  });
}

// Adding from a day you've navigated to should plan for that day, not always
// for today. The assignment form's defaults are relative to the day you're on
// (due the day after, planned for it); exams and quizzes pre-fill their date.
// Today itself, and past days, keep the ordinary defaults.
test.describe("Today: quick add follows the selected day", () => {
  const tz = "America/New_York";
  const today = ymdInTz(new Date(), tz);

  test.beforeEach(async ({ context, page }) => {
    await installFakeBackend(context, { timezone: tz, courses: [makeCourse()] });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Today");
  });

  test("a future day pre-fills the assignment, exam and quiz forms", async ({ page }) => {
    const target = addDaysYmd(today, 9);
    await selectDay(page, tz, target);
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Today");

    const dialog = page.getByRole("dialog");
    await openForm(page, "Assignment");
    await expect(dialog.getByLabel(/Due Date/)).toHaveValue(addDaysYmd(target, 1));
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    for (const label of ["Exam", "Quiz"]) {
      await openForm(page, label);
      await expect(dialog.locator('input[type="date"]')).toHaveValue(target);
      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(dialog).toBeHidden();
    }
  });

  test("an assignment added from a future day is planned for that day", async ({ page }) => {
    const target = addDaysYmd(today, 9);
    await selectDay(page, tz, target);
    await openForm(page, "Assignment");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Title/).fill("Future work");
    await dialog.getByRole("button", { name: "Add Assignment" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Future work").first()).toBeVisible();
  });

  test("today keeps the ordinary defaults", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await openForm(page, "Assignment");
    await expect(dialog.getByLabel(/Due Date/)).toHaveValue(addDaysYmd(today, 1));
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    await openForm(page, "Exam");
    await expect(dialog.locator('input[type="date"]')).toHaveValue("");
  });

  test("a past day doesn't pre-fill dates in the past", async ({ page }) => {
    const yesterday = addDaysYmd(today, -1);
    await selectDay(page, tz, yesterday);

    const dialog = page.getByRole("dialog");
    await openForm(page, "Assignment");
    // Due tomorrow (relative to today), not the day after yesterday — which would already be due.
    await expect(dialog.getByLabel(/Due Date/)).toHaveValue(addDaysYmd(today, 1));
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    await openForm(page, "Exam");
    await expect(dialog.locator('input[type="date"]')).toHaveValue("");
  });
});
