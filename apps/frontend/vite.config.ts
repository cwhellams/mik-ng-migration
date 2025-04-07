import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Get target from env or fallback to localhost
const target = process.env.VITE_API_TARGET || 'http://localhost:3000'

// Set secure to true only if using https
const isSecure = target.startsWith('https')
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/v1': {
        target,
        changeOrigin: true,
        secure: isSecure,
      },
      '/auth': {
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
    conditions: ['mui-modern', 'module', 'browser', 'development|production'],
  },
})
