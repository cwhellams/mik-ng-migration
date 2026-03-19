import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Get target from env or fallback to localhost
//const target = import.meta.env.VITE_API_TARGET || 'http://localhost:3000'

// Set secure to true only if using https
//const isSecure = target.startsWith('https')
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const target = env.VITE_API_TARGET || 'http://localhost:3000'
  const isSecure = target.startsWith('https')

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'mik-logo-blue.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
        ],
        manifest: {
          name: 'MIK NG Intranet',
          short_name: 'MIK NG',
          description: 'MIK NG Intranet Application',
          theme_color: '#002385',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
          // Prevent the SPA navigation fallback from intercepting /t/:code redirect URLs.
          // Must match the full URL (e.g. https://intra.mik.fi/t/2cQ3), not just the path.
          // Deny the SPA navigation fallback (index.html) for /t/:code routes so the
          // browser navigation falls through to the network and reaches the backend.
          // The regex is tested against the full URL, so we match the path segment anywhere.
          navigateFallbackDenylist: [/\/t\/[^/?#]+/],
          runtimeCaching: [
            {
              urlPattern: /^\/api\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24, // 24 hours
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
    ],
    server: {
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: isSecure,
        },
      },
    },
    preview: {
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: isSecure,
        },
      },
    },
    resolve: {
      alias: {
        '@backend': path.resolve(__dirname, '../backend/src'),
      },
    },
    optimizeDeps: {
      include: ['zod'],
    },
  }
})
