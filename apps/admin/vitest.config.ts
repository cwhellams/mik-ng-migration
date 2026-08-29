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
        // 51/45/40 -> 52/46/41, and `src/sections/**` 56/50/44 -> 57/51/45.
        // Measured on this suite (725 passing, 2 todo):
        //
        //                            statements     branches     functions
        //   src/api/**               90.00%          100%          87.50%
        //   src/components/**        91.67%         85.00%         83.33%
        //   src/layouts/**           82.14%         85.71%         72.73%
        //   src/sections/**          58.79%         52.67%         47.57%
        //   -------------------------------------------------------------
        //   all files                59.48%         53.01%         48.67%
        //
        // #1230's defect and remark search is what earned the raise: four files
        // in `src/sections/findings` at 97.4% statements. Its own contribution
        // is +0.78/+0.54/+1.11 globally — the same figures without that
        // directory are 58.70/52.47/47.56 — so the bars go up by a point each
        // rather than to the measured figure. The rest of the gap between 52
        // and 59 is coverage earlier PRs earned without the bar following them,
        // and hoovering it up in a change that did not earn it would break
        // somebody else's branch to make this one look thorough.
        //
        // The three per-directory bars above `src/sections` are left alone for
        // the same reason: this change did not move them.
        statements: 52,
        branches: 46,
        functions: 41,

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
        // 56/50/44 -> 57/51/45, measuring 58.79/52.67/47.57 (57.96/52.12/46.39
        // without #1230's findings pages) — see the note on the global bars above.
        'src/sections/**': { statements: 57, branches: 51, functions: 45 },
        'src/{*,hooks/**,theme/**,config/**}': { statements: 74, branches: 36, functions: 50 },
      },
    },
  },
})
