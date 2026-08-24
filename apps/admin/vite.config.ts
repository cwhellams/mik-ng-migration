import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_TARGET || 'http://localhost:3000'
  const isSecure = target.startsWith('https')

  return {
    plugins: [react()],
    // The admin app is served from its own subdomain (twr.mik.fi / beta-twr.mik.fi
    // in production/beta — see .do/mik-intranet-{prod,test}.yaml), so it is
    // always at the root of whatever host it's on. mode is unused now but the
    // parameter stays so this factory signature matches the member app's.
    base: '/',
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
