# MIK-NG Development Instructions

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap Environment

Install required tools:

```bash
# Install Node.js v26 — matches the CI workflows and the production
# Dockerfile (`node:26-alpine`). Anything older warns on every pnpm command.
# NOTE: engines.node in package.json is intentionally set to 24.x (not 26.x)
# because the Digital Ocean App Platform managed buildpack for the frontend
# static site reads that field and does not support Node 26. Do NOT change
# engines.node to 26.x — it would break the DO frontend build. The Dockerfile
# and GitHub Actions CI install Node 26 explicitly and are unaffected by it.
wget https://nodejs.org/dist/v26.7.0/node-v26.7.0-linux-x64.tar.xz
sudo tar -xf node-v26.7.0-linux-x64.tar.xz -C /opt/
sudo ln -sf /opt/node-v26.7.0-linux-x64/bin/node /usr/local/bin/node
sudo ln -sf /opt/node-v26.7.0-linux-x64/bin/npm /usr/local/bin/npm

# Install pnpm
npm install -g pnpm@11.10.0

# Install Flyway CLI
wget -qO- https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/10.21.0/flyway-commandline-10.21.0-linux-x64.tar.gz | tar -xzf -
sudo mv flyway-10.21.0 /opt/flyway
sudo ln -s /opt/flyway/flyway /usr/local/bin/flyway
```

### Database Setup

Start PostgreSQL and set up the database:

```bash
# Start PostgreSQL container - takes ~11 seconds
./scripts/start_postgres.sh

# Wait for PostgreSQL to be ready, then create mik_ng database
PGPASSWORD=password psql -h localhost -U admin -d mydatabase -c "CREATE DATABASE mik_ng WITH OWNER = admin ENCODING = 'UTF8' LC_COLLATE = 'en_US.UTF-8' LC_CTYPE = 'en_US.UTF-8' LOCALE_PROVIDER = 'libc' TEMPLATE = template0;"

# Create required test role with the canonical Flyway/CI password
PGPASSWORD=password psql -h localhost -U admin -d mydatabase -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mik_app_test') THEN CREATE ROLE mik_app_test LOGIN PASSWORD 'test_pwd'; END IF; END \$\$;"

# Set up full database baseline - takes ~8 seconds total. NEVER CANCEL.
./scripts/baseline_database.sh
```

### Build and Dependencies

Install dependencies and build:

```bash
# Install all dependencies - takes ~64 seconds on first run. NEVER CANCEL. Set timeout to 120+ seconds.
pnpm install

# Build all projects - takes ~26 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
pnpm build

# Generate database schema types (after DB is set up) - takes <1 second
cd apps/backend && pnpm schema
```

### Development Workflow

Run development servers:

```bash
# Run both backend and frontend concurrently (recommended)
pnpm dev
# Backend: http://localhost:3000 | Frontend: http://localhost:5173/

# Or run individually:
# Backend development - runs TypeScript directly via tsx
cd apps/backend && pnpm dev

# Frontend development - works reliably, takes ~1 second to start
cd apps/frontend && pnpm dev
# Serves at http://localhost:5173/
```

### Testing and Quality

```bash
# Format code - takes ~5 seconds. NEVER CANCEL.
pnpm format

# Run tests - takes ~11 seconds. All tests pass with proper environment setup. NEVER CANCEL. Set timeout to 30+ seconds.
# Note: the old "Called end on pool more than once" teardown error is fixed — closeDb
# used to end the pg pool and then let Kysely's driver end it again (#1115 phase 5).
# IMPORTANT: run with a plain locale (LANG=C.UTF-8 LC_ALL=C.UTF-8), matching the CI runner.
# Frontend date/time-formatting tests call toLocaleTimeString([]) (system default locale).
# Under a non-English shell locale (e.g. LANG=fi_FI.UTF-8) this renders times with '.'
# instead of ':' (e.g. "09.00" vs "09:00"), which fails several tests locally even though
# they pass in CI — a locale mismatch, not a real bug.
pnpm test

# Lint code - KNOWN ISSUE: ESLint configuration has missing dependencies in backend
# May fail with "Cannot find package '@eslint/js'" error in backend
pnpm lint
```

## Validation Scenarios

After making changes, always test:

1. **Database Operations**: Run `./scripts/baseline_database.sh` to ensure database scripts work
2. **Build Process**: Run `pnpm build` to ensure all projects compile successfully
3. **Frontend Functionality**: Start `pnpm dev` in apps/frontend and verify it serves at http://localhost:5173/
4. **Schema Generation**: Run `pnpm schema` in apps/backend after database changes
5. **Code Quality**: Run `pnpm format` before committing changes

## Testing Policy

**A change that alters behaviour brings tests for the behaviour it alters.** Not a
separate task, not a follow-up issue — the same PR.

This is deliberate policy, not a nicety. The frontend suite went from 3 test files to 99
(~17k lines) in one dedicated effort, #1116. That effort is what closed the gap; this
policy is what stops it reopening, and both were agreed in that issue. The coverage
ratchet in CI enforces only the weaker half: it stops a directory's percentage _falling_,
but a PR that adds one well-covered module and one untested one passes it comfortably.

Where the tests go:

| Area                 | Location                                              |
| -------------------- | ----------------------------------------------------- |
| `apps/backend`       | `test/`, mirroring `src/routes/<domain>/`             |
| `apps/frontend`      | colocated `*.test.ts` / `*.test.tsx` next to the code |
| `apps/admin`         | colocated `*.test.ts` / `*.test.tsx` next to the code |
| `packages/contracts` | `packages/contracts/test/`                            |
| `packages/ui`        | colocated, next to the component or util              |

Rules that follow from it:

- **Anything behind a permission gate is tested against the whole identity set**, never
  just the happy path — the backend's admin / member / no-permissions token triad, and
  `authScenarios` on the frontend. A gate with one test is a gate tested from the inside
  only.
- **Fixing a bug means writing the test that fails without the fix first.** Every defect in
  #1132 was closed that way, and the test is the part that stops it coming back.
- **If your change pushes a directory's coverage up, raise its bar in the same PR** —
  `coverage.thresholds` in `apps/frontend/vitest.config.ts`. Bars may only ever be raised.
- **Test decisions, not markup.** No snapshot tests. Pure-layout JSX, generated files and
  config are genuinely out of scope, and saying so in the PR is a fine answer.
- **When something is genuinely untestable today, say why in an `it.todo` with a comment
  naming the blocker** — not a silent omission. The handful in the frontend suite are
  blocked on forms that layer native `required` over hand-rolled validation, and point at
  the issue that will unblock them.

`apps/frontend/src/test/README.md` is the frontend harness guide — read it before writing
a frontend test rather than re-inventing providers, fixtures or API stubs.

