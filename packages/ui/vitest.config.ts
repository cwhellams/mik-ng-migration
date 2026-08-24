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
      // Measured after #1233's accounting port (346 passing):
      //
      //                        statements       branches      functions
      //   src/hooks/**        97.1% 134/138    97.1%  99/102   100.0% 39/39
      //   src/utils/**        76.0% 136/179    72.3%  86/119    85.5% 47/55
      //   src/components/**   38.5%  97/252    31.5% 115/365    30.5% 29/95
      //   src/api/**           0.6%   1/165     0.0%   0/6       0.0%  0/78
      //   ------------------------------------------------------------------
      //   all files           50.1% 368/734    50.7% 300/592    43.1% 115/267
      //
      // Two directories are dragged down by four files, and it is worth naming
      // them rather than letting the averages hide it. All four arrived with no
      // tests *on either side* — they were never covered in apps/frontend
      // either, where they sat under `src/sections`' 43% bar:
      //
      //   components/expenseShared.tsx   144 of this directory's 252 statements
      //   api/dtoApi.ts + api/examApi.ts 165 statements between them
      //
      // Without `expenseShared`, `src/components` measures ~90%. That file is
      // the single largest untested surface either frontend has, and it is now
      // shared by both, so it is the next thing to earn a raise here.
      //
      // `src/components`'s bar fell from 81 to 37 in this PR for that reason —
      // a denominator change from moving untested code in, not a regression.
      // The four smaller components that moved with it (UserAvatar,
      // ExpenseStatusChip, InvoicePdfLink, FlightListEntry) did get tests in the
      // same PR, which is what took the directory from 19% back to 38%.
      thresholds: {
        statements: 49,
        branches: 49,
        functions: 42,

        'src/hooks/**': { statements: 96, branches: 96, functions: 99 },
        'src/utils/**': { statements: 75, branches: 71, functions: 84 },
        'src/components/**': { statements: 37, branches: 30, functions: 29 },
        'src/api/**': { statements: 0, branches: 0, functions: 0 },
      },
    },
  },
})
