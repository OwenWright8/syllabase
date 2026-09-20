// Re-exports from @playwright/test so specs import from one place. The
// backend the specs run against is the in-memory fake in e2e/support/
// fakeBackend.ts (installed per test with installFakeBackend).
export { test, expect } from "@playwright/test";
export type { Page } from "@playwright/test";
