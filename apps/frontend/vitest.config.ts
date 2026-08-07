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
    // jsdom everywhere, so any test can render. Pure-logic suites that want the
    // (slightly faster) node environment can opt out per file with a
    // `// @vitest-environment node` docblock.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Undo spies/stubs between tests so one test's vi.spyOn can't leak.
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      // Report on everything, not just files a test happened to import —
      // otherwise untested modules silently sit outside the denominator.
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/test/**',
        'src/locales/**',
        'src/assets/**',
        'src/data/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      // Reported, not enforced: no thresholds until the ratchet lands (issue
      // #1116, phase 6). A threshold set at today's coverage teaches nothing.
    },
  },
})
