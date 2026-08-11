# MIK-NG Development Instructions

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap Environment

Install required tools:

```bash
# Install Node.js v24 (required for experimental transform types)
wget https://nodejs.org/dist/v24.15.0/node-v24.15.0-linux-x64.tar.xz
sudo tar -xf node-v24.15.0-linux-x64.tar.xz -C /opt/
sudo ln -sf /opt/node-v24.15.0-linux-x64/bin/node /usr/local/bin/node
sudo ln -sf /opt/node-v24.15.0-linux-x64/bin/npm /usr/local/bin/npm

# Install pnpm
npm install -g pnpm@10.11.0

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
# Backend development - requires Node.js v24 for --experimental-transform-types flag
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
# Note: Tests run successfully but may show teardown errors (safe to ignore)
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
- **Optional**: `BREVO_CAMPAIGN_ARCHIVE_ENABLED=true` enables the daily worker that archives sent Brevo newsletter campaigns as PDF documents (`newsletter` category). Requires the Brevo API key to have the `campaigns:read` scope. `BREVO_CAMPAIGN_ARCHIVE_RUN_ON_STARTUP=true` runs it once immediately in addition to the daily schedule. `PUPPETEER_EXECUTABLE_PATH` overrides the Chromium binary used for HTML-to-PDF rendering (defaults to `/usr/bin/chromium-browser`, installed via apk in the production Dockerfile — for local dev outside the Alpine image, point this at a local Chrome/Chromium install).

## Known Issues and Workarounds

1. **Node.js Version Requirement**: Backend dev mode requires Node.js v24 for `--experimental-transform-types` flag. V20 will not work.
2. **ESLint Configuration**: May fail due to missing `@eslint/js` dependency in backend
3. **Test Environment Variables**: Tests require SimplBooks API configuration to pass fully
4. **PostgreSQL Credentials**: Local development uses admin/password (never use in production)
5. **SimplBooks Config**: Ensure `SIMPLBOOKS_COMPANY_ID` is set in .env to prevent startup errors

## Project Structure

```
├── apps/
│   ├── backend/          # Node.js/Express API with TypeScript
│   └── frontend/         # React/Vite application
├── simplbooks/           # Cloudflare Worker — mock SimplBooks API (see below)
├── sql/                  # Database migrations and test data
├── scripts/              # Utility scripts for development
└── .github/workflows/    # CI/CD pipelines
```

## Key Development Files

Always check these locations when working on the codebase:

- `apps/backend/src/db/schema.d.ts` - Generated database types (run `pnpm schema` to regenerate)
- `apps/backend/.env` - Backend environment configuration
- `sql/schema/migration/` - Database schema migrations
- `sql/schema/testdata/` - Test data scripts
- `sql/migration.conf` - Flyway configuration (defines schemas via `flyway.schemas`)
- `simplbooks/src/worker/` - Cloudflare Worker source for the SimplBooks mock API
- `simplbooks/wrangler.toml` - Cloudflare Worker configuration (must set real `database_id` before first deploy)
- Package files: `package.json`, `apps/*/package.json`

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

- ESLint error count below 15 errors per project
- Prettier formatting compliance (`pnpm format:check`)
- Successful build completion
- PostgreSQL service for backend tests

Always run `pnpm format` and `pnpm build` before committing changes to ensure CI passes.

## Consolidating Chore PRs

Dependabot (and other automated tooling) opens one PR per dependency bump, which is noisy to review and merge individually. Periodically consolidate all open chore PRs into a single PR:

1. List open PRs and identify the "chore" ones — titles of the form `chore(deps): ...` / `chore(deps-dev): ...`, typically authored by `app/dependabot`: `gh pr list --state open --json number,title,author,headRefName`.
2. For each candidate PR, inspect its diff (`gh pr diff <number>`) to see the actual version bump(s) — don't just merge branches, since multiple PRs frequently touch `pnpm-lock.yaml` and will conflict. Note any duplicate/overlapping bumps (e.g. two PRs bumping the same package to the same version via different dependabot groupings) and only apply them once.
3. Create a single new branch off `main` (e.g. `chore/consolidate-dependency-bumps-<date>`) and manually apply each package.json version bump identified above, then run `pnpm install` once to regenerate `pnpm-lock.yaml` cleanly.
4. Run `pnpm format`, `pnpm build` (backend + frontend), and `pnpm test` on the consolidated branch. All must pass before opening the PR.
5. Push the branch and open a single PR summarizing every dependency bump it includes (list package name + old → new version for each).
6. Close each individual chore PR with a comment pointing to the consolidated PR (e.g. `Consolidated into #<new PR number>.`), then close it — do not merge the individual PRs.

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

## Cloudflare Worker — SimplBooks Mock API

The `simplbooks/` directory contains a Cloudflare Worker that mocks the SimplBooks API. It stores data in Cloudflare D1 (SQLite) and can generate PDF invoices and send emails.

### Local development

```bash
cd simplbooks
# Copy secrets file (never commit this)
cp .dev.vars.example .dev.vars   # fill in API_TOKEN and email credentials

# Create the local D1 database
npx wrangler d1 execute mik-simplbooks-db --local --file=src/d1-schema.sql

# Start local dev server (Miniflare simulation)
npx wrangler dev --local
# Worker available at http://localhost:8787
```

Test it:

```bash
curl -X GET http://localhost:8787/api/clients \
  -H "X-Simplbooks-Token: your_test_token"
```

### Deploying to Cloudflare

1. Create a D1 database: `npx wrangler d1 create mik-simplbooks-db`
2. Replace `database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"` in `simplbooks/wrangler.toml` with the real ID
3. Set secrets: `npx wrangler secret put SIMPLBOOKS_API_TOKEN` (and others listed in `wrangler.toml`)
4. Push `main` — the GitHub Actions workflow `deploy-simplbooks-worker.yml` deploys automatically when `simplbooks/` files change

### Security

- All requests require `X-Simplbooks-Token` header matching `SIMPLBOOKS_API_TOKEN` secret
- Optional IP allowlist: set `ALLOWED_IPS` secret to a comma-separated list of allowed IPs (e.g. your Digital Ocean droplet IP). Uses Cloudflare's `CF-Connecting-IP` header (cannot be spoofed). Leave unset to allow any IP.

### Required GitHub Secrets for CI/CD

| Secret                                     | Purpose                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`                     | Custom token with `Workers Scripts: Edit` + `D1: Edit` permissions |
| `CLOUDFLARE_ACCOUNT_ID`                    | Your Cloudflare account ID                                         |
| `SIMPLBOOKS_API_TOKEN`                     | Shared secret for `X-Simplbooks-Token` auth                        |
| `SIMPLBOOKS_MOCK_ALLOWED_IPS`              | Comma-separated IP allowlist (optional)                            |
| `SMTP_HOST`, `SMTP_LOGIN`, `SMTP_PASSWORD` | Email sending credentials                                          |
| `DISABLE_EMAIL_SENDING`                    | Set `false` in production, `true` otherwise                        |
