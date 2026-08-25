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
      //   src/hooks/**           — folded into the shared bar below; after the
      //     interleaved-page split this directory is `useAuth.ts` alone (4
      //     statements), and a bar on four statements measures noise.
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
        'src/layouts/**': { statements: 79, branches: 84, functions: 69 },
        // 50/45/39 -> 51/46/39: #1255 brought NonRenewals under test (it had no
        // tests) and extended the events and phone-number delete confirmations.
        // 51.98/46.02/40.00 -> 52.74/47.01/40.78 measured. Functions moved less
        // than a point, so its bar stays where it is rather than being set with
        // no headroom.
        // 51/46/39 -> 55/50/44: #855's exam version editor and its drag-and-drop
        // reorder helpers landed here (moved from apps/frontend, where the admin
        // split hadn't yet existed when that PR was written) with the tests that
        // came with them — 55.79/50.17/44.29 measured. Left with headroom rather
        // than set at the ceiling.
        // Unchanged at 55/50/44, then measuring 56.47/50.79/44.98: #1139's review
        // round added the inventory item form's "reservable but no units" warning
        // and four tests over it. Under a point of movement on every column once
        // the usual headroom is taken off, so the bars stayed where they were.
        //
        // 55/50/44 -> 56/50/44: #1119's liquid admin screens (AssignQrCode,
        // LiquidRecordsAdmin, OilInventoryAdmin, QrCodesAdmin, liquidFormat.ts)
        // had never had tests, including before the #1233 port that moved them
        // here — 57.25/51.51/45.6 measured against this glob (on top of #1139's
        // own improvement above). Only the statements bar moved: branches and
        // functions already had more headroom than this change used up, and the
        // rest of src/sections (accounting, ame, fuelPrices/FuelPriceComparison.tsx)
        // is still well below this bar, so it stays conservative rather than set
        // at the ceiling.
        'src/sections/**': { statements: 56, branches: 50, functions: 44 },
        'src/{*,hooks/**,theme/**,config/**}': { statements: 74, branches: 36, functions: 50 },
      },
    },
  },
})
