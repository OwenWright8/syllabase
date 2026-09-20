import { defineConfig } from "@playwright/test";
import { API_URL } from "./e2e/support/fakeBackend";

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
    // The specs swap the backend for an in-memory fake (e2e/support/
    // fakeBackend.ts) by intercepting requests to this address, so the app
    // just needs to be pointed at it. If you reuse an already-running dev
    // server locally, start it with these same variables.
    env: {
      VITE_SUPABASE_URL: API_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-anon-key",
    },
  },
});
