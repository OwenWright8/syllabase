import { test, expect } from "../playwright-fixture";
import { installFakeBackend } from "./support/fakeBackend";

// Sign-in is by username (there is no email field) — see src/pages/Auth.tsx.
// The Auth page asks the instance-status function whether any account exists
// yet, so these run against the fake backend, signed out.
test.describe("/auth", () => {
  test.beforeEach(async ({ context }) => {
    await installFakeBackend(context, { signedIn: false, hasAccounts: true });
  });

  test("renders the sign-in form", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("toggles to the sign-up form", async ({ page }) => {
    await page.goto("/auth");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Up" })).toBeVisible();
  });

  test("blocks submission when the username is empty", async ({ page }) => {
    await page.goto("/auth");
    const username = page.getByLabel("Username");
    await expect(username).toBeVisible();
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Native HTML5 `required` validation should block the submit — we should
    // still be on /auth with the username field reporting invalid, not
    // navigated away.
    await expect(page).toHaveURL(/\/auth$/);
    const isValid = await username.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(isValid).toBe(false);
  });

  test("a brand-new instance offers to create the first account", async ({ context, page }) => {
    await installFakeBackend(context, { signedIn: false, hasAccounts: false });
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "Welcome to Syllabase" })).toBeVisible();
  });
});
