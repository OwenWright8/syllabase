import { test, expect } from "../playwright-fixture";
import { installFakeBackend } from "./support/fakeBackend";

// There is no API address to configure: the app talks to whatever address it
// was loaded from. That is what lets someone open it by IP and port, by a
// domain, or several at once, without a SITE_URL. Each origin below is served
// by the same dev server and has its own fake backend, so the app only works
// if it really uses the origin it was loaded from.
for (const origin of ["http://localhost:8080", "http://127.0.0.1:8080"]) {
  test.describe(`loaded from ${origin}`, () => {
    test.use({ baseURL: origin });

    test("the app signs in and loads data from that same origin", async ({ context, page }) => {
      const backend = await installFakeBackend(context, { origin });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Today");
      expect(backend.count("profiles")).toBeGreaterThan(0);
      expect(backend.count("tasks")).toBeGreaterThan(0);
    });

    test("the Homepage widget URL shows the address being browsed", async ({ context, page }) => {
      await installFakeBackend(context, { origin });
      await page.goto("/profile");
      await page.getByRole("button", { name: "Generate Key" }).click();
      await expect(page.locator("details pre")).toContainText(`url: ${origin}/functions/v1/widget-stats`);
    });
  });
}