**A new feature also brings seed data that demonstrates it.** Automated tests prove the
code path works in isolation; seed data is what lets a developer click through the running
app (`pnpm dev`) and actually see the feature. Add it as a new file in
`sql/schema/testdata/`, following the versioning rules in Database Schema Management below
(new file, version = current highest + 10, never edit an existing testdata file). Cover the
feature's distinct modes, not just one example — e.g. #855's random-vs-fixed question
ordering shipped with one exam of each kind (`sql/schema/testdata/V300__ExamTestData.sql`),
not just one.

## Critical Timing Information

**NEVER CANCEL** the following operations:

- `pnpm install`: 60-120 seconds (first time)
- `pnpm build`: 30-60 seconds
- `pnpm test`: 15-30 seconds (all tests pass with proper environment)
- `./scripts/baseline_database.sh`: 10-20 seconds

Always set timeouts of at least 2x the expected time to avoid premature cancellation.

## Environment Configuration

The backend requires a `.env` file in `apps/backend/`. A working example exists with local development defaults:

- Database: `postgres://admin:password@127.0.0.1:5432/mik_ng`
- API Port: 3000
- Frontend URL: http://localhost:5173
- **Important**: Add `SIMPLBOOKS_COMPANY_ID=123` to the .env file if missing to avoid startup errors
- **Important**: Add `DISABLE_EMAIL_SENDING=true` to the .env file to prevent actual emails being sent in development
- **Important**: Add `SIMPLBOOKS_DRY_RUN=true` to test the invoice outbox worker locally without calling SimplBooks (see Dry-Run Mode below)
- **Optional**: `OCCURRENCE_ATTACHMENT_BUCKET` overrides the DO Spaces bucket used for occurrence report attachments (pictures). Defaults to `mik-occurrence-attachments` in production and `mik-occurrence-attachments-test` otherwise. The bucket must be created (Restricted) in DO Spaces before first use in an environment.
- **Optional**: `MEMBER_AVATAR_BUCKET` overrides the DO Spaces bucket used for uploaded member avatars. Defaults to `mik-member-avatars` in production and `mik-member-avatars-test` otherwise. The bucket must be created (Restricted) in DO Spaces before first use in an environment. **Gotcha shared with `OCCURRENCE_ATTACHMENT_BUCKET`**: both `.do/mik-intranet-prod.yaml` and `.do/mik-intranet-test.yaml` hardcode `NODE_ENV=production`, so the beta environment does _not_ get the `-test` default for free — `MEMBER_AVATAR_BUCKET` is wired as an explicit per-environment GitHub Actions variable (see `create-test-release-and-deploy-to-do.yml` / `prod-deploy-to-do.yml`) precisely so beta can point at `mik-member-avatars-test` instead of silently sharing the production bucket.

## Known Issues and Workarounds

1. **Node.js Version Requirement**: Use Node.js v26 — it is what the CI workflows and the production Dockerfile specify. The backend's own `dev`/`start` scripts run through `tsx` and are not version-sensitive, but `simplbooks/` and `.vscode/launch.json` still use `node --experimental-transform-types` to run `.ts` directly. **Do NOT change `engines.node` in `package.json` to `26.x`** — it is intentionally `24.x` because the Digital Ocean App Platform managed buildpack reads that field for the frontend static site build and does not support Node 26. The Dockerfile and GitHub Actions both install Node 26 explicitly and are not controlled by `engines.node`.
2. **Test Environment Variables**: Tests require SimplBooks API configuration to pass fully
3. **PostgreSQL Credentials**: Local development uses admin/password (never use in production)
4. **SimplBooks Config**: Ensure `SIMPLBOOKS_COMPANY_ID` is set in .env to prevent startup errors
5. **Shell Locale Affects Frontend Tests**: Several `apps/frontend` tests format times via `toLocaleTimeString([])`, which resolves to the shell's locale. A non-English `LANG`/`LC_ALL` (e.g. `fi_FI.UTF-8`) makes these render with `.` instead of `:` (e.g. `09.00` vs `09:00`) and fails ~8 tests that pass fine in CI. Run `pnpm test` with `LANG=C.UTF-8 LC_ALL=C.UTF-8` (or otherwise match the CI runner's default locale) to avoid this false negative.

## Repository Traps

Five things here look like one thing and are another. Each has cost someone time.

**`*.js` is gitignored repo-wide.** `.gitignore` ignores `*.js` with only three un-ignores
(`eslint.config.js`, `global-teardown.js`, `apps/frontend/public/push-sw.js`). A new `.js`
file is silently untracked — the commit appears to succeed and the file never reaches the
branch. Check `git status` before assuming an add worked, or use `git add -f`. Almost
everything here is TypeScript, so this rarely comes up and is baffling when it does.

**The backend's Jest config lives in `apps/backend/package.json`** under a `"jest"` key.
There is no `jest.config.*` file in `apps/backend`. The root `jest.config.base.js` is dead:
nothing references it, and it describes a setup the backend does not use (`ts-jest` rather
than `@swc/jest`, and a `spec|test` match rather than `**/*.test.ts`). Editing it changes
nothing.

**`tsconfig.base.json` and `.eslintrc.js` are both empty.** Zero bytes, and nothing reads
either — `.eslintrc.js` survives only as a glob in `.dockerignore`. The real configuration
is per package: a standalone `tsconfig.json` and an ESLint 9 flat `eslint.config.js` in
each. Adding compiler options or lint rules to the root files has no effect.

**`packages/contracts` runs its tests under `TZ=UTC`** while `apps/frontend`, `apps/admin`
and `packages/ui` use `Europe/Helsinki`. This is deliberate, and the reasoning is in
`packages/contracts/vitest.config.ts`: everything in that package converts to Helsinki
explicitly, so running the suite in Helsinki would let a missing `.tz()` pass by accident.
Do not "fix" the inconsistency.

**Two root scripts are narrower than they look.** `pnpm clean` is a no-op — no package
defines a `clean` script. `pnpm typecheck` reaches only `@mik/contracts` and `@mik/ui`,
the two that define it; the backend and both apps typecheck through their `build` scripts
instead, all of which are `noEmit`.

## Project Structure

```
├── apps/
│   ├── backend/          # Node.js/Express API with TypeScript
│   ├── frontend/         # React/Vite — the member app (intra.mik.fi)
│   ├── admin/            # React/Vite — the back-office app (twr.mik.fi, see below)
│   └── simplbooks_sync/  # Standalone CLI that syncs SimplBooks into the MIK database
├── packages/
│   ├── contracts/        # @mik/contracts — API models shared by every app (see below)
│   └── ui/               # @mik/ui — components, utils and i18n shared by the two frontends (see below)
├── simplbooks/           # SimplBooks OpenAPI spec + local mock servers (see below)
├── sql/                  # Database migrations and test data
├── scripts/              # Utility scripts for development
└── .github/workflows/    # CI/CD pipelines
```

