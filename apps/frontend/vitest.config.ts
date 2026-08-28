import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The club is in Finland and much of the date/time code distinguishes local
// from UTC, so pin the timezone rather than inheriting the machine's. Under
// TZ=UTC (the CI default) every local-vs-UTC assertion would pass vacuously.
process.env.TZ = 'Europe/Helsinki'

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom everywhere, so any test can render. Pure-logic suites that want the
    // (slightly faster) node environment can opt out per file with a
    // `// @vitest-environment node` docblock.
    environment: 'jsdom',
    // 5s is not enough for the form/wizard suites: driving a whole dialog
    // through user-event is slow, and slower again under `--coverage`, where
    // the default made a varying handful of tests time out on every run.
    testTimeout: 20_000,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Undo spies/stubs between tests so one test's vi.spyOn can't leak.
    restoreMocks: true,
    // Vitest's default worker count is `max(availableParallelism() - 1, 1)`,
    // which resolves to effectively serial on GitHub's hosted runner (verified:
    // a CI run's phase-duration sum matched its wall-clock time almost exactly,
    // meaning no file execution overlap). These tests have no shared external
    // resource (mocked network, no DB), so forcing real parallelism is safe.
    // Vitest 4 dropped `poolOptions.forks`; `maxWorkers` is the replacement and
    // has no minimum counterpart — workers are spawned up to this cap as files
    // become available, and the suite has far more files than workers.
    // Capped at 2 rather than 4: GitHub's hosted runner has ~4 vCPUs, and
    // pinning all of them left no headroom for the main/orchestration thread,
    // which pushed several user-event-heavy tests (MeetingsAdminPage's vote
    // dialog) over the 20s testTimeout under CPU contention (PR #1188 CI run).
    maxWorkers: 2,
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
      // The coverage ratchet — phase 6 of #1116. Vitest exits non-zero when any
      // bar below is missed, so `pnpm test:coverage` is the gate and the CI step
      // that runs it needs no threshold logic of its own.
      //
      // #1132 §6b asked which number the ratchet should be built on, given the
      // route matrix renders all 93 pages once per identity and asserts only on
      // the gate. Measured on this suite (1759 passing, 5 todo):
      //
      //                                statements       branches     functions
      //   src/hooks/**              98.4%  427/434    94.5%   207/219    100%
      //   src/components/**         93.2%  370/397    89.2%   315/353   87.7%
      //   src/{*,lib,layouts,       73.8%   62/ 84    50.0%    13/ 26   72.0%
      //     theme,config}  (*)
      //   src/utils/**              54.5%  181/332    50.9%    83/163   66.7%
      //   src/sections/**           41.6% 4893/11772  35.7%  3863/10812 27.6%
      //   ----------------------------------------------------------------------
      //   all files                 45.6% 5933/13019  38.7%  4481/11573 32.6%
      //
      //   (*) written out below as `src/{*,lib/**,layouts/**,theme/**,config/**}`
      //
      // The decision: **per-directory thresholds**, not a single global one.
      //
      // `src/sections` is 11 772 of 13 019 statements — 90% of the codebase — so
      // the global figure is very nearly `src/sections`'s figure, and much of
      // that is pages executed by the matrix rather than asserted on. A global
      // bar set at ~45% would also leave every directory that is genuinely
      // covered free to halve before anything failed: hooks could fall from 98%
      // to 50% and the total would barely move.
      //
      // Excluding the matrix from collection (the other option on the table) was
      // rejected: it lowers the number without making it mean more, and it
      // discards the one signal the render coverage does carry — that a page
      // still renders at all.
      //
      // `src/utils` reads low but is bimodal, not thin: date, format, lang,
      // localisedText and formErrors are at 100% and wizardDraft at 95%, while
      // six browser-API wrappers (pushNotifications, passkey, documentHelpers,
      // eventCalendar, calendarEvent, haptics) sit at 7–33% with no tests at
      // all. That is a gap to fill, not a bar to lower — it is the obvious next
      // directory to earn a raise, not a reason to have set this one low.
      //
      // Every collected file matches exactly one glob below: the directories that
      // carry mass get their own bar, and the four small ones that don't — plus
      // `App.tsx`, `AppRoutes.tsx`, `i18n.ts` — share the (*) bar, because at 84
      // statements between them a single statement is worth 1.2 points and
      // separate bars would be measuring noise.
      //
      // Each bar is its measured figure less about a point of headroom (one
      // uncovered unit, in the small shared set). A ratchet pinned exactly to the
      // measurement fails on the first unrelated refactor that deletes covered
      // code along with the code it covered, and a gate the team learns to
      // distrust is worse than no gate. **These may only ever be raised** — raise
      // them in the PR that earns it, the same habit as the ESLint counts in the
      // two review workflows.
      //
      // `lines` is deliberately not gated: under the v8 provider it tracks
      // `statements` to within a point, so it would be a fourth column to keep
      // up to date for no signal the other three don't already carry.
      thresholds: {
        // Applies to every file, including those matched by the globs below.
        // Not the mechanism — the per-directory bars are — but it is what keeps
        // a directory nobody has written a bar for yet (a future
        // `src/features/`) from being collected and gated by nothing.
        statements: 44,
        branches: 37,
        functions: 31,

        // New in #1115 phase 6. It is a registry of paths plus one one-line
        // helper, exercised directly by endpoints.test.ts and transitively by
        // every migrated call site, so it starts at the top of the range and
        // there is no reason for it ever to leave.
        'src/api/**': { statements: 99, branches: 99, functions: 99 },
        // branches 93 -> 89: #1233 moved useApi, useMe, useRoles, useTimezone,
        // useMultiSelect, useScrollOnRender and useInvoicePdfDownload to
        // @mik/ui, and they were the most branch-covered hooks here. What
        // remains measures 98.35/90.18/100. Statements and functions are
        // untouched.
        //
        // branches 89 -> 90: #1139's review round moved the two calendars'
        // duplicated view/date plumbing into `useCalendarViewState` and covered
        // it here (98.66/91.23/100 measured). Statements and functions are
        // already at the top of their range; only branches earned a point.
        'src/hooks/**': { statements: 97, branches: 90, functions: 99 },
        // 92/88/86 -> 91/86/86, and src/utils below 61/55/76 -> 54/43/66.
        //
        // The only time these bars move down. #1233 moved five well-covered
        // components (Title, RemoteContent, LocalisedTextField, SnackAlert,
        // MarkdownContent) and three fully-covered utils (date, format,
        // localisedText) out to `packages/ui`, so both directories lost
        // numerator and denominator together and what is left reads lower —
        // 91.86/87.42/86.99 and 55.43/44.88/67.50 measured. Nothing became less
        // tested: the same tests moved with the code and now run against
        // `packages/ui`'s own ratchet, which starts at 95/90/95 precisely
        // because that code arrived already covered.
        //
        // A denominator change is the one thing "may only ever be raised"
        // cannot absorb, and pinning the bars at the old numbers would have
        // meant either deleting the moved tests' subjects from the report or
        // leaving a red build. Both are worse than saying so here.
        'src/components/**': { statements: 91, branches: 86, functions: 86 },
        // 71/46/68 -> 64/46/62. `src/lib` is gone entirely — its one module,
        // pdfDownload, moved to @mik/ui with the invoice-download hook that
        // calls it — and App.tsx grew the two provider bridges the shared hooks
        // read their config from. At 65 statements between five directories a
        // single statement is worth 1.5 points, which is why this bar moves
        // more than the others for the same amount of change.
        'src/{*,lib/**,layouts/**,theme/**,config/**}': {
          statements: 64,
          branches: 46,
          functions: 62,
        },
        // 53/49/65 -> 61/55/76 in #1115 (finding 8 brought the two calendar
        // modules and the extracted icsDownload under test), then 61/55/76 ->
        // 54/43/66 in #1233 for the denominator reason explained above — date,
        // format and localisedText were three of this directory's four
        // fully-covered modules and they now live in `packages/ui`. What is
        // left here is the browser-API wrappers that were always the gap.
        //
        // 54/43/66 -> 57/48/69: #1174 extracted the efficiency percentage
        // helpers shared by the club-wide and per-member reports into
        // efficiency.ts and covered them (57.34/48.14/69.04 measured). The
        // branch that added them measured 64.26/58.47/78.68 against the old,
        // larger denominator; re-measured here after the #1233 move, which is
        // why this raise looks smaller than that PR's did.
        'src/utils/**': { statements: 57, branches: 48, functions: 69 },
        // 40/34/26 -> 43/38/28: #1019 brought the flight-log list, the crew-role helper,
        // the change-history dialog and the crew/instructor gating on the entry form under
        // test (43.98/39.24/29.71 measured). Raised in the PR that earned it, per the rule
        // above.
        //
        // 43/38/28 -> 44/40/29 (#1255: the fly page's Hold Item List, its grounding
        // banner and the shared defect link — that directory had no tests at all —
        // plus the member list's selection checkbox and the DTO student detail page),
        // then -> 46/43/32: #1139 added the item reservation calendar, its editor and
        // its helpers with tests, and extended the inventory admin page's suite over
        // the new units tab. 47.10/44.08/32.76 measured with both changes in. Same
        // rule — the branch bar rises further than either change claimed alone
        // because the two sets of tests land in the same directory.
        //
        // Unchanged at 46/43/32, now measuring 46.90/43.99/32.55: #1139's review
        // round moved the two calendars' view/date plumbing out to
        // `src/hooks/useCalendarViewState`, so this directory lost covered code
        // from its numerator and its denominator together and reads a fifth of a
        // point lower. Nothing became less tested — the assertions moved with it
        // and are now explicit rather than incidental to two page suites — and a
        // bar may only ever be raised, so these stay put.
        //
        // 46/43/32 -> 47/44/33: #1254 brought the two maintenance-note dialogs (neither
        // had any tests), the shared recorded-date field, the reported-defect submitter
        // and the logbook's own-row item dates under test, and extended the two defect
        // dialogs' suites over the new field. 48.03/44.66/33.69 measured.
        //
        // 47/44/33 -> 50/47/36 (#1249). Two numbers, because they are not the same
        // story. This change measures 51.26/48.88/37.60; the commit it sits on
        // (#1254's merge) already measured 50.75/48.46/37.33 on its own. So #1249's
        // contribution is +0.51/+0.42/+0.27 — the flight-log list's member filter, the
        // export dialog (which had no test file at all) and the member profile's "view
        // all flights" gate — and the other three points are coverage that earlier PRs
        // earned without the bar following them.
        //
        // That gap is worth naming, because it is how a ratchet quietly stops
        // ratcheting: every bar in this block is measured on the branch that raises it,
        // and a branch measures whatever base it happened to be cut from. #1254's own
        // 48.03/44.66/33.69 above was honest when taken and was 2.7 points stale by the
        // time it merged. Caught up to a point under measured here rather than left as
        // slack for the next change to spend.
        'src/sections/**': { statements: 50, branches: 47, functions: 36 },
      },
    },
  },
})
