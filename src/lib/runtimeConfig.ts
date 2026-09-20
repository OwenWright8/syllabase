// Single source of truth for deployment-specific config. Prefers runtime
// config (window.__ENV__, written into /env.js by the app container's
// start.sh from its environment variables) over Vite's build-time env, so
// one prebuilt Docker image works for any self-hoster's own domain/keys
// without a rebuild. Plain `npm run dev` / `vite build` have no injected
// env.js, so they fall back to import.meta.env.
//
// Read these constants instead of import.meta.env.VITE_* anywhere else in
// the app: in the Docker image the build-time value is empty, so any
// direct read silently produces "undefined/functions/v1/..." URLs.
declare global {
  interface Window {
    __ENV__?: Record<string, string>;
  }
}

export const SUPABASE_URL: string =
  window.__ENV__?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;

export const SUPABASE_PUBLISHABLE_KEY: string =
  window.__ENV__?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
