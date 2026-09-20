import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Self-hosters point VITE_SUPABASE_URL at their own gateway domain —
  // derive dev-server/PWA-caching config from it instead of hardcoding any
  // one deployment's domain, so this works out of the box for anyone.
  const apiOrigin = (() => {
    try {
      return env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : null;
    } catch {
      return null;
    }
  })();
  const devAllowedHosts = env.VITE_DEV_ALLOWED_HOSTS
    ? env.VITE_DEV_ALLOWED_HOSTS.split(",").map((h) => h.trim()).filter(Boolean)
    : true;

  return {
  server: {
    host: "::",
    port: 8080,
    allowedHosts: devAllowedHosts,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'robots.txt'],
      manifest: {
        name: 'Syllabase',
        short_name: 'Syllabase',
        description: 'Self-hosted study planning tool for managing assignments, exams, and courses efficiently',
        theme_color: '#8b5cf6',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // /env.js is this deployment's runtime config, rewritten from the
        // container's environment on every start (docker/start.sh). The copy
        // in dist/ is only a placeholder, so precaching it would pin
        // whatever config existed at build time and hide later changes
        // (a rotated key) behind the service worker.
        globIgnores: ['env.js'],
        // The API paths share this origin. A page navigation to one of them
        // is not an app route, so don't answer it with index.html.
        navigateFallbackDenylist: [/^\/(auth|rest|functions)\//],
        runtimeCaching: [
          {
            // Always try the network first so config changes apply on the
            // next load, but fall back to the last copy so an installed PWA
            // still boots offline. Must stay ahead of the API rule below.
            urlPattern: ({ url }) => url.pathname === '/env.js',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'runtime-config',
              networkTimeoutSeconds: 3,
            },
          },
          ...(apiOrigin
            ? [
                {
                  // Matches whichever API origin this deployment's own
                  // VITE_SUPABASE_URL points at (self-hosted gateway or
                  // Supabase Cloud) rather than a single hardcoded domain.
                  urlPattern: new RegExp(`^${apiOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/.*`, "i"),
                  handler: 'NetworkFirst' as const,
                  options: {
                    cacheName: 'api-cache',
                    expiration: {
                      maxEntries: 50,
                      maxAgeSeconds: 60 * 60 * 24, // 24 hours
                    },
                  },
                },
              ]
            : []),
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  };
});