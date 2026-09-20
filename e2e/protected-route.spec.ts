import { test, expect } from "../playwright-fixture";
import { installFakeBackend } from "./support/fakeBackend";

test.describe("ProtectedRoute", () => {
  test.beforeEach(async ({ context }) => {
    await installFakeBackend(context, { signedIn: false });
  });

  test("redirects unauthenticated visitors to /auth", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("redirects an unauthenticated deep link to /auth", async ({ page }) => {
    await page.goto("/courses");
    await expect(page).toHaveURL(/\/auth$/);
  });
});
