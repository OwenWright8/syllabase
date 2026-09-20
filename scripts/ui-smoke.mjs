// Browser smoke test against a running stack (see the `docker` job in
// .github/workflows/ci.yml). Drives the real UI — username sign-in, the
// Profile page's Homepage-widget URL, and Delete Account — because those
// paths depend on the runtime config (env.js) injected by the app
// container, which unit-level checks and plain curl calls can't exercise.
// An earlier regression made both the widget URL and Delete Account build
// "undefined/functions/v1/..." because they read the build-time env
// instead of the runtime config.
//
// Expects the account created by the earlier CI signup step.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const USER = process.env.SMOKE_USER ?? "ci-user";
const PASS = process.env.SMOKE_PASS ?? "ci-test-password-123";

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console.error:", m.text().slice(0, 200)));
page.on("requestfailed", (r) => console.log("requestfailed:", r.method(), r.url(), r.failure()?.errorText));
page.on("response", (r) => r.status() >= 400 && console.log("http", r.status(), r.request().method(), r.url()));

async function fail(message) {
  console.error(`FAIL: ${message}`);
  console.error("--- page text ---");
  console.error((await page.textContent("body").catch(() => "")).slice(0, 1500));
  await browser.close();
  process.exit(1);
}

console.log("1. sign in with the username form");
await page.goto(`${BASE}/auth`);
await page.locator("#username").waitFor({ timeout: 20000 }).catch(() => fail("sign-in form never rendered on /auth"));
await page.locator("#username").fill(USER);
await page.locator("#password").fill(PASS);
await page.getByRole("button", { name: "Sign In" }).click();
await page.waitForURL(`${BASE}/`, { timeout: 20000 }).catch(() => fail("sign-in did not reach the Today page"));

console.log("2. Generating a widget key shows a real URL in the snippet, not 'undefined/...'");
await page.goto(`${BASE}/profile`);
await page.getByRole("button", { name: "Generate Key" }).click({ timeout: 20000 }).catch(() => fail("Profile page / 'Generate Key' button never appeared"));
// The snippet lives in a collapsed <details>, so read it from the DOM rather than waiting for visibility.
await page.locator("details pre").waitFor({ state: "attached", timeout: 20000 }).catch(() => fail("widget snippet never rendered after generating a key"));
const snippet = await page.locator("details pre").textContent();
if (snippet.includes("undefined/functions")) await fail("widget URL contains 'undefined/functions'");
if (!snippet.includes(`url: ${BASE}/functions/v1/widget-stats`)) await fail(`widget URL is not ${BASE}/functions/v1/widget-stats`);

console.log("3. Delete Account calls the right URL and succeeds");
const deleteResponse = page.waitForResponse((r) => r.url().includes("delete-user"), { timeout: 20000 });
await page.getByRole("button", { name: "Delete My Account" }).click();
await page.getByRole("button", { name: "Delete Account", exact: true }).click();
const res = await deleteResponse.catch(() => fail("no request to delete-user was made"));
console.log(`   delete-user -> HTTP ${res.status()} ${res.url()}`);
// Exact match on purpose: the broken build requested /undefined/functions/v1/delete-user,
// which also *contains* "/functions/v1/delete-user".
if (res.url() !== `${BASE}/functions/v1/delete-user`) await fail(`wrong delete-user URL: ${res.url()}`);
if (res.status() !== 200) await fail(`delete-user returned ${res.status()}`);
await page.waitForURL(/\/auth/, { timeout: 15000 }).catch(() => fail("was not sent back to /auth after deleting the account"));

await browser.close();
console.log("UI smoke test passed");
