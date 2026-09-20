// Default/local-dev placeholder — the Docker image's start script
// (docker/start.sh) overwrites this file with real values from the
// container's environment on every start. Left empty here so
// window.__ENV__ is always at least defined, and the app falls back to
// Vite's build-time env (see src/integrations/supabase/client.ts).
window.__ENV__ = {};
