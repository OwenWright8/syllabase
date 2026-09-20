import { test, expect } from "../playwright-fixture";

// These run against `npm run dev` and need a reachable backend configured
// via VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (e.g. a local
// `docker compose up`), since the Auth page asks the instance-status
// function whether any account exists yet. Sign-in is by username (there is
// no email field) — see src/pages/Auth.tsx.
test.describe("/auth", () => {
  test("renders the sign-in form", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("toggles to the sign-up form", async ({ page }) => {
    await page.goto("/auth");
    await page.getByRole("button", { name: "Sign up" }).click({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Up" })).toBeVisible();
  });

  test("blocks submission when the username is empty", async ({ page }) => {
    await page.goto("/auth");
    const username = page.getByLabel("Username");
    await username.waitFor({ timeout: 15_000 });
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Native HTML5 `required` validation should block the submit — we should
    // still be on /auth with the username field reporting invalid, not
    // navigated away.
    await expect(page).toHaveURL(/\/auth$/);
    const isValid = await username.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(isValid).toBe(false);
  });
});
