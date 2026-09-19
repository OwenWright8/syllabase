// Default/local-dev placeholder — the Docker image's entrypoint
// (docker/40-inject-env.sh) overwrites this file with real values
// from the container's environment at startup. Left empty here so
// window.__ENV__ is always at least defined, and the app falls back to
// Vite's build-time env (see src/integrations/supabase/client.ts).
window.__ENV__ = {};
