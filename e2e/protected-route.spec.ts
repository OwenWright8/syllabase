import { test, expect } from "../playwright-fixture";

test.describe("ProtectedRoute", () => {
  test("redirects unauthenticated visitors to /auth", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("redirects an unauthenticated deep link to /auth", async ({ page }) => {
    await page.goto("/courses");
    await expect(page).toHaveURL(/\/auth$/);
  });
});
