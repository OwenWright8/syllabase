import { test, expect } from "../playwright-fixture";
import { installFakeBackend } from "./support/fakeBackend";

const dateLabel = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, month: "long", day: "numeric" }).format(new Date());

// The profile's timezone is cached app-wide for a few minutes, so saving a new
// one on the Profile page has to invalidate that cache — otherwise Today would
// carry on using the old timezone until the cache expired.
//
// Kiritimati (UTC+14) and Honolulu (UTC-10) are exactly 24 hours apart, so
// their calendar dates always differ, whatever time this runs.
test("a timezone saved on the Profile page applies to Today straight away", async ({ context, page }) => {
  await installFakeBackend(context, { timezone: "Pacific/Kiritimati" });
  await page.goto("/");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toContainText("Today");
  await expect(heading).toContainText(dateLabel("Pacific/Kiritimati"));

  await page.getByRole("link", { name: "Profile" }).first().click();
  await page.getByText("Timezone", { exact: true }).locator("..").getByRole("combobox").click();
  await page.getByRole("option", { name: "Hawaii Time (HST)" }).click();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Profile updated successfully")).toBeVisible();

  await page.getByRole("link", { name: "Today" }).first().click();
  await expect(heading).toContainText("Today");
  await expect(heading).toContainText(dateLabel("Pacific/Honolulu"));
});
