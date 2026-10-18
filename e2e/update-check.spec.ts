import type { BrowserContext } from "@playwright/test";
import { test, expect } from "../playwright-fixture";
import { installFakeBackend, APP_ORIGIN } from "./support/fakeBackend";
import { compareVersions, isNewer, parseVersion } from "../src/lib/version";

const NOTES = "https://github.com/OwenWright8/syllabase/releases/tag/v0.7.0";

/**
 * Serve what the app container would: /env.js with this image's version, and
 * /update.json with the latest release (or nothing, as when UPDATE_CHECK=off).
 */
async function serveInstance(context: BrowserContext, version: string, latest: Record<string, unknown> | null) {
  await context.route(`${APP_ORIGIN}/env.js`, (route) =>
    route.fulfill({ contentType: "application/javascript", body: `window.__ENV__ = { APP_VERSION: ${JSON.stringify(version)}, APP_REPO: "OwenWright8/syllabase" };` })
  );
  await context.route(`${APP_ORIGIN}/update.json`, (route) =>
    latest ? route.fulfill({ contentType: "application/json", body: JSON.stringify(latest) }) : route.fulfill({ status: 404, body: "" })
  );
}

const release = (tag: string, url = NOTES) => ({ latest: tag, url, name: "", published_at: "2026-10-18T12:00:00Z" });
const banner = (page: import("@playwright/test").Page) => page.getByRole("status", { name: "Update available" });

test.describe("update reminder", () => {
  test("a newer release shows a reminder linking to its release notes", async ({ context, page }) => {
    await installFakeBackend(context);
    await serveInstance(context, "v0.6.0", release("v0.7.0"));
    await page.goto("/");

    await expect(banner(page)).toContainText("Syllabase v0.7.0 is available.");
    await expect(banner(page)).toContainText("You're on v0.6.0.");
    const link = banner(page).getByRole("link", { name: "What's new" });
    await expect(link).toHaveAttribute("href", NOTES);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("dismissing it hides it for that release, and a newer release shows it again", async ({ context, page }) => {
    await installFakeBackend(context);
    await serveInstance(context, "v0.6.0", release("v0.7.0"));
    await page.goto("/");
    await banner(page).getByRole("button", { name: "Dismiss update reminder" }).click();
    await expect(banner(page)).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("link", { name: "Today" }).first()).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    await context.unroute(`${APP_ORIGIN}/update.json`);
    await context.route(`${APP_ORIGIN}/update.json`, (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(release("v0.8.0", NOTES.replace("0.7.0", "0.8.0"))) })
    );
    await page.reload();
    await expect(banner(page)).toContainText("v0.8.0 is available");
  });

  test("no reminder when up to date, when the check is off, or on a dev build", async ({ context, page }) => {
    await installFakeBackend(context);
    await serveInstance(context, "v0.7.0", release("v0.7.0"));
    await page.goto("/profile");
    await expect(page.getByText("Up to date")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    await context.unroute(`${APP_ORIGIN}/env.js`);
    await context.unroute(`${APP_ORIGIN}/update.json`);
    await serveInstance(context, "v0.6.0", null);
    await page.reload();
    await expect(page.getByText("Not checking for updates")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    await context.unroute(`${APP_ORIGIN}/env.js`);
    await context.unroute(`${APP_ORIGIN}/update.json`);
    await serveInstance(context, "dev", release("v0.7.0"));
    await page.reload();
    await expect(page.getByTestId("app-version")).toHaveText("dev");
    await expect(page.getByText("Development build")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("an update.json pointing anywhere but GitHub is ignored", async ({ context, page }) => {
    await installFakeBackend(context);
    await serveInstance(context, "v0.6.0", release("v0.7.0", "https://evil.example/notes"));
    await page.goto("/profile");
    await expect(page.getByText("Not checking for updates")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("Profile → About shows the version, the update and links for it", async ({ context, page }) => {
    await installFakeBackend(context);
    await serveInstance(context, "v0.6.0", release("v0.7.0"));
    await page.goto("/profile");
    const about = page.getByRole("region", { name: "About" });
    await expect(about.getByTestId("app-version")).toHaveText("v0.6.0");
    await expect(about).toContainText("v0.7.0 is available.");
    await expect(about.getByRole("link", { name: "Release notes for this version" })).toHaveAttribute(
      "href",
      "https://github.com/OwenWright8/syllabase/releases/tag/v0.6.0"
    );
    await expect(about.getByRole("link", { name: "Report a problem" })).toHaveAttribute("href", "https://github.com/OwenWright8/syllabase/issues/new/choose");
  });

  test("the dev server's own pages (no update.json) don't confuse it", async ({ context, page }) => {
    await installFakeBackend(context);
    await page.goto("/profile");
    await expect(page.getByTestId("app-version")).toHaveText("dev");
    await expect(banner(page)).toHaveCount(0);
  });
});

test.describe("version ordering", () => {
  const order = (a: string, b: string) => Math.sign(compareVersions(parseVersion(a)!, parseVersion(b)!));

  test("follows semver", () => {
    expect(order("v0.10.0", "v0.9.9")).toBe(1);
    expect(order("1.0.0", "v1.0.0")).toBe(0);
    expect(order("v1.0.0-rc.1", "v1.0.0")).toBe(-1);
    expect(order("v1.0.0-rc.2", "v1.0.0-rc.10")).toBe(-1);
    expect(order("v1.0.0-alpha", "v1.0.0-beta")).toBe(-1);
    expect(order("v1.0.0-1", "v1.0.0-alpha")).toBe(-1);
  });

  test("only a real, newer version counts as an update", () => {
    expect(isNewer("v0.7.0", "v0.6.1")).toBe(true);
    expect(isNewer("v0.6.1", "v0.6.1")).toBe(false);
    expect(isNewer("v0.6.0", "v0.6.1")).toBe(false);
    expect(isNewer("v0.7.0", "dev")).toBe(false);
    expect(isNewer("nonsense", "v0.6.0")).toBe(false);
  });
});
