import { test, expect } from "../playwright-fixture";
import { test as unit, expect as unitExpect } from "@playwright/test";
import { installFakeBackend, makeTask } from "./support/fakeBackend";
import { errorMessage } from "../src/lib/errors";

// supabase-js returns database errors as plain objects, not Errors. The app used
// to show only "Something went wrong" for those, hiding why a request failed.
test("a failed request shows the server's reason, not just 'Something went wrong'", async ({ context, page }) => {
  const backend = await installFakeBackend(context, { tasks: [makeTask()] });
  backend.failPatches = true; // answers PATCHes with a 500 { message: "boom" }
  await page.goto("/");
  await page.getByRole("button", { name: 'Mark "Seed task" complete' }).click();
  await expect(page.getByText("boom")).toBeVisible();
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
});

unit.describe("errorMessage", () => {
  unit("Errors, plain error objects and strings all give their message", () => {
    unitExpect(errorMessage(new Error("disk full"))).toBe("disk full");
    unitExpect(errorMessage({ message: "permission denied for table readings", code: "42501", details: null, hint: null })).toBe("permission denied for table readings");
    unitExpect(errorMessage("plain text")).toBe("plain text");
  });

  unit("nothing usable falls back to the generic message", () => {
    for (const value of [undefined, null, {}, { message: "" }, { message: 42 }, new Error("")]) {
      unitExpect(errorMessage(value)).toBe("Something went wrong");
    }
  });

  unit("a reverse proxy's HTML error page is described, not dumped", () => {
    const html = "<html><head><title>413 Request Entity Too Large</title></head><body><center><h1>413 Request Entity Too Large</h1></center><hr><center>nginx</center></body></html>";
    unitExpect(errorMessage({ message: html })).toBe(
      "The server answered with an error page (413 Request Entity Too Large) instead of data. If Syllabase is behind a reverse proxy, check its logs and limits."
    );
    unitExpect(errorMessage({ message: "<!DOCTYPE html><html><body>Bad Gateway</body></html>" })).toMatch(/^The server answered with an error page instead of data/);
  });

  unit("very long messages are clipped", () => {
    unitExpect(errorMessage({ message: "x".repeat(1000) })).toHaveLength(301);
  });
});
