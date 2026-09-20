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