Only `apps/*` and `packages/*` are pnpm workspace members. `simplbooks/` is standalone and
uses npm with its own lockfile.

## Key Development Files

Always check these locations when working on the codebase:

- `apps/backend/src/db/schema.d.ts` - Generated database types (run `pnpm schema` to regenerate)
- `apps/backend/.env` - Backend environment configuration
- `sql/schema/migration/` - Database schema migrations
- `sql/schema/testdata/` - Test data scripts
- `sql/migration.conf` - Flyway configuration (defines schemas via `flyway.schemas`)
- `simplbooks/simplbooks-api/api.yaml` - Downloaded SimplBooks OpenAPI spec, used by both mocks
- `simplbooks/src/mock-server.ts` - The stateful "smart" SimplBooks mock (see below)
- `packages/contracts/src/<domain>.ts` - Shared request/response models (see below)
- `packages/ui/src/**` - Components, utils, API clients and the i18n bundle shared by both frontends (see below)
- `apps/admin/src/config/navItems.ts` - The admin sidebar; must agree with `AppRoutes.tsx`'s gates
- Package files: `package.json`, `apps/*/package.json`, `packages/*/package.json`

## The Two Frontends

`apps/frontend` is the member app (`intra.mik.fi` / `beta.mik.fi`); `apps/admin` is the
back-office app (`twr.mik.fi` / `beta-twr.mik.fi`), served by the same DigitalOcean app as
a second `static_sites` component with its own domain — routed by an `authority`-matched
ingress rule (see `.do/mik-intranet-{prod,test}.yaml`), not a path prefix. The split is
issue #1233: the member UI had accumulated enough back-office functionality that both
audiences were badly served by it.

Because the two apps are genuine subdomains rather than paths on one origin, the admin
app's calls to the backend are cross-origin from the member app's. That is made to work
by three things, all set on the backend service in the DO spec: `COOKIE_DOMAIN=.mik.fi`
(shares the auth session across every mik.fi subdomain), `COOKIE_PREFIX` (`intra_` in
production, `beta_` in test) and `CORS_ALLOWED_ORIGINS` including the admin subdomain (a
GitHub Actions var, not in this repo — see the comment beside it in the DO spec). DNS for
`twr.mik.fi`/`beta-twr.mik.fi` is likewise external to this repo, same as for the existing
`intra.mik.fi`/`beta.mik.fi`.

**`COOKIE_PREFIX` is not optional decoration — it is the only thing separating the two
environments' sessions.** A cookie's identity is `(name, domain, path)`, and the narrowest
domain covering `intra.mik.fi` _and_ `twr.mik.fi` is `mik.fi` — the same narrowest domain
that covers `beta.mik.fi` and `beta-twr.mik.fi`, because `beta-twr` is a _sibling_ label of
`beta`, not a child of it. So without a distinguishing name both environments write one
cookie, `('accessToken', '.mik.fi', '/')`, and whichever you signed into last owns it: the
other then holds a token signed with a secret it does not have, answers 401 to everything,
and bounces the member back to the login screen — where signing in steals the cookie back
and breaks the first environment in turn. That outage reached production without a line of
production code changing. `assertAuthCookieConfig()` in
`apps/backend/src/routes/auth/cookies.ts` refuses to boot when `COOKIE_DOMAIN` is set and
`COOKIE_PREFIX` is not; **any new deployment under `mik.fi` needs its own prefix.** All
cookie naming, scoping and eviction lives in that one file — read its header before
touching auth cookies anywhere.

- **No sudo toggle in `apps/admin`.** The member app's `AdminToggle` exists so that
  someone who merely _holds_ an admin permission doesn't see admin UI by accident.
  Reaching the admin app is itself that deliberate step, so its `useApi` always sends
  `x-sudo: true` and `useRoles().hasSudoAccess === hasAccess`. A `RequirePermission` there
  takes `permissions` and no `adminModeOnly`.
- **The apps never import from each other.** Anything both need goes in `@mik/ui` (or
  `@mik/contracts`, if the backend needs it too).
- **Admin pages live in `apps/admin`, instructor pages stay in `apps/frontend`.** The
  dividing line from #1233: back-office work moves, but anything a flight instructor uses
  during a lesson stays in the member app, because they are on a phone or tablet on the
  apron, not at a desk. When in doubt, ask which device the person is holding.

  The calls already made, so they don't get relitigated page by page:

  | Stayed in the member app                                                    | Moved to the admin app                                 |
  | --------------------------------------------------------------------------- | ------------------------------------------------------ |
  | Flight-log validation and correction (`LogbookPage`) — done at the aircraft | The four admin dashboard widgets — queues of desk work |
  | Occurrence/safety-report processing — reports are chased in the field       | Commercial flight-time reporting (out of `Stats`)      |
  | `RecentFuelings` — a log for the members who did the fuelling               | Fuel-price and local-price editing                     |
  | Document _browsing_                                                         | Document upload, edit and delete                       |
  | Inventory browsing                                                          | Low-stock warnings and the item audit trail            |

  A page that keeps an admin branch keeps it deliberately; if you are adding one, say in
  the code why the device argument puts it on that side.

- **Crossing between the apps** is `AdminAppRedirect` (member → admin, by rewriting the
  path prefix) and `MemberAppLink` (admin → member, for the flight-log links the admin
  dashboard still needs). Both do a full page load, because the destination is a separate
  bundle. Neither app should ever `<Link to>` a route the other owns.

- **The environment badge next to the logo is shared logic, app-local wiring.**
  `apps/frontend`'s `Header` and `apps/admin`'s `AdminLayout` sidebar each show
  `envLabel(import.meta.env.VITE_API_TARGET)` next to the MIK logo — hidden in production
  (`'intra'`), shown otherwise (`'beta'`, `'local'`, or whatever else the target resolves
  to). Compute it inside the component, not at module scope: `import.meta.env.VITE_*` is
  read live under Vitest, so a module-level constant is captured once at first import and
  never sees a later `vi.stubEnv` in a test — this bit both apps once already.

  Both resolve the other app's base URL themselves from `VITE_API_TARGET` — the one env
  var already set per environment, identical in both apps, whose host **is** the member
  app's own domain (`intra`/`beta`) and maps to the admin app's differently-named one
  (`twr`/`beta-twr`) via a small table in `@mik/ui/utils/deploymentEnv`. In development
  `VITE_API_TARGET` is unset, so both fall back to the other app's Vite port — `pnpm dev`
  at the repo root starts the backend and **both** front ends for that reason, since with
  only one running, every cross-app link lands on the running app's 404 page.
  `VITE_ADMIN_URL`/`VITE_MEMBER_URL` override the derived value if you ever need to.

