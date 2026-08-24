import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Matches apps/frontend: the club is in Finland and utils/date distinguishes
// local from UTC, so pin the timezone rather than inheriting the machine's.
// Under TZ=UTC every local-vs-UTC assertion would pass vacuously.
process.env.TZ = 'Europe/Helsinki'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      reportsDirectory: 'coverage',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/test/**',
        'src/locales/**',
        'src/data/**',
        'src/i18n.ts',
      ],
      // The coverage ratchet, same rules as both apps': per-directory bars, each
      // set at its measured figure less about a point of headroom, and **they
      // may only ever be raised**.
      //
      // Measured on the first run of this package's suite (135 passing):
      //
      //                        statements      branches      functions
      //   src/hooks/**       100.0%  24/24    100.0%  10/10   100.0%   9/9
      //   src/utils/**        91.9%  79/86     92.6%  63/68    91.2%  31/34
      //   src/components/**   82.8%  24/29     77.6%  38/49    80.0%   8/10
      //   src/api/**           4.7%   8/172    25.0%   2/8      3.7%   3/81
      //   ------------------------------------------------------------------
      //   all files           43.4% 135/311    83.7% 113/135   38.1%  51/134
      //
      // The three high directories are high because the code arrived already
      // covered — the tests moved out of apps/frontend with it.
      //
      // `src/api` did not. dtoApi and examApi are 172 of this package's 311
      // statements and they have never had a test on either side: they lived in
      // `apps/frontend/src/sections/{dto,exams}/`, under the 43% bar that
      // directory carries, and moving them here did not make them worse. They
      // are thin `get`/`post` wrappers, which is the excuse, but they are also
      // the single biggest untested surface either frontend has and they are
      // now shared by both — so this is the obvious next bar to earn a raise,
      // and the reason `src/api` gets its own rather than being averaged away
      // into a global number that would read a comfortable 43%.
      thresholds: {
        statements: 42,
        branches: 82,
        functions: 37,

        'src/hooks/**': { statements: 99, branches: 99, functions: 99 },
        'src/utils/**': { statements: 90, branches: 91, functions: 90 },
        'src/components/**': { statements: 81, branches: 76, functions: 79 },
        'src/api/**': { statements: 4, branches: 24, functions: 3 },
      },
    },
  },
})
