import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@backend': path.resolve(__dirname, '../backend/src'),
    },
  },
  test: {
    // Default to node; component tests opt into jsdom with a
    // `// @vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