- **Moving a route means moving its menu entry.** They are separate edits and the second
  one is easy to forget: #1233 removed the `/accounting` routes three PRs before anyone
  noticed the member app still offered thirteen invoicing menu items that 404'd on click.
  `apps/frontend/src/config/menuItems.test.ts` now fails on a menu item that matches no
  route, _and_ on one that matches only an `AdminAppRedirect` route — the second check is
  the one that catches this, since a redirect makes a dead link look alive.
  `apps/admin`'s equivalent lives in its `AppRoutes.permissions.test.tsx`.
- **Where a page is genuinely shared, the capability is a prop.** `DocumentsPage` takes
  `canManage`; `apps/frontend` renders it with the default `false` and cannot turn it on,
  `apps/admin` passes its permission check. That is what "removed from the member UI"
  means for a screen both audiences use — not a second copy of the page.
- **`apps/admin`'s paths mirror the member app's old ones** — `/admin/shop/orders` →
  `/shop/orders`, `/accounting/items` → `/accounting/items` unchanged — so
  `AdminAppRedirect` in the member app forwards an old bookmark by rewriting the prefix
  and nothing else. Keep that correspondence when adding a route that used to exist over
  there, and add a case to that component if a new prefix needs a different mapping.
- **The sidebar and the route gates must agree.** `apps/admin/src/config/navItems.ts`
  lists each item's permissions and `AppRoutes.tsx` gates the route; a test in
  `AppRoutes.permissions.test.tsx` fails if they diverge, because a visible menu item that
  leads to a 403 is worse than no item at all.
- **Both apps run a route permission matrix**: every route visited by every identity,
  asserting the gate. `apps/frontend` uses five identities (its four plus sudo-off);
  `apps/admin` uses five without the sudo axis — notably `clubAdmin`, who holds the club's
  real ADMIN role and so is _not_ a superuser (that role grants `MEMBER_ADMIN` but not
  `STORE_ADMIN`, `EXAM_ADMIN`, `DTO_ADMIN` …). Add a route, add its row.

## Shared Frontend Code (`@mik/ui`)

`packages/ui` holds what both frontends render: generic MUI components, browser-side
utils, the domain API clients, and the i18n bundle. It is the presentation-layer sibling
of `@mik/contracts` and follows the same conventions — subpath exports, no barrel file,
no build step, TypeScript source consumed directly by Vite and Vitest.

```ts
import Title from '@mik/ui/components/Title'
import { formatDateInTz } from '@mik/ui/utils/date'
import * as dtoApi from '@mik/ui/api/dtoApi'
```

|                              | `@mik/contracts`          | `@mik/ui`         |
| ---------------------------- | ------------------------- | ----------------- |
| Shared with                  | backend **and** both apps | the two apps only |
| May import React / MUI / DOM | no                        | yes               |
| May import Node builtins     | no                        | no                |

Rules:

- **Nothing app-specific.** A component belongs there only if both apps render it
  unchanged. `Header`, `Footer`, `AdminToggle`, each app's `theme/` and each app's
  `menuItems`/`navItems` are app-local because they encode one app's identity.
- **`useApi` lives here, and so do the identity hooks.** There is one implementation for
  both apps; what they disagree on comes from two contexts each app provides at its root:

  | Context             | Supplies                            | `apps/frontend`    | `apps/admin`       |
  | ------------------- | ----------------------------------- | ------------------ | ------------------ |
  | `ApiConfigProvider` | whether requests carry admin rights | the sudo toggle    | constant `true`    |
  | `TimezoneProvider`  | UTC or local timestamps             | its `ThemeContext` | its `ThemeContext` |

  Both throw when the provider is missing rather than defaulting: a silent fallback for
  `sudo` would either lose admin rights everywhere or grant them everywhere, and both are
  far worse to diagnose than a throw. `useRoles`'s `hasSudoAccess` reads the _same_ flag
  `useApi` sends as `x-sudo`, so the UI can never offer an action the request would then
  be refused for.

  This is what makes a self-fetching component shareable at all — `LineItemsTable`,
  `SelectMember`, `InvoicePdfLink` and `FlightListEntry` all needed it. Follow the same
  pattern for anything else that differs per app: one implementation, the difference in a
  context.

- **No Node builtins and no `process`.** `tsconfig.json` omits `@types/node` and
  `eslint.config.js` blocks the globals by name, the same two-layer guard
  `packages/contracts` uses. Environment values come from `import.meta.env`.
- **Its test harness is deliberately minimal** — i18n plus MUI's _default_ theme, not
  either app's. A component that only renders correctly under `apps/frontend`'s palette is
  app-specific and does not belong there.
- **Member and role fixtures live there too** (`@mik/ui/test/fixtures/{cast,roles,members}`),
  because a permission-gate test needs the same cast on both sides. App-specific fixtures
  (aircraft, bookings, flight logs) stay in the app that uses them.
- **`components/expenseShared.tsx` and `api/{dtoApi,examApi}.ts` have no tests.** They
  never had any in `apps/frontend` either — they sat under its 43% `src/sections` bar —
  and between them they are ~310 statements, which is why `src/components` and `src/api`
  carry the low bars they do in `vitest.config.ts`. They are the next thing to earn a
  raise, not a precedent.
- CI holds `packages/ui` at **zero** ESLint errors and runs it as its own job in
  `intra-frontend-review.yml`, since a break there breaks both apps.

## Shared Contracts (`@mik/contracts`)

Every Zod request/response model lives in `packages/contracts/src/<domain>.ts`, imported as
`@mik/contracts/<domain>` by **both** apps. `packages/contracts/src/<domain>.ts` mirrors
`apps/backend/src/routes/<domain>/` one-for-one, so `routes/members/api.ts` and the frontend's
member pages both import `@mik/contracts/members`.

```ts
import { MIKPermissions, type Member } from '@mik/contracts/members'
import type { Problem } from '@mik/contracts/problem'
import { AuditableSchema, PaginationSchema } from '@mik/contracts/schema'
```

Rules:

- **The frontend must never import from `apps/backend/src`.** It used to, through an
  `@backend/*` path alias, which meant a component could pull in `db/connection.ts` or
  `dotenv` with nothing to stop it. The alias is gone and an ESLint `no-restricted-imports`
  rule in `apps/frontend/eslint.config.js` fails the build on `@backend/*` and on relative
  paths into `backend/src`. Add the model to `@mik/contracts` instead.
