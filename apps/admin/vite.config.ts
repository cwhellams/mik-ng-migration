import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_TARGET || 'http://localhost:3000'
  const isSecure = target.startsWith('https')

  return {
    plugins: [react()],
    // Admin app is served at /atc/ in production (DO App Platform path-based routing).
    // In development (port 5174) it serves at / for simplicity.
    base: mode === 'production' ? '/atc/' : '/',
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
