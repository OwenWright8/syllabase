import { test, expect } from "../playwright-fixture";
import { installFakeBackend } from "./support/fakeBackend";

// Today used to lock in New York's calendar date on first render (the
// timezone hook started from a hard-coded default and only swapped in the
// profile's timezone after a fetch). For anyone whose date differs from New
// York's the page opened on the wrong day, labelled by weekday instead of
// "Today".
//
// Kiritimati is UTC+14 and Pago Pago is UTC-11: whatever the time, at least
// one of them is on a different calendar date to New York, so these can't
// pass by coincidence of when they run.
for (const timezone of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Tokyo", "America/Los_Angeles"]) {
  test(`opens on the current day in the profile's timezone (${timezone})`, async ({ context, page }) => {
    await installFakeBackend(context, { timezone });
    await page.goto("/");

    const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "long", day: "numeric" }).format(new Date());
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("Today");
    await expect(heading).toContainText(dateLabel);
  });
}