- **`packages/contracts` must stay isomorphic.** No Node builtins, no `process.env`, no
  `Buffer`, no Express/Kysely/`pg`. Its `tsconfig.json` sets `"types": []` so Node globals
  don't typecheck, and its `eslint.config.js` blocks the server-only packages by name.
  Anything environment-derived is a **parameter** the backend passes in — see
  `createExpenseClaimSchema(maxMileageKm)` (the backend reads `MILEAGE_MAX_KM` at the parse
  site) and `buildBookingIcs(booking, { organizerEmail })`.
- **Server behaviour stays in the backend.** A schema belongs in contracts; the `problem()`
  call that reacts to it failing does not — see `DocumentIdSchema` in
  `@mik/contracts/documents` versus `validateDocumentId` in `routes/documents/documentId.ts`.
- The package ships TypeScript source and has **no build step** — `tsx`, Vite, Jest and
  Vitest all consume `src/*.ts` directly. Its `build` script is a `tsc --noEmit` typecheck.
- No barrel/`index.ts`: subpath exports (`"./*": "./src/*.ts"`) keep unrelated domains out
  of each other's dependency graph.
- Adding a file to `packages/contracts/src/` is all that's needed — the `exports` wildcard
  picks it up. Adding a **new** package under `packages/` also needs a `COPY` line in the
  `Dockerfile` if the backend depends on it at runtime.
- **Tests live with the package**, in `packages/contracts/test/`, run with Vitest
  (`pnpm --filter @mik/contracts test`). Both apps depend on this code, so neither app's
  suite owns it. CI runs it in the backend workflow.
