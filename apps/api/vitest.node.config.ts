import { defineConfig } from 'vitest/config'

/**
 * The database layer's tests, run in **Node** rather than workerd.
 *
 * Not a preference. `pg` is CommonJS and reaches for `node:tls`, and the
 * Workers test runner's module loader cannot load it — wrangler's own bundler
 * can, which is why `pnpm dev` and a deployed Worker are both fine. Three ways
 * round it were tried (`deps.optimizer.ssr`, `server.deps.inline`, and leaving
 * it external) and all three fail in the runner, not in workerd.
 *
 * What these tests are actually about is SQL and Kysely semantics — the
 * transaction wrapper, the transaction-local settings, the type parsers, the
 * camelCase plugin — and those are identical in both runtimes. What is *not*
 * covered here is that `pg` reaches Postgres from workerd at all; that is
 * verified by running `pnpm --filter api dev` against a local database, and it
 * does (see README).
 *
 * Needs a Postgres. TEST_DATABASE_URL overrides the local default.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // One connection per test file at a time keeps the transaction assertions
    // from racing each other on a shared database.
    fileParallelism: false,
  },
})
