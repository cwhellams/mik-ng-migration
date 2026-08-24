import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

process.env.TZ = 'Europe/Helsinki'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    testTimeout: 20_000,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/test/**',
        'src/assets/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      // Seeded at what this scaffold actually measures (13.38/1.45/0 with the
      // single smoke test), not at what the app should reach. A ratchet has to
      // start below the current figure or it is not a ratchet, it is a red
      // build — and 50/40/40 was aspirational: there is one test here, because
      // there are no features here yet.
      //
      // Per-directory bars come with the sections, as each feature PR lands its
      // own tests. The rule from apps/frontend applies from here on: **these may
      // only ever be raised**, in the PR that earns it.
      thresholds: {
        statements: 12,
        branches: 1,
        functions: 0,
      },
    },
  },
})
