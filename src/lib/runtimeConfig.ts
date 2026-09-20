// Single source of truth for deployment-specific config.
//
// The API address is, by default, the address the page was loaded from: in the
// Docker image the auth, REST and functions endpoints are served by the same
// gateway as the app (/auth/v1, /rest/v1, /functions/v1), so there is nothing
// to configure and it works whether you open it by IP and port, by a domain,
// or by several at once. An explicit value still wins, in this order:
//   1. runtime config (window.__ENV__, written into /env.js by the app
//      container's start.sh) — lets one prebuilt image be pointed elsewhere,
//   2. Vite's build-time env (VITE_SUPABASE_URL) — for `npm run dev` against a
//      separate backend,
//   3. window.location.origin.
//
// Read these constants instead of import.meta.env.VITE_* anywhere else in the
// app: in the Docker image the build-time value is empty, so a direct read
// would silently produce "undefined/functions/v1/..." URLs.
declare global {
  interface Window {
    __ENV__?: Record<string, string>;
  }
}

export const SUPABASE_URL: string =
  window.__ENV__?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || window.location.origin;

export const SUPABASE_PUBLISHABLE_KEY: string =
  window.__ENV__?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
