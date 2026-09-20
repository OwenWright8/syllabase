import { test, expect } from "../playwright-fixture";
import { installFakeBackend, makeTask } from "./support/fakeBackend";

// Completing a task used to store nowInTimezone(tz).toISOString(), a Date whose
// local fields are shifted to the profile timezone, so the saved time was off
// by the gap between the browser's and the profile's timezones (4h for a UTC
// browser and a New York profile). It only looked right when they matched.
for (const browserTz of ["America/New_York", "UTC", "Europe/Berlin", "Asia/Tokyo"]) {
  test.describe(`completing a task (browser ${browserTz}, profile America/New_York)`, () => {
    test.use({ timezoneId: browserTz });

    test("stores the real completion time", async ({ context, page }) => {
      const backend = await installFakeBackend(context, { timezone: "America/New_York", tasks: [makeTask()] });
      await page.goto("/");
      await page.getByRole("button", { name: 'Mark "Seed task" complete' }).click();

      await expect.poll(() => backend.patches("tasks").length).toBeGreaterThan(0);
      const done = backend.patches("tasks").find((p) => p.status === "done");
      const skewMs = Math.abs(new Date(done?.completed_at as string).getTime() - Date.now());
      expect(skewMs).toBeLessThan(2 * 60_000);
    });
  });
}

// The list used to wait for the server's answer (and a refetch) before the
// task disappeared, so ticking something off felt laggy. It now updates
// immediately and rolls back if the server refuses.
test.describe("completing a task feels instant", () => {
  test("the task leaves the list before the server has answered", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { tasks: [makeTask()] });
    backend.patchDelayMs = 4000;
    await page.goto("/");
    await page.getByRole("button", { name: 'Mark "Seed task" complete' }).click();

    // Well inside the held-back response (only the ~0.4s exit animation is allowed).
    await expect(page.getByText("Seed task")).toBeHidden({ timeout: 2000 });
    // The row goes the moment the change is made; the request follows a beat later.
    await expect.poll(() => backend.patches("tasks").length).toBe(1);
    expect(backend.db.tasks[0].status).toBe("not_started"); // ...and the server hasn't applied it yet
  });

  test("the Assignments page updates immediately too", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { tasks: [makeTask()] });
    backend.patchDelayMs = 4000;
    await page.goto("/assignments");
    await page.getByRole("button", { name: 'Mark "Seed task" complete' }).click();

    await expect(page.getByText("Seed task")).toBeHidden({ timeout: 2000 });
    expect(backend.db.tasks[0].status).toBe("not_started");
  });

  test("if the server refuses, the task comes back and the error is shown", async ({ context, page }) => {
    const backend = await installFakeBackend(context, { tasks: [makeTask()] });
    backend.failPatches = true;
    await page.goto("/");
    await page.getByRole("button", { name: 'Mark "Seed task" complete' }).click();

    // The app shows a generic message rather than the database's own error text.
    await expect(page.getByText("Something went wrong")).toBeVisible();
    await expect(page.getByText("Seed task")).toBeVisible();
    await expect(page.getByRole("button", { name: 'Mark "Seed task" complete' })).toBeEnabled();
    expect(backend.db.tasks[0].status).toBe("not_started");
  });
});
