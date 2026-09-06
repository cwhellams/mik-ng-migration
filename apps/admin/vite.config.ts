import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_TARGET || 'http://localhost:3000'
  const isSecure = target.startsWith('https')

  return {
    plugins: [react()],
    // Where this bundle is mounted, which differs by deployment topology:
    //
    //   DigitalOcean  '/'        — its own subdomain (twr.mik.fi / beta-twr.mik.fi,
    //                              see .do/mik-intranet-{prod,test}.yaml)
    //   Cloudflare    '/admin/'  — a path on the tenant's single hostname, so the
    //                              auth cookie can be host-only and there is no CORS
    //
    // Both topologies are live during the migration, so this is configuration
    // rather than a constant. `App.tsx` feeds `import.meta.env.BASE_URL` to the
    // router's basename, so the two stay in step from this one value.
    base: env.VITE_BASE_PATH || '/',
    server: {
      port: 5174,
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
    optimizeDeps: {
      include: ['zod'],
    },
  }
})
