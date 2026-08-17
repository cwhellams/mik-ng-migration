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
      // Reported, not enforced: no thresholds until the ratchet lands (issue
      // #1116, phase 6). A threshold set at today's coverage teaches nothing.
      //
      // #1132 §6b asked which number that ratchet should be built on, given the
      // route matrix renders all 93 pages once per identity and asserts only on
      // the gate. Measured on this suite (1756 tests, statements / branches):
      //
      //   src/hooks         98.4% / 94.5%      431 of   438 statements
      //   src/theme         93.9% / 66.7%
      //   src/components    93.2% / 89.2%      370 of   397
      //   src/layouts       92.3% / 50.0%
      //   src/lib           86.7%
      //   src/utils         54.5% / 50.9%      181 of   332
      //   src/sections      41.6% / 35.7%    4 893 of 11 772
      //   ------------------------------------------------------
      //   all files         45.6% / 38.7%    5 937 of 13 023
      //
      // The decision: **per-directory thresholds**, not a single global one.
      //
      // `src/sections` is 11 772 of 13 023 statements — 90% of the codebase — so
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
      // all. That is a gap to fill, not a bar to lower.
    },
  },
})
