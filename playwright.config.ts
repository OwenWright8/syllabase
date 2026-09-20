import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    // Deliberately NO API address: like the Docker image, the app calls the
    // origin it was loaded from, and the specs swap the backend behind that
    // origin for an in-memory fake (e2e/support/fakeBackend.ts). Only the
    // anon key is set. (Empty strings also override any VITE_SUPABASE_URL in
    // your shell, so a stray dev setting can't leak into the tests. If you
    // reuse an already-running dev server locally, start it the same way.)
    env: {
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-anon-key",
    },
  },
});
