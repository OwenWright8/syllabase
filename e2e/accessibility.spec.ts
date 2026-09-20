import { test, expect, type Page } from "../playwright-fixture";
import { installFakeBackend, makeCourse, makeTask } from "./support/fakeBackend";

test("the page can be pinch-zoomed", async ({ context, page }) => {
  await installFakeBackend(context, { signedIn: false });
  await page.goto("/auth");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
  expect(viewport).not.toMatch(/maximum-scale/i);
});

test("text fields are 16px on mobile, so iOS doesn't zoom in on focus", async ({ context, page }) => {
  await installFakeBackend(context, { courses: [makeCourse()] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick add", exact: true }).click();
  await page.getByRole("button", { name: "Add Assignment", exact: true }).click();

  const dialog = page.getByRole("dialog");
  const sizes = await dialog.locator("input:not([type=hidden]), textarea").evaluateAll((els) =>
    els.map((el) => Math.round(parseFloat(getComputedStyle(el).fontSize)))
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
});

// Buttons that show only an icon need an accessible name, or a screen reader
// announces just "button". (Visible text, aria-label, title and the visually
// hidden text of a sr-only span all count.)
async function unnamedButtons(page: Page): Promise<string[]> {
  return page.locator("button").evaluateAll((buttons) =>
    buttons
      .filter((b) => {
        const named = (b.textContent ?? "").trim() || b.getAttribute("aria-label") || b.getAttribute("title") || b.getAttribute("aria-labelledby");
        return !named;
      })
      .map((b) => b.outerHTML.slice(0, 120))
  );
}

for (const path of ["/", "/courses", "/assignments"]) {
  test(`every button on ${path} has an accessible name`, async ({ context, page }) => {
    await installFakeBackend(context, { courses: [makeCourse()], tasks: [makeTask({ course_id: makeCourse().id })] });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Let lists render (cards carry most of the icon-only buttons).
    await page.waitForTimeout(500);
    expect(await unnamedButtons(page)).toEqual([]);
  });
}