- Two tsconfigs on purpose: `tsconfig.json` covers `src/` **only** and has no Node types
  (that's the isomorphism guard); `tsconfig.test.json` covers the tests, which do need
  them. Merging them silently disables the guard, so `eslint.config.js` also blocks
  `process`/`Buffer`/`__dirname` in `src/**` as a second line of defence.
- CI holds `packages/contracts` at **zero** ESLint errors (it has no inherited backlog,
  unlike the two apps' ratcheted thresholds).

## Background Workers

Every scheduled worker is declared with the `defineWorker()` factory in `apps/backend/src/workers/defineWorker.ts` — do not hand-roll the enabled-check / schedule / stop scaffold again:

```ts
export const startMyWorker = defineWorker<MyWorkerDeps>({
  name: 'My Worker', // used verbatim in every log line
  envPrefix: 'MY_WORKER', // reads MY_WORKER_ENABLED, MY_WORKER_RUN_ON_STARTUP
  schedule: '0 3 * * *',
  scheduleDescription: 'daily at 03:00',
  runOnStartup: true, // omit unless the job is safe to run at boot
  run: ({ sendEmailFn = sendEmail }) => processMyThing(sendEmailFn),
})
```

Rules:

- `<PREFIX>_ENABLED=true` is what starts a worker. A disabled worker still returns a handle whose `stop()` is a no-op, so startup and shutdown stay a plain loop.
- **Only set `runOnStartup` when running the job at boot is harmless.** The email fan-out workers deliberately leave it off so a redeploy can't blast members with duplicate mail.
- Register the worker in `apps/backend/src/workers/registry.ts`. `app.ts` starts and stops everything in that array — it should never import an individual worker.
- Long-running loop/interval workers (`simplbooksOutboxWorker`, `brevoSyncWorker`, `simplbooksMemberSyncWorker`) are not cron-based and are not built with the factory, but they still go in the registry since they return the same `{ stop }` handle.
- Keep the job function exported separately from the worker declaration so tests can call it directly.

## Email Templates

Emails are data, not code. Every markdown-backed email is one entry in `apps/backend/src/templates/registry.ts`, rendered through `renderEmail(key, lang, vars)` from `renderEmail.ts`:

```ts
const { subject, html } = renderEmail('booking-confirmed', member.lang, vars)
await sendEmail(member.email, subject, html)
```

Rules:

- To add an email: drop `<key>-en.md`, `<key>-fi.md` and `<key>-sv.md` into `apps/backend/src/templates/`, add one registry entry with the three subjects, add the vars the markdown needs to `EmailTemplateVars` in the same file, and call `renderEmail`. **Do not create a new `*EmailTemplate.ts` wrapper.**
- The registry key _is_ the markdown filename prefix. A test asserts every declared key/language pair has a file on disk.
- `renderEmail` is typed per key against `EmailTemplateVars`, so a missing or misspelled var is a compile error rather than an empty `{{firstName}}` in someone's inbox. A new key with no entry there does not compile.
- Subjects are Handlebars strings rendered against the same vars as the body (`'Expense claim approved: {{claimTitle}}'`) and are not HTML-escaped.
- Anything that is not `fi` or `sv` — including `undefined` — renders in English. Never build a template filename from a raw `lang` value.
- Use `footer` for the small-print disclaimer line, `defaults` for constants the markdown needs but callers shouldn't pass (a function, so env vars are read at send time), and `languages` for templates that exist only in English.
- Subject, footer and body always come out in one language: a template restricted by `languages` renders its English subject and footer too, rather than pairing a Finnish subject with an English body.
- `defaults` win over caller-supplied vars, so a payload spread from a domain object can never redirect a constant like `BILLING_EMAIL`.
- Anything the registry can't express as data (building vars from a domain object, non-email text) belongs in a helper next to it — see `bookingEmailHelpers.ts`, `occurrenceEmailHelpers.ts` and `qualificationExpiryEmailTemplate.ts`. One helper per domain object, shared by every email that renders it.
- `test/templates/email.test.ts` snapshots the rendered HTML of every template in all three languages. If a change to shared rendering updates those snapshots, that is a real change to what members receive — review it, don't just `-u`.

## Frontend API Paths

Every API path the frontend calls lives in `apps/frontend/src/api/endpoints.ts`, never as a
string at the call site:

```ts
import { absolute, endpoints } from '../../api/endpoints'

const { data, mutation } = useApi<Member>({ url: endpoints.members.byId(memberId) })
await mutation.trigger('POST', {}, absolute(endpoints.members.restore(memberId)))
```

Rules:

- **Paths carry no leading slash and no query string.** They must match what `useApi`'s
  `url` wants, because `useApi` keys its SWR cache on `[url, params]` — so a `mutate()`
  that revalidates a resource has to reproduce the _exact_ string the fetching component
  passed. Two hand-built copies can differ and the revalidation then silently does
  nothing; two calls to the same registry function cannot.
- **Query strings go in `params`**, which `useApi` serialises _and_ includes in the cache
  key. Baked into the path they are invisible to both.
- **Anything variable is a function** (`byId(id)`), so a caller cannot forget a segment.
  This is also what makes `tsc` catch a possibly-undefined id — the raw template literal
  it replaced would happily fetch `v1/members/undefined`.
- Use `absolute(...)` for the third argument of `trigger`, which replaces the hook's `url`
  when the path starts with `/` and appends to it otherwise.
- **An ESLint rule enforces this per domain.** `no-restricted-syntax` in
  `apps/frontend/eslint.config.js` rejects a raw `'v1/…'` literal for every domain already
  migrated. Migrating a domain means adding its paths here, moving its call sites, and
  adding it to that rule's list so it cannot regress. Tests are exempt: an MSW handler
  asserting `apiUrl('v1/members/:memberId')` is stating the wire path on purpose.
- Migration is **domain by domain** and the two styles coexist meanwhile (#1115 §6). The
  rule's list is the record of which domains are done.

## Database Layer

`apps/backend/src/db/connection.ts` exports **one** Kysely instance, `db`, over one pg
pool. Column names are camelCase in both directions: you write `noteId`, Postgres
receives `note_id`, and rows come back `noteId` with no hand-written mapper. Types come
from `schema.d.ts`, regenerated by `pnpm schema` (`kysely-codegen --camel-case`).

**Read `apps/backend/src/db/DATA_LAYER.md` before writing queries.** The translation
between the two spellings has sharp edges that `tsc` cannot see. The three that bite
hardest:

- **Never rewrite the inside of a raw `sql` template.** Raw SQL text is emitted verbatim,
  so column names in there must stay snake_case. Only the _result keys_ are camelCased.
- **`maintainNestedObjectKeys: true` is mandatory** on the plugin. Without it the keys
  _inside_ JSONB values get rewritten too, which would corrupt the `*_audit` tables'
  `to_jsonb(OLD)` row snapshots, `outbox.payload`, and Emmett's event-store columns.
- **The camel → snake round trip is not lossless.** A digit is a word boundary going
  snake → camel but not back, so `stats.occurrences_per_100h_by_ac_yr` typechecks as
  `occurrencesPer100hByAcYr` and then fails at runtime. That view is queried with raw
  SQL. It is the only one in the database; the whole schema has been audited.

Rename identifiers, never data: strings that merely look like columns (sequence names,
enum values, contract field names) are the most common way to break a change here.

## Database Schema Management

### Branch discipline for SQL files

**NEVER modify SQL files that are already deployed to production or present in the `main` branch.** Flyway tracks a checksum for every applied migration; modifying an existing file causes a checksum-mismatch error and breaks all deployments.

This applies to both:

- **Schema migrations** — `sql/schema/migration/V*.sql`
- **Static-data migrations** — `sql/schema/static_data/V*.sql` (deployed to production via `flyway_staticdata_full.sh`)

The only SQL files that may be created **or** modified in a feature branch are new files that were **created in that branch** (i.e. they do not yet appear in `main`).

If a correction to existing data or logic is needed, create a new, higher-versioned migration file instead of editing the deployed one.

**NEVER insert a migration with a version number that falls between already-deployed versions.** Flyway processes migrations in strict version order. Any new migration must use a version number _higher than the highest already-deployed version_ — it must be appended at the end of the sequence. Inserting an out-of-order version (e.g. V436 when V440 is already deployed) causes an out-of-order error and breaks all deployments.

**New migration version numbers must increment by 10 from the current highest version** (e.g. V2000, V2010, V2020, V2030, V2040 ...). This leaves room to insert files later if needed without renumbering anything already deployed. To pick the next version: find the highest existing version in `sql/schema/migration/V*.sql` and add 10 to it — do not just add 1.

**NEVER use `CREATE SCHEMA` in Flyway migration SQL files.** PostgreSQL schemas (e.g. `dto`, `member`, `flight`) are created automatically by Flyway based on the `flyway.schemas` property in the Flyway configuration files (`sql/migration.conf`, `sql/migration_prod.conf`). To add a new schema:

1. Add the schema name to the `flyway.schemas` list in `sql/migration.conf` (and `sql/migration_prod.conf` if needed).
2. Use the schema directly in migration SQL (e.g. `CREATE TABLE dto.my_table ...`) without any preceding `CREATE SCHEMA` statement.
3. **In the same migration, grant `USAGE` on the new schema to the app DB role**, e.g. `GRANT USAGE ON SCHEMA dto TO ${app_db_user};`. A newly created schema does not grant `USAGE` to `PUBLIC` by default, so table-level grants alone are not enough — the app's runtime DB role (`mik_app_prod`/`mik_app_test`) will get `permission denied for schema <name>` on every query against it otherwise. This is easy to miss locally because local dev connects as the `admin` superuser, which bypasses all grants; the failure only shows up against the restricted production/test role.

### Postgres extensions

`pg_trgm` is the only extension this database installs, added by
`V2150__AddFindingSearchIndexes.sql` for the defect/remark search (#1230): it supplies
`similarity()` and the GIN trigram indexes that make `description ILIKE '%fragment%'`
indexable. Three things about it are worth knowing before adding another:

- It is installed **`WITH SCHEMA public`**, and the query module calls it fully qualified
  (`public.similarity(...)`). An unqualified call would depend on whatever `search_path`
  the pool happens to have, which is not the same as Flyway's.
- It needs no superuser. `pg_trgm` has been a _trusted_ extension since PostgreSQL 13, so
  `CREATE` on the database is enough — which the Flyway role has everywhere (the DO
  managed cluster's admin user in the deploy workflows, `admin` locally and in CI). An
  untrusted extension would not install on the managed cluster at all; check before
  reaching for one.
- `CREATE EXTENSION IF NOT EXISTS` is what makes it survive `flyway clean`, which the
  local `baseline_database.sh` runs every time.

## Browser Login Flow

When a browser opens and shows the login screen, test both users:

### Normal User Login

1. Enter `chris.whellams@gmail.com` in the email field and submit
2. Find the magic link/code in the backend stdout — look in the terminal running `pnpm dev` for a line containing `DEV magic link`
3. Paste the login URL into the browser or enter the verification code shown in the browser
4. Verify the app loads correctly at http://localhost:5173/

### Admin User Login

1. Enter `juho.kolehmainen@iki.fi` in the email field and submit
2. Find the magic link/code in the backend stdout — look in the terminal running `pnpm dev` for a line containing `DEV magic link`
3. Paste the login URL into the browser or enter the verification code shown in the browser
4. After login, use the admin/sudo toggle in the header (the admin/user icon; check its tooltip text if needed) to activate admin privileges
5. Verify admin features are accessible at http://localhost:5173/

## Stacked Pull Requests

Work that splits into dependent parts ships as a **stack**: each PR targets the branch
below it, the bottom one targets `main`. GitHub supports this natively (public preview
since July 2026) — reviewers get one PR per idea, and each diff contains only its own
commits rather than everything underneath.

**Chaining the base branches is not enough.** A PR whose base is another feature branch is
just a PR with an unusual base: no stack icon, no stack map in the merge box, and nothing
in the UI relating it to its neighbours. The stack has to be registered with GitHub, and
that is what `gh stack` does. Getting this wrong is invisible — everything looks fine from
the command line, because `gh pr view` reports exactly the base you set.

```bash
gh extension install github/gh-stack     # once; needs gh >= 2.0
```

| Task                                                 | Command                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| Start a new stack                                    | `gh stack init -b main`, then `gh stack add` per branch                          |
| Push branches and open/refresh the PRs               | `gh stack submit`                                                                |
| **Register PRs or branches that already exist**      | `gh stack link <bottom> … <top>`                                                 |
| Adopt an existing stack locally                      | `gh stack checkout <stack-number>`                                               |
| See the stack and its check status                   | `gh stack view`                                                                  |
| Re-sync after `main` moves                           | `gh stack sync` (fetch, fast-forward trunk, cascade rebase, push, sync PR state) |
| Move around                                          | `gh stack up` / `down` / `top` / `bottom` / `switch`                             |
| Restructure (drop, combine, insert, reorder, rename) | `gh stack modify`                                                                |
| Merge                                                | `gh stack merge`, or merge in the UI                                             |

`gh stack link` takes its arguments **bottom to top**, and accepts branch names, PR numbers
or PR URLs interchangeably. It creates PRs for branches that do not have one and adopts
those that do, so it is the way to rescue a stack that was assembled by hand. It
deliberately sets up no local tracking; follow it with `gh stack checkout <n>` if you want
`gh stack view` and friends to work in the worktree.

Things worth knowing before you rely on it:

- **CI runs on every PR in the stack.** The checks configured for pull requests against the
  default branch run mid-stack too, even though those PRs target a feature branch. So do
  branch protection rules and CODEOWNER approvals. You do **not** need to add the stack's
  branch pattern to a workflow's `pull_request.branches` filter to get checks — that was
  assumed once here and it was wrong.
- **Merging mid-stack is allowed.** Everything below it merges too, and the PRs above stay
  open and re-target automatically. Merge commit, squash and rebase are all supported.
- **Do not hand-maintain a stack table in the PR body.** The merge box renders the stack
  map, including each PR's status. A table written by hand duplicates it and then goes
  stale on the first reorder.
- **Same repository only.** Cross-fork stacks are not supported, and neither is GitHub
  Desktop.

## Changelogs

Changelog files live in `changelogs/` at the repo root, one file per comparison, named:

```
changelogs/CHANGELOG-<from-version>-to-<to-version>.md
```

e.g. `changelogs/CHANGELOG-v1.1.70-to-v1.1.112.md`. Never overwrite an existing changelog file — each comparison gets its own file. Do not maintain a single running `CHANGELOG.md`.

When asked to generate a changelog:

1. Determine the version range: default the "from" version to the latest production release tag (`git tag -l` sorted by version, e.g. `vX.Y.Z`) unless the user specifies otherwise. The "to" version is the current `version` in the root `package.json` (or the version being released, if generating as part of a version bump).
2. Gather the changes with `git log <from-tag>..HEAD --oneline --no-merges`, focusing on commits/PR titles matching `(#NNN)` — these correspond to merged PRs and are the unit of a changelog entry. Ignore version-bump-only commits (e.g. `V1 1 78 (#885)`).
3. Group the output into three sections, most important first:
   - **Major features** — new user-facing capabilities or modules. One bullet per feature, succinct (what it does, not implementation detail).
   - **Notable fixes & security** — bug fixes or security fixes with real user/operational impact (data integrity, incorrect calculations, security leaks, broken workflows). Skip cosmetic or trivial fixes here.
   - **Minor changes** — a sub-list (not full bullets) for everything else worth mentioning but not important enough for the sections above: small bug fixes, validation tweaks, dependency bumps, CI/deploy fixes, minor UX tweaks.
4. Skip pure chores with no user-visible effect (formatting-only commits, routine Dependabot bumps beyond one summary line, individual iterative "fix: address review feedback" commits that are part of an already-listed PR).
5. If unsure whether something is major or minor, put it in the minor changes sub-list rather than omitting it or inflating the major list.
6. Save the result to `changelogs/CHANGELOG-<from-version>-to-<to-version>.md` using the same structure as existing changelog files in that folder.

## CI/CD Requirements

The GitHub Actions workflows require:

- ESLint error count below each project's ratchet (frontend 5, admin 0, backend 66,
  `packages/contracts` 0, `packages/ui` 0). The ratchets live in the workflow files
  themselves (`THRESHOLD=` in `backend-intra-api-review.yml` and
  `intra-frontend-review.yml`) and **may only ever be lowered** — those files are the
  source of truth if this list falls behind again.
- Prettier formatting compliance (`pnpm format:check`)
- Successful build completion
- PostgreSQL service for backend tests
- Frontend test coverage above each directory's ratchet, enforced by
  `coverage.thresholds` in `apps/frontend/vitest.config.ts` — the bars are per directory
  (`src/api`, `src/hooks`, `src/components`, `src/utils`, `src/sections`, and one shared
  bar for the small remainder) rather than one global number, and **may only ever be
  raised**. The rationale and the current numbers are documented there and in
  `apps/frontend/src/test/README.md`. Backend coverage is still collected and uploaded as
  an artifact but is not gated.

Both app workflows also trigger on `packages/**`, since a change to `@mik/contracts` can
break either app.

The backend workflow also builds the production Docker image and starts it far enough to
confirm every `packages/*` the backend imports resolves inside it. **A new workspace package
needs a `COPY` line in the `Dockerfile`** — its manifest before `pnpm install`, its `src/`
after — or the image builds fine and then crashes on boot.

Always run `pnpm format` and `pnpm build` before committing changes to ensure CI passes.

## Cloudflare Services

Three unrelated Cloudflare products are in play. Their credentials look alike and are easy
to confuse for one another.

**Turnstile** — the human check on the login and registration screens. Self-contained; it
needs no Cloudflare account API token.

| Name                      | Used by                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `VITE_TURNSTILE_SITE_KEY` | frontend and admin builds, wired in `.do/mik-intranet-{prod,test}.yaml` |
| `TURNSTILE_SECRET_KEY`    | backend — `apps/backend/src/services/turnstile.ts`                      |
| `TURNSTILE_ENABLED`       | backend — with `true` but no secret key the check **fails closed**      |

Verification posts the secret key to
`https://challenges.cloudflare.com/turnstile/v0/siteverify`; that endpoint authenticates on
the secret alone.

**R2** — off-site Postgres backups, via the S3-compatible
`CLOUDFLARE_R2_ACCESSKEY_ID` / `CLOUDFLARE_R2_SECRET_ACCESSKEY` pair used by
`.do/pg-backup-job.yaml` and `deploy-backup-job.yml`.

**Unattributed** — `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_API_KEY` are repository secrets
that nothing in this repo reads. They are **not** Turnstile and **not** R2; both of those
have their own credentials above. What they grant cannot be established from the repository
— the token's name and permission scope in the Cloudflare dashboard will say. Do not assume
they are unused and delete them.

## SimplBooks Dry-Run Mode

The outbox worker supports a dry-run mode for testing invoice generation locally or in the beta environment **without making any HTTP calls to SimplBooks**.

### Enabling dry-run

Add to `apps/backend/.env`:

```
SIMPLBOOKS_DRY_RUN=true
```

`NODE_ENV=production` always overrides this to `false` (logs a critical error if set). It is safe to commit the flag as `false` or absent in production config.

### What dry-run does

| Outbox event       | Dry-run behaviour                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADD_MEMBER`       | Assigns a fake timestamp-based `billingId`; no SimplBooks client is created                                                                                                                        |
| `NEW_MEMBER_FEES`  | Builds the full invoice payload, then skips the SimplBooks API call; stores a synthetic invoice row in `accts.invoice` and embeds the task/line-item data in the `SEND_INVOICE_PDF` outbox payload |
| `SEND_INVOICE_PDF` | Skips fetching invoice + PDF from SimplBooks; sends a real email with full line-item table rendered from the embedded tasks                                                                        |

The email is clearly marked `[DEV DRY RUN]` in the subject and includes a warning banner. No PDF is attached.

### Key files

- `apps/backend/src/services/simplbooks/simplbooksDryRun.ts` — `isDryRunEnabled()`, `generateDryRunInvoiceId()`, `DryRunTask`
- `apps/backend/src/services/simplbooks/simplbooksOutboxHandler.ts` — dry-run branches in `createInvoice()` and `addMember()`
- `apps/backend/src/services/simplbooks/simplBooksEmailer.ts` — `sendDryRunInvoiceEmail()`

## SimplBooks Mock API

The `simplbooks/` directory holds the downloaded SimplBooks OpenAPI spec and two local mock
servers. It is **not** a pnpm workspace member — it uses npm and its own `package-lock.json`,
and its scripts run under `node --experimental-transform-types` rather than `tsx`.

The two mocks in this directory are local-only development aids — nothing in `simplbooks/`
is built or deployed by any workflow here. Note that a set of secrets and variables for a
_hosted_ mock does exist in GitHub settings; see "Hosted mock" below before assuming there
is nothing deployed anywhere.

| Path                            | What it is                                                          |
| ------------------------------- | ------------------------------------------------------------------- |
| `simplbooks/src/app.ts`         | Downloads the SimplBooks OpenAPI spec and resolves its `$ref`s      |
| `simplbooks/src/mock-server.ts` | The stateful "smart" mock (~665 lines, plain `node:http`)           |
| `simplbooks/simplbooks-api/`    | The downloaded spec — `api.yaml` plus split `paths/` and `schemas/` |

Point the backend at whichever mock you start:

```
SIMPLBOOKS_BASE_URI=http://127.0.0.1:4010
```

### Prism mock — spec-accurate, stateless

```bash
pnpm mock:simplbooks          # ./scripts/start-simplbooks-mock-server.sh
```

Runs Stoplight Prism against `simplbooks-api/api.yaml` on port 4011, fronted by a small
proxy on **4010** that strips the `/{companyId}/api` prefix the backend client sends and
rate-limits to 1 request/second (returning a real `429` with `Retry-After`, so the client's
backoff path gets exercised). Needs `SIMPLBOOKS_COMPANY_ID` in the environment or in
`apps/backend/.env`.

Responses come straight from the spec, so they are schema-correct but static — nothing you
create is remembered.

### Smart mock — stateful, generates PDFs and email

```bash
./scripts/start-simplbooks-smart-mock.sh
```

Listens on **4010** directly and covers every endpoint the backend calls. Unlike Prism it:

- persists clients and invoices in memory until restart
- generates a real PDF for each invoice via `pdfkit`
- emails that PDF when `invoices/sent` is called, honouring `DISABLE_EMAIL_SENDING` and the
  `SMTP_*` credentials it reads from `apps/backend/.env`
- serves the articles list from the OpenAPI fixture

Use this one when testing the invoice flow end to end; use Prism when you care about strict
spec conformance. Override the port with `SIMPLBOOKS_MOCK_PORT`.

To refresh the spec from SimplBooks:

```bash
cd simplbooks && npm start     # rewrites simplbooks-api/
```

### Hosted mock — credentials exist, source does not live here

These are configured in GitHub settings and are **not** discoverable from the repository,
so do not conclude from a `git grep` that they are unused or safe to delete:

| Name                          | Scope | Kind     | Referenced by a workflow in this repo |
| ----------------------------- | ----- | -------- | ------------------------------------- |
| `SIMPLBOOKS_MOCK_API_KEY`     | DEV   | secret   | no                                    |
| `SIMPLBOOKS_MOCK_ALLOWED_IPS` | DEV   | variable | no                                    |

Together these imply a hosted SimplBooks mock behind an API key and an IP allowlist. No
source for it, and no workflow that deploys it, is committed in this repository — so it is
either maintained elsewhere or is a leftover. **Confirm with whoever owns the deployment
before deleting either of them.**

List the current names (values are not retrievable for secrets) with:

```bash
gh api repos/MIK-dev-team/mik-ng/actions/secrets --jq '.secrets[].name'
gh api repos/MIK-dev-team/mik-ng/environments/DEV/variables --jq '.variables[].name'
```

Three names that earlier revisions of this document listed do **not** exist in settings, and
looking for them wastes time: `CLOUDFLARE_ACCOUNT_ID`, `SIMPLBOOKS_API_TOKEN` (the real
SimplBooks credentials are `SIMPLBOOKS_API_KEY`, plus `SIMPLBOOKS_API_KEY_PROD` in PROD) and
`SMTP_HOST`. Note also that `SMTP_LOGIN` is a _variable_, not a secret — only `SMTP_PASSWORD`
(and `SMTP_PASSWORD_PROD`) are secrets — and `DISABLE_EMAIL_SENDING` is neither; it is set in
`apps/backend/.env` and in the backend's own `test` script.

For the full environment variable and secret inventory, see
[`docs/github-actions-variables-setup.md`](../docs/github-actions-variables-setup.md).
