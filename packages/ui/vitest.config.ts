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
      // Measured after #1233's interleaved-page split (364 passing):
      //
      //                        statements       branches      functions
      //   src/hooks/**        97.1% 169/174    96.5% 110/114   100.0% 49/49
      //   src/utils/**        76.0% 136/179    72.3%  86/119    85.5% 47/55
      //   src/components/**   40.6% 219/540    33.4% 179/536    25.4% 46/181
      //   src/api/**           0.6%   1/165     0.0%   0/6       0.0%  0/78
      //   ------------------------------------------------------------------
      //   all files           45.2% 478/1058   48.4% 345/775    39.1% 136/363
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
      // Statements and branches went *up* in the interleaved-page split even
      // though the documents feature (540 -> from 252 statements) arrived with
      // it, because DocumentsPage's `canManage` gate is tested from both sides.
      // Functions dipped 30 -> 25: that feature is many small handlers, and the
      // gate test exercises the render path rather than every one of them.
      thresholds: {
        statements: 44,
        branches: 47,
        functions: 38,

        'src/hooks/**': { statements: 96, branches: 96, functions: 99 },
        'src/utils/**': { statements: 75, branches: 71, functions: 84 },
        // statements 39 -> 40: #1230 moved the findings kind/status chips here
        // from apps/admin, with their tests — both apps render them unchanged,
        // which is what this package is for. 42.38/34.48/27.13 measured
        // (41.34/34.24/26.34 without them), so only statements moved by the
        // point this block treats as the threshold for touching a bar; the
        // rest of the gap is slack earlier changes earned without the bars
        // following, and is not this change's to spend.
        'src/components/**': { statements: 40, branches: 32, functions: 24 },
        'src/api/**': { statements: 0, branches: 0, functions: 0 },
      },
    },
  },
})
