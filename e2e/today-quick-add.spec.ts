import { test, expect, type Page } from "../playwright-fixture";
import { installFakeBackend, makeCourse, addDaysYmd, ymdInTz } from "./support/fakeBackend";

async function openForm(page: Page, label: string) {
  await page.getByRole("button", { name: "Quick add", exact: true }).click();
  await page.getByRole("button", { name: `Add ${label}`, exact: true }).click();
}

const onToday = (page: Page) => new URL(page.url()).pathname === "/";

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
