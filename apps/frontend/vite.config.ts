import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
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
    plugins: [react()],
    server: {
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
