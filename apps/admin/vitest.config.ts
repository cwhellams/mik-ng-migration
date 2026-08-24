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
      // The coverage ratchet, same rules as apps/frontend's: per-directory bars
      // rather than one global number, each set at its measured figure less
      // about a point of headroom, and **they may only ever be raised**.
      //
      // Measured on the first suite to cover this app (414 passing):
      //
      //                            statements       branches      functions
      //   src/api/**            100.0%    7/7     n/a             100.0%
      //   src/components/**      90.0%   18/20    82.4%  14/17     80.0%
      //   src/hooks/**           88.9%   96/108   77.5%  55/71     87.9%
      //   src/layouts/**         80.8%   21/26    85.7%  12/14     70.0%
      //   src/sections/**        60.1% 1233/2052  56.2% 907/1614   48.5%
      //   src/{*,theme,config}   84.0%   22/26    37.5%   3/8      70.0%
      //   ------------------------------------------------------------------
      //   all files              62.2% 1392/2239  57.5% 991/1724   50.9%
      //
      // `src/sections` starts far above apps/frontend's 43%: these pages
      // arrived with the tests written for them in the member app, and the
      // route matrix here renders 28 routes rather than 93, so much less of
      // the figure is "a page rendered once and never asserted on".
      //
      // `src/hooks` is the one that should climb next. useApi is this app's
      // largest untested surface — it was copied from the member app in #1259
      // and the tests were not, which is also why consolidating the two is
      // worth doing before either grows further.
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 48,

        'src/api/**': { statements: 99, branches: 99, functions: 99 },
        'src/components/**': { statements: 89, branches: 81, functions: 79 },
        'src/hooks/**': { statements: 87, branches: 76, functions: 86 },
        'src/layouts/**': { statements: 79, branches: 84, functions: 69 },
        'src/sections/**': { statements: 59, branches: 55, functions: 47 },
        'src/{*,theme/**,config/**}': { statements: 82, branches: 36, functions: 69 },
      },
    },
  },
})
