import { test, expect } from "../playwright-fixture";

test.describe("/auth", () => {
  test("renders the sign-in form", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("toggles to the sign-up form", async ({ page }) => {
    await page.goto("/auth");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Up" })).toBeVisible();
  });

  test("blocks submission with an invalid email", async ({ page }) => {
    await page.goto("/auth");
    const email = page.getByLabel("Email");
    await email.fill("not-an-email");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Native HTML5 validation should block the submit — we should still be on /auth
    // with the email field reporting invalid, not navigated away.
    await expect(page).toHaveURL(/\/auth$/);
    const isValid = await email.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(isValid).toBe(false);
  });
});
