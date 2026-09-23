import { test, expect, type Page } from "../playwright-fixture";
import { installFakeBackend, makeCourse, makeTask, COURSE_ID, ymdInTz, addDaysYmd } from "./support/fakeBackend";

const OTHER_COURSE_ID = "c0000000-0000-4000-8000-000000000002";
// PostgREST returns a Postgres `time` as HH:MM:SS.
const morningClass = () => makeCourse({ class_time: "10:30:00" });
const noClassTime = () => makeCourse({ id: OTHER_COURSE_ID, name: "Organic Chemistry", short_code: "CHEM 220", class_time: null });

async function openNewAssignment(page: Page) {
  await page.getByRole("button", { name: "Quick add", exact: true }).click();
  await page.getByRole("button", { name: "Add Assignment", exact: true }).click();
  return page.getByRole("dialog");
}

async function pickCourse(page: Page, name: RegExp) {
  await page.getByRole("dialog").getByRole("combobox").first().click();
  await page.getByRole("option", { name }).click();
}

test.describe("class time on the course forms", () => {
  test("a new course can be given a class time", async ({ context, page }) => {
    const backend = await installFakeBackend(context);
    await page.goto("/courses");
    await page.getByRole("button", { name: "New Course" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Course Name").fill("Physics");
    await dialog.getByLabel("Short Code").fill("PHY 109");
    await dialog.getByLabel("Class time").fill("10:30");
    await dialog.getByRole("button", { name: "Create Course" }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(() => backend.posts("courses").length).toBe(1);
    expect(backend.posts("courses")[0].class_time).toBe("10:30");
  });

  test("class time is optional and saved as null when left empty", async ({ context, page }) => {
    const backend = await installFakeBackend(context);
    await page.goto("/courses");
    await page.getByRole("button", { name: "New Course" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Course Name").fill("Physics");
    await dialog.getByLabel("Short Code").fill("PHY 109");
    await dialog.getByRole("button", { name: "Create Course" }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(() => backend.posts("courses").length).toBe(1);
    expect(backend.posts("courses")[0].class_time).toBeNull();
  });

  test("an existing course's class time is shown, and can be changed or cleared", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { courses: [morningClass()] });
    await page.goto("/courses");
    await page.getByRole("button", { name: "Edit General Chemistry" }).click();
    const dialog = page.getByRole("dialog");

    const time = dialog.getByLabel("Class time");
    await expect(time).toHaveValue("10:30");
    await time.fill("13:15");
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => backend.patches("courses").length).toBe(1);
    expect(backend.patches("courses")[0].class_time).toBe("13:15");

    // ...and cleared again
    await page.getByRole("button", { name: "Edit General Chemistry" }).click();
    await dialog.getByLabel("Class time").fill("");
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect.poll(() => backend.patches("courses").length).toBe(2);
    expect(backend.patches("courses")[1].class_time).toBeNull();
  });

  test("the class time is shown on the course card", async ({ context, page }) => {
    await installFakeBackend(context, { courses: [morningClass()] });
    await page.goto("/courses");
    await expect(page.getByText("10:30 AM")).toBeVisible();
  });
});

test.describe("a new assignment's due time follows the class time", () => {
  test.beforeEach(async ({ context, page }) => {
    await installFakeBackend(context, { courses: [morningClass(), noClassTime()] });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Today");
  });

  test("defaults to 23:59 until a course with a class time is chosen", async ({ page }) => {
    const dialog = await openNewAssignment(page);
    await expect(dialog.getByLabel("Due Time")).toHaveValue("23:59");
  });

  test("choosing a course with a class time sets the due time to it", async ({ page }) => {
    const dialog = await openNewAssignment(page);
    await pickCourse(page, /CHEM 111/);
    await expect(dialog.getByLabel("Due Time")).toHaveValue("10:30");
  });

  test("choosing a course without one keeps the normal default", async ({ page }) => {
    const dialog = await openNewAssignment(page);
    await pickCourse(page, /CHEM 220/);
    await expect(dialog.getByLabel("Due Time")).toHaveValue("23:59");
  });

  test("switching from a class-time course to one without goes back to the default", async ({ page }) => {
    const dialog = await openNewAssignment(page);
    await pickCourse(page, /CHEM 111/);
    await expect(dialog.getByLabel("Due Time")).toHaveValue("10:30");
    await pickCourse(page, /CHEM 220/);
    await expect(dialog.getByLabel("Due Time")).toHaveValue("23:59");
  });

  test("a time typed by hand is never overridden, whichever comes first", async ({ page }) => {
    // time edited, THEN course chosen
    let dialog = await openNewAssignment(page);
    await dialog.getByLabel("Due Time").fill("14:00");
    await pickCourse(page, /CHEM 111/);
    await expect(dialog.getByLabel("Due Time")).toHaveValue("14:00");

    // course chosen, THEN time edited, THEN another course chosen
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    dialog = await openNewAssignment(page);
    await pickCourse(page, /CHEM 111/);
    await dialog.getByLabel("Due Time").fill("16:45");
    await pickCourse(page, /CHEM 220/);
    await expect(dialog.getByLabel("Due Time")).toHaveValue("16:45");
  });

  test("a fresh form starts clean, not with the previous form's time", async ({ page }) => {
    let dialog = await openNewAssignment(page);
    await pickCourse(page, /CHEM 111/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    dialog = await openNewAssignment(page);
    await expect(dialog.getByLabel("Due Time")).toHaveValue("23:59");
    await pickCourse(page, /CHEM 111/);
    await expect(dialog.getByLabel("Due Time")).toHaveValue("10:30");
  });
});

// The saved due time is the class time on the wall clock of the PROFILE
// timezone, whatever timezone the browser is in.
const zones: [profile: string, browser: string][] = [
  ["America/New_York", "America/New_York"],
  ["America/New_York", "UTC"],
  ["Asia/Tokyo", "America/Los_Angeles"],
  ["Pacific/Auckland", "Europe/Berlin"],
];
for (const [profileTz, browserTz] of zones) {
  test.describe(`saved due time (profile ${profileTz}, browser ${browserTz})`, () => {
    test.use({ timezoneId: browserTz });

    test("is the class time in the profile's timezone", async ({ context, page }) => {
      const backend = await installFakeBackend(context, { timezone: profileTz, courses: [morningClass()] });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Today");

      const dialog = await openNewAssignment(page);
      await dialog.getByLabel(/^Title/).fill("Lab report");
      await pickCourse(page, /CHEM 111/);
      await dialog.getByRole("button", { name: "Add Assignment" }).click();
      await expect(dialog).toBeHidden();

      await expect.poll(() => backend.posts("tasks").length).toBe(1);
      const dueAt = new Date(backend.posts("tasks")[0].due_at as string);
      const wallClock = new Intl.DateTimeFormat("en-GB", { timeZone: profileTz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(dueAt);
      expect(wallClock).toBe("10:30");
      expect(ymdInTz(dueAt, profileTz)).toBe(addDaysYmd(ymdInTz(new Date(), profileTz), 1));
    });
  });
}

test.describe("editing an existing assignment", () => {
  test("changing its course does not rewrite its due time", async ({ context, page }) => {
    const task = makeTask({ course_id: COURSE_ID, due_at: new Date(Date.now() + 26 * 3600e3).toISOString(), work_date: ymdInTz(new Date(), "America/New_York") });
    const backend = await installFakeBackend(context, { courses: [morningClass(), noClassTime()], tasks: [task] });
    await page.goto("/assignments");
    await page.getByRole("button", { name: `Edit "Seed task"` }).click();
    const dialog = page.getByRole("dialog");

    const before = await dialog.getByLabel("Due Time").inputValue();
    await pickCourse(page, /CHEM 220/);
    await pickCourse(page, /CHEM 111/);
    await expect(dialog.getByLabel("Due Time")).toHaveValue(before);

    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect.poll(() => backend.patches("tasks").length).toBe(1);
    expect(new Date(backend.patches("tasks")[0].due_at as string).getTime()).toBe(new Date(task.due_at as string).getTime() - (new Date(task.due_at as string).getTime() % 60000));
  });
});
