import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Prefer runtime config (window.__ENV__, injected by the Docker image's
// entrypoint from container env vars — see docker/frontend-entrypoint.sh)
// over build-time Vite env, so one prebuilt image works for any
// self-hoster's own domain/keys instead of needing a rebuild per
// deployment. Local `npm run dev`/`vite build` still works unchanged via
// the import.meta.env fallback, since there's no injected env.js there.
declare global {
  interface Window {
    __ENV__?: Record<string, string>;
  }
}

const SUPABASE_URL = window.__ENV__?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  window.__ENV__?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});