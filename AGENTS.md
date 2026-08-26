# MIK-NG

pnpm workspace monorepo for the MIK flying club intranet: an Express 5 + Kysely/Postgres
backend and two React 19 + Vite frontends, sharing isomorphic Zod contracts and a MUI
component library.

## External instruction sources

The authoritative, long-form development guide lives in
[`.github/copilot-instructions.md`](.github/copilot-instructions.md) (~700 lines).

**Read it with your Read tool before non-trivial work.** This file is the short index; that
file has the detail. Load it lazily but load it — in particular before touching:

- SQL migrations, the Flyway setup, or the Kysely database layer
- background workers (`defineWorker()` / `workers/registry.ts`)
- email templates (`templates/registry.ts`, `renderEmail(key, lang, vars)`)
- the SimplBooks integration or its mock server
- deployment, environment configuration, or the release flow

Treat its content as mandatory project instructions. It has drifted from the code in a few
places, so when it and the code disagree, the code wins — and fix the doc in the same PR.
Known drift: the backend ESLint threshold is **66** (not 79), `apps/simplbooks_sync/` is
missing from its project structure, and `simplbooks/` is a Prism-based OpenAPI mock, not a
Cloudflare Worker.

`CLAUDE.md` is a one-line pointer to the same file.

## Layout

| Path                   | Package                  | What                                                         |
| ---------------------- | ------------------------ | ------------------------------------------------------------ |
| `apps/backend`         | `mik_ng-backend-service` | Express 5 REST API, run via `tsx`, Kysely over Postgres      |
| `apps/frontend`        | `frontend`               | Member app (`intra.mik.fi`)                                  |
| `apps/admin`           | `admin`                  | Back-office app (`twr.mik.fi`)                               |
| `apps/simplbooks_sync` | `simplbooks-sync`        | CLI that syncs SimplBooks into the MIK database              |
| `packages/contracts`   | `@mik/contracts`         | Isomorphic Zod request/response models and shared enums      |
| `packages/ui`          | `@mik/ui`                | Shared MUI components, API clients, hooks, i18n bundle       |
| `sql/`                 | —                        | Flyway configs and `schema/{migration,static_data,testdata}` |
| `.do/`                 | —                        | DigitalOcean App Platform specs                              |

`simplbooks/` (OpenAPI spec + mock server) is **not** a workspace member and uses npm.

`@mik/contracts` and `@mik/ui` ship TypeScript source — no build output, no barrel
`index.ts`, subpath exports only. Their `build` scripts are `tsc --noEmit` typechecks.

## Setup

```bash
./scripts/start_postgres.sh      # postgres:latest in Docker, admin/password, :5432
# create the mik_ng database and the mik_app_test role once — see copilot-instructions.md
./scripts/baseline_database.sh   # flyway clean + schema + testdata (~8s)
pnpm install
```

Node **26** (CI and `node:26-alpine`), pnpm **11.10.0**. `engines.node` is pinned to `24.x`
on purpose: the DigitalOcean buildpack for the static frontend reads it and does not support 26. Do not "fix" it.

## Commands

```bash
pnpm dev            # backend + frontend + admin concurrently
pnpm build          # recursive; every package's build is a typecheck (noEmit)
pnpm test           # recursive
pnpm lint
pnpm format         # run before every commit
pnpm format:check
```

Per package:

```bash
pnpm --filter mik_ng-backend-service test
pnpm --filter frontend test:coverage
pnpm --filter admin test:coverage
pnpm --filter @mik/ui test:coverage
pnpm --filter @mik/contracts test
```

Single test:

```bash
pnpm --filter mik_ng-backend-service test -- test/routes/bookings/api.test.ts
pnpm --filter frontend exec vitest run src/sections/Foo/Foo.test.tsx
pnpm --filter frontend exec vitest run -t 'test name'
```

Backend is **Jest 30 + @swc/jest**, ESM, config inlined in `apps/backend/package.json`
(there is no jest config file; the root `jest.config.base.js` is dead code). Backend tests
need a live Postgres. Everything else is **Vitest 4** with a per-package `vitest.config.ts`.

Run frontend tests with `LANG=C.UTF-8 LC_ALL=C.UTF-8`. Under `fi_FI.UTF-8`,
`toLocaleTimeString` renders `09.00` instead of `09:00` and ~8 tests fail locally while
passing in CI.

## CI gates

Two workflows gate a PR to `main`: `backend-intra-api-review.yml` and
`intra-frontend-review.yml`. Both run `format:check`, `build`, tests, and an ESLint error
**ratchet** that may only ever be lowered:

| Target               | Max errors |
| -------------------- | ---------- |
| `apps/backend`       | 66         |
| `apps/frontend`      | 5          |
| `apps/admin`         | 0          |
| `packages/ui`        | 0          |
| `packages/contracts` | 0          |

Coverage is gated by `coverage.thresholds` in each `vitest.config.ts`, not by the workflow.
The bars are per-directory and may only be raised — raise them in the PR that earns it.
Backend coverage is collected but not gated.

The backend job also builds the production Docker image and asserts that `@mik/contracts`
subpaths resolve inside it. **A new package under `packages/` needs `COPY` lines in the root
`Dockerfile`** (manifest before `pnpm install`, `src/` after) or the image builds fine and
crashes at boot.

## Database

Flyway, migrations in `sql/schema/migration/`, named `V<version>__<PascalCaseDescription>.sql`
with `validateMigrationNaming=true`.

- **Never edit a migration that is already on `main`.** Flyway checksums break every deploy.
- **Increment the version by 10**, never by 1 and never into a gap between deployed
  versions — out-of-order migrations fail.
- **Never `CREATE SCHEMA`** in a migration. Schemas come from `flyway.schemas` in
  `migration.conf` and `migration_prod.conf`. Add the name there, then
  `GRANT USAGE ON SCHEMA <x> TO ${app_db_user};` in the migration. Local dev connects as
  superuser `admin`, so a missing grant only shows up in TEST/PROD.
- Placeholders: `${app_db_user}`, `${mik_db_name}`.

After changing the schema, regenerate and commit the Kysely types:

```bash
cd apps/backend && pnpm schema   # → src/db/schema.d.ts, camelCase, committed
```

## Conventions

- **Prettier**: no semicolons, single quotes, 100 columns, trailing commas, LF. One root
  `.prettierrc`. `pnpm-lock.yaml` is in `.prettierignore` deliberately — formatting it
  expands pnpm's inline flow maps into a 10k-line diff pnpm then rewrites.
- **ESLint 9 flat config**, one `eslint.config.js` per package. The root `.eslintrc.js` and
  `tsconfig.base.json` are empty files that nothing reads.
- **`.gitignore` ignores `*.js` globally** with only a few un-ignores. A new `.js` file will
  be silently untracked — check `git status` before assuming it was added.
- **Isomorphism is enforced, not conventional.** `packages/contracts` and `packages/ui` ban
  `process`/`Buffer`/`__dirname`/`global`, `node:*` imports, and server-only packages
  (`express`, `kysely`, `pg`, `nodemailer`, …) via `no-restricted-globals` /
  `no-restricted-imports`. `packages/contracts/tsconfig.json` sets `"types": []` and includes
  `src/**` only — do not add `test/` to it.
- **The frontend may never import backend source** (`@backend`, `**/backend/src/**` are
  blocked). For the migrated domains (`members`, `aircrafts`, `bookings`,
  `inventory-reservations`, `liquid`), raw `'v1/…'` string literals are an ESLint error —
  paths come from `apps/frontend/src/api/endpoints.ts`.
- **`dangerouslySetInnerHTML` is banned**; i18next escaping is off. Use `MarkdownContent`
  from `@mik/ui`.
- Timezone in tests: `Europe/Helsinki` for the apps and `@mik/ui`, **`UTC` for
  `@mik/contracts`** on purpose, so a missing explicit `.tz()` cannot pass.
- Commits follow Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`).
- Changelogs are per version range (`changelogs/CHANGELOG-<from>-to-<to>.md`), generated at
  release time — not per PR.

## Tests are part of the change

Per `.github/pull_request_template.md`: a change that alters behaviour brings tests for the
behaviour it alters, in the same PR. A bug fix brings a test that fails without the fix.
Permission-gated changes are tested against the whole identity set.
