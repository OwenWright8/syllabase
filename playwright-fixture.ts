// Re-export directly from @playwright/test. No custom auth/session fixture
// exists yet — there's no test Supabase project to authenticate against
// (see e2e/README or CI workflow notes), so tests are limited to
// unauthenticated pages for now.
export { test, expect } from "@playwright/test";
