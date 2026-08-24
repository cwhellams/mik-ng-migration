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
      // The coverage ratchet, same rules as apps/frontend's: per-directory bars,
      // each at its measured figure less about a point of headroom, and **they
      // may only ever be raised**.
      //
      // Measured after #1233's accounting port (507 passing):
      //
      //                            statements       branches      functions
      //   src/components/**      90.0%   18/20    82.4%  14/17     80.0%
      //   src/hooks/**           86.8%   33/38    71.4%  10/14     81.8%
      //   src/api/**             85.7%    6/7     n/a              80.0%
      //   src/{*,theme,config}   75.0%   ~/26     n/a              58.3%
      //   src/layouts/**         80.8%   21/26    85.7%  12/14     70.0%
      //   src/sections/**        51.2% 1548/3025  45.9% 1105/2409  39.3%
      //   ------------------------------------------------------------------
      //   all files              52.4% 1650/3148  46.5% 1144/2462  40.9%
      //
      // `src/sections` fell from 60% to 51% when the accounting pages landed:
      // 14 of the 18 accounting files had no test in apps/frontend either — they
      // sat under that app's 43% `src/sections` bar. The 21 pages ported before
      // them brought their tests along, which is why the number started high.
      //
      // It is still well above apps/frontend's, and the route matrix here
      // renders 45 routes rather than 93, so less of the figure is "a page
      // rendered once and never asserted on".
      thresholds: {
        statements: 51,
        branches: 45,
        functions: 40,

        'src/api/**': { statements: 84, branches: 99, functions: 79 },
        'src/components/**': { statements: 89, branches: 81, functions: 79 },
        'src/hooks/**': { statements: 86, branches: 70, functions: 81 },
        'src/layouts/**': { statements: 79, branches: 84, functions: 69 },
        'src/sections/**': { statements: 50, branches: 45, functions: 39 },
        'src/{*,theme/**,config/**}': { statements: 74, branches: 36, functions: 57 },
      },
    },
  },
})
