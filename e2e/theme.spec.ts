import { test, expect } from "../playwright-fixture";
import { installFakeBackend } from "./support/fakeBackend";
import { colorThemes } from "../src/lib/colorThemes";

// (Playwright serialises the function into the page, so pass `name` as an argument, not a closure.)
const rootStyle = (page: import("@playwright/test").Page, name: string) =>
  page.evaluate((n) => document.documentElement.style.getPropertyValue(n).trim(), name);

test.describe("saved theme preferences", () => {
  test("a saved dark preference is applied", async ({ context, page }) => {
    await installFakeBackend(context, { themePreference: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });

  test("a saved accent colour is applied", async ({ context, page }) => {
    await installFakeBackend(context, { themePreference: "light", colorTheme: "blue" });
    await page.goto("/");
    await expect.poll(() => rootStyle(page, "--primary")).toBe(colorThemes.blue.colors.light.primary);
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  });

  // Toggling the theme in the header is a local choice. It used to be undone
  // whenever the auth library announced a session again (which it does when
  // the tab regains focus), because the theme code re-read the saved
  // preference on every auth event.
  test("a theme toggled in the header survives the tab regaining focus", async ({ context, page }) => {
    await installFakeBackend(context, { themePreference: "light" });
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    await page.evaluate(() => {
      const setVisibility = (state: string) => Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
      setVisibility("hidden");
      // Must bubble: the auth library listens on `window`.
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    });
    await page.waitForTimeout(1000); // give any auth-event handler time to (wrongly) undo it

    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });
});

// The theme code, the timezone hook and every page fetched the user's profile
// separately, and the theme code also asked the auth server who the user was
// on each mount. They now share one cached query and the user already in
// memory, so a cold load needs a single profile request and no /auth/v1/user.
test("loading Today reads the profile once and doesn't call /auth/v1/user", async ({ context, page }) => {
  const backend = await installFakeBackend(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Today");
  await page.waitForTimeout(1000); // let everything that's going to fetch, fetch

  expect(backend.count("profiles")).toBe(1);
  expect(backend.authUserRequests).toBe(0);
});

test("moving between pages reuses the cached profile", async ({ context, page }) => {
  const backend = await installFakeBackend(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Today");

  await page.getByRole("link", { name: "Assignments" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Assignments");
  await page.getByRole("link", { name: "Today" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Today");
  await page.waitForTimeout(500);

  expect(backend.count("profiles")).toBe(1);
});
