# Porting MIK-NG to Cloudflare, with multi-tenancy

## Context

MIK-NG is today a single-club flight-club intranet: an Express 5 backend (213 TS files,
~39k non-test LOC, **486 endpoints** across 50 route domains) running as a long-lived
container on DigitalOcean App Platform, two React SPAs served as DO static sites, an
external managed Postgres (**~129 tables, 49 views, 231 Flyway migrations**), DO Spaces for
files, and **14 background workers running inside the API process**.

Two things are driving the change, and they point the same way:

1. **Multi-tenant SaaS ambition** — other flying clubs should be able to sign up. The
   schema has _zero_ notion of a tenant today: no `club_id`, no `tenant_id`, no RLS. Every
   unique constraint, every view, and the SimplBooks/Brevo/SMTP integrations assume exactly
   one club.
2. **Ops simplicity** — the DO deploy path is ~90 hand-maintained env vars written into
   `$GITHUB_ENV` and applied with `doctl apps update`, plus a `.deploy_timestamp`
   force-push branch hack to make static sites rebuild. The 14 in-process workers make the
   API a stateful singleton that cannot be scaled or restarted freely.

Cloudflare is already partly in the path: Turnstile is live, CSP/HSTS come from a Cloudflare
edge rule (`apps/backend/src/app.ts` keys its fallback CSP off the `cf-ray` header), and the
weekly encrypted Postgres backup already lands in **R2** (`.do/pg-backup-job.yaml`).

The intended outcome: both SPAs and the whole API run on Cloudflare Workers; Postgres stays
Postgres, reached through **Hyperdrive**; DO Spaces becomes R2; the in-process workers become
Cron Triggers + Queues; SMTP becomes Cloudflare Email Sending; and the database grows a
`tenant_id` enforced by Postgres row-level security so one deployment serves many clubs.

**Approach: incremental strangler.** No big-bang rewrite of a 486-endpoint backend.

---

## Decisions up front

| Question                  | Decision                                                                | Why                                                                                                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rewrite in C#/.NET?       | **No**                                                                  | .NET cannot run on Workers at all; and it is a rewrite, not a port. See "Why not C#/.NET" below.                                                                                                                                                                                     |
| D1 for the core database? | **No**                                                                  | See "Why not D1" below — it is not close.                                                                                                                                                                                                                                            |
| Datastore                 | **External Postgres + Hyperdrive**                                      | Keeps the schema, Flyway, triggers, views, transactions, and RLS.                                                                                                                                                                                                                    |
| Postgres provider         | **Neon (eu-central-1)**, DO managed Postgres as the do-nothing fallback | Scale-to-zero, branching (useful for per-tenant dev/restore), publicly reachable for Hyperdrive. Flyway is unaffected.                                                                                                                                                               |
| Static hosting            | **Workers with Static Assets**, not Pages                               | The Worker must own routing so `/api`, `/auth`, `/t` stay _same-origin_ with the SPA (DO's ingress does this today, and the service worker depends on it). Pages Functions can do it, but Workers Static Assets is the supported forward path and gives one deploy artefact per app. |
| Tenancy model             | **Shared DB, `tenant_id` column, Postgres RLS**                         | Detailed below — with `security_invoker` views and a column `DEFAULT`, this turns out to be dramatically cheaper than it first looks.                                                                                                                                                |
| Outbox vs Queues          | **Keep the outbox table, replace the _worker_ with Queues**             | Queues cannot enlist in a Postgres transaction. The table is what makes the enqueue atomic; Queues replace the polling loop, retries and DLQ.                                                                                                                                        |
| Backend framework         | **Hono**                                                                | Near-1:1 middleware equivalents for helmet/cors/cookie-parser; `c.req.formData()` replaces multer.                                                                                                                                                                                   |

---

## Why not C#/.NET (evaluated, ruled out)

Raised as an alternative — FastEndpoints, stricter typing, Marten. It is a genuine fork,
not an addition, and the decision is recorded here because **the worst outcome would be
doing the Workers port and then rewriting in C#**. This must not be reopened after Phase 2.

- **.NET cannot run on Cloudflare Workers.** `workerd` executes JS and WASM only; ASP.NET
  Core needs a CLR, GC, threads and raw sockets, and Npgsql/Marten all assume a normal .NET
  process. Choosing C# means choosing a container origin (Cloudflare Containers, Azure
  Container Apps, Fly.io) and dropping Workers/Hyperdrive/bindings from the API tier — i.e.
  re-acquiring the container ops burden this migration exists to shed.
- **It is a rewrite, not a port.** The largest saving in this plan is that the **62 Kysely
  query modules, 65 transactions and essentially all business logic move to Workers
  untouched** — only the Express/Node shell changes. In C# none of that survives: 486
  endpoints, ~39k LOC, 95 email templates, 14 workers. Estimate 2–4× the effort.
- **`packages/contracts` stops being shared.** 8k LOC of Zod models consumed today by the
  backend _and_ both SPAs would become frontend-only, requiring an OpenAPI→TS codegen
  pipeline to keep parity. That is a permanent tax, not a one-off cost.
- **The strong parts of the C# case do not change the answer.** Marten is a better event
  store than the hand-vendored Emmett schema, and Finbuckle.MultiTenant is more mature than
  the RLS scheme in Phase 7 — but **the tenancy work lives in Postgres and is
  language-independent**, so C# buys convenience around the edges of the hardest phase, not
  the phase itself.

If C# remains the long-term preference, express it by writing **new** services in C# behind
the same Cloudflare edge, not by relitigating 240k lines.

---

## Why not D1 (evaluated, ruled out)

The transaction gap the question raises is real (D1 has no interactive transactions — only
atomic `batch()`), and there are **65 `db.transaction()` call sites in 21 files**, 18 of them
in `services/simplbooks/simplbooksOutboxHandler.ts` alone. But transactions are not even the
blocking problem. The schema uses, in D1/SQLite terms, none-of-which-exist:

- **29 `CREATE FUNCTION` (28 PL/pgSQL)** and **14 triggers** — audit `to_jsonb(OLD)` snapshots
  on 8 tables, plus load-bearing business invariants: flight-log overlap (`V105`), unique
  booking (`V325`), inventory reservation capacity (`V2030`), liquid immutability (`V2060`).
- **The Emmett event store** (`V1060__EmmettEventStoreSchema.sql`, ~470 lines) — `xid8` /
  `pg_current_xact_id()`, `pg_try_advisory_xact_lock`, declarative `PARTITION BY LIST` with a
  nested sub-level, `DO $$` blocks, dynamic `EXECUTE format()`, plpgsql exception handling.
- **49 views** including 43 `stats.*` using `DISTINCT ON`, `FILTER (…)`, window functions,
  `LATERAL`, `generate_series`, `percentile_*`.
- **30 enum types**, **21 `GENERATED ALWAYS AS … STORED`** columns, **208 JSONB** usages,
  **23 partial indexes**, **104 CHECK constraints**, **266 FKs**, `FOR UPDATE SKIP LOCKED`
  (the outbox drainer), `pg_advisory_xact_lock` (occurrence attachments), `ON CONFLICT`.
- **The `pg_trgm` extension** (`V2150__AddFindingSearchIndexes.sql`) — `public.similarity()`
  plus GIN trigram indexes on `flight.defect.description` and `flight.remark.description`,
  which is what makes the defect/remark search's `ILIKE '%fragment%'` indexable. SQLite has
  no trigram operator class; FTS5 is a token-based model that does not answer the same
  query. A small feature that would need redesigning, not porting.

A D1 port means rewriting 8,867 lines of Flyway migrations, reimplementing every trigger in
application code, and rebuilding the event store. It also caps at 10 GB per database and
would push you toward D1-per-tenant, which sounds attractive for SaaS isolation but means N
migration runs, no cross-tenant reporting, and a per-tenant binding limit.

**Where D1 does earn a place:** nothing in phase 1. Consider it later only for a genuinely
separate, small, low-write concern (e.g. a signup/billing control-plane that must survive
the main DB being down). Do not split the domain across two engines for its own sake.

### Hyperdrive caveats to design around (not blockers, but sharp)

1. **Session state is unsafe outside a transaction.** Hyperdrive multiplexes connections, so
   `SET app.tenant_id` at session scope can leak between requests. Everything below uses
   `set_config('app.tenant_id', $1, true)` — **transaction-local** — which is exactly why the
   per-request transaction wrapper (Phase 2) is non-negotiable.
2. **Disable Hyperdrive query caching** for this app (`caching: { disabled: true }`). It is a
   read-your-writes-heavy admin app; a stale cached row in the flight log or invoice flow is
   a correctness bug, not a perf win.
3. **`options: '-c timezone=UTC'`** in `apps/backend/src/db/connection.ts` is a libpq startup
   parameter Hyperdrive will not forward. Replace with an explicit `SET TIME ZONE 'UTC'` (or
   `SET LOCAL`) issued at the top of the per-request transaction.
4. **The CA cert read from disk disappears.** `db/connection.ts:4` and `lib/eventStore.ts:6`
   `readFileSync` the DO CA cert; Hyperdrive terminates TLS to the origin itself, so the
   Worker needs neither the file nor the `ssl` config.
5. `pg.Pool` semantics are meaningless per-isolate — use a `Client` per request, closed via
   `ctx.waitUntil()`.

---

## Multi-tenancy: the recommendation

**Shared database, shared schema, `tenant_id uuid NOT NULL` on every business table,
isolation enforced by Postgres row-level security, with the application also filtering.**

Rejected: **schema-per-tenant** (Flyway must run N times; 49 views × N; `search_path` is
session state, which Hyperdrive makes hazardous — see caveat 1). Rejected:
**database-per-tenant** (one Hyperdrive config per tenant, a per-tenant Neon project, and no
cross-tenant reporting; revisit only if a club demands contractual data isolation, and then
as an _exception_ for that club, not the default).

### Why this is cheaper than the table count suggests

Three tricks collapse most of the work:

**1. A column `DEFAULT` means inserts do not change.** After backfill:

```sql
ALTER TABLE flight.logs
  ADD COLUMN tenant_id uuid NOT NULL DEFAULT '<MIK-uuid>';
-- once backfilled:
ALTER TABLE flight.logs
  ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;
```

Every existing `insertInto(...)` across the **62 query modules in `apps/backend/src/db/`**
keeps working untouched and writes the right tenant.

**2. RLS means selects/updates/deletes do not change either.**

```sql
ALTER TABLE flight.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight.logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON flight.logs
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
```

`FORCE` matters — without it the table owner bypasses the policy, and the app role may end
up owning these tables.

**3. `security_invoker = true` makes the 49 views tenant-correct for free.**

```sql
ALTER VIEW stats.flight_hours_by_ac_yr SET (security_invoker = true);
```

The view then executes with the caller's RLS applied to the base tables, so aggregates are
already scoped to one tenant — **the 43 `stats.*` views do not need `tenant_id` added to
their select lists and `GROUP BY`s**, which is the single largest saving in the whole
tenancy migration. (Requires PG 15+; Neon and DO managed PG are both well past that.)

### What genuinely does need hand work

| Item                                   | Count                                                                                    | Work                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant_id` + policy per table         | ~120 tables                                                                              | Generated migration (script the DDL, review the output)                                                                                                                                                                                                                                                                                                       |
| Unique constraints/indexes → composite | 14 unique indexes + PK/natural keys                                                      | Each `UNIQUE (email)` → `UNIQUE (tenant_id, email)`. Aircraft registration, member email, booking calendar sequence (`V860`).                                                                                                                                                                                                                                 |
| `accts.credit_note_number_seq`         | 1 sequence                                                                               | A sequence cannot be partitioned. Replace with a `accts.tenant_counter (tenant_id, name, value)` row updated `FOR UPDATE` inside the existing transaction. Note DATA_LAYER.md §"rename identifiers, never data" — the sequence name is a _string_ in `eb.val()`.                                                                                              |
| Audit tables                           | 8 trigger-driven + 2 app-written                                                         | The `to_jsonb(OLD)` snapshot picks `tenant_id` up for free; the audit table needs its own column, default, and policy.                                                                                                                                                                                                                                        |
| Emmett partitions                      | 1 per tenant                                                                             | Tenancy maps onto Emmett's existing `partition` column: `emt:tenant-<slug>`, created by `emt_add_partition()` at tenant provisioning.                                                                                                                                                                                                                         |
| Cross-tenant/global tables             | `static.*`, `public.secrets`, `public.notification_banner`, `public.fuel_prices_content` | Decide each: platform-global (no policy) vs per-tenant config (gets `tenant_id`). Most become per-tenant.                                                                                                                                                                                                                                                     |
| Per-tenant integration credentials     | SimplBooks, Brevo, sending domain, Turnstile                                             | Today these are process-wide env vars. They become rows in a new `public.tenant_integration` table, secrets encrypted with the existing `lib/fieldEncryption.ts` AES-256-GCM.                                                                                                                                                                                 |
| Hardcoded club identity                | `apps/backend/src/templates/registry.ts`                                                 | "Malmin Ilmailukerho" appears on many lines. Becomes a template var sourced from the tenant row.                                                                                                                                                                                                                                                              |
| GIN trigram indexes                    | 2 (`flight.defect`, `flight.remark`)                                                     | RLS filters correctly, but the planner may pick the trigram index and apply the tenant predicate as a filter afterwards. Re-`EXPLAIN` the defect/remark search (`V2150`) once RLS is on — a composite `(tenant_id, description)` B-tree does not help a trigram scan, so if it regresses the fix is `btree_gin` to get `tenant_id` into the GIN index itself. |

### New control-plane tables

```
public.tenant            (id uuid pk, slug citext unique, name, status, created_at, …)
public.tenant_domain     (tenant_id, hostname unique, is_primary)   -- host → tenant
public.tenant_integration(tenant_id, kind, config jsonb, secret_encrypted text)
public.tenant_feature    (tenant_id, key, value)                    -- per-club feature flags
```

`member.register` gains `tenant_id`, and **a person who belongs to two clubs is two member
rows** with two logins. Do not attempt a cross-tenant identity model in v1; it multiplies
the auth surface for a case that may never occur.

### Tenant resolution and the cookie problem — read this before choosing hostnames

Today `COOKIE_DOMAIN='.mik.fi'` deliberately shares the session between `intra.mik.fi` and
`twr.mik.fi`, and `COOKIE_PREFIX` (`intra_`/`beta_`) exists because a shared cookie name once
caused a production login loop (`apps/backend/src/routes/auth/cookies.ts` documents this at
length and `assertAuthCookieConfig()` refuses to boot without it).

**That mechanism does not survive multi-tenancy.** If tenants live at `club-a.app.tld` and
`club-b.app.tld`, and the member/admin split needs a shared cookie, the narrowest common
domain is `.app.tld` — and the cookie is then visible to _every tenant_.

**Recommendation: one hostname per tenant, admin under a path.**

```
<tenant>.mikapp.fi/            → member SPA
<tenant>.mikapp.fi/admin/      → admin SPA   (same origin, same Worker)
<tenant>.mikapp.fi/api/*       → API         (same origin — no CORS at all)
```

This: (a) lets the cookie be **host-only** — drop `COOKIE_DOMAIN` entirely, which is
strictly safer than any prefix scheme; (b) eliminates cross-origin admin calls and the
`CORS_ALLOWED_ORIGINS` allowlist; (c) preserves the same-origin `/t/:code` behaviour the
frontend service worker has hand-tuned rules for (`navigateFallbackDenylist: [/^\/t\/.*$/]`
plus a `NetworkOnly` rule in `apps/frontend/vite.config.ts`).

Costs: `apps/admin` must be built with `base: '/admin/'` (it currently pins `base: '/'` with
a comment that it is always at a subdomain root), and `packages/ui/src/utils/deploymentEnv.ts`
— which hardcodes the `intra→twr` / `beta→beta-twr` mapping — is replaced by a same-origin
path join. `AdminAppRedirect` and `MemberAppLink` become plain path rewrites.

Keep `intra.mik.fi` / `twr.mik.fi` as **aliases that resolve to tenant `mik`** so existing
bookmarks and the installed PWA keep working; the Worker maps host → tenant via
`public.tenant_domain`, cached in **Workers KV** (see below). During that alias period MIK
keeps its `COOKIE_DOMAIN`/`COOKIE_PREFIX` behaviour and new tenants do not get one — the
config becomes per-tenant, not per-deployment.

Wildcard DNS `*.mikapp.fi` + a Workers route `*.mikapp.fi/*` means **provisioning a tenant is
an INSERT, not a deploy** — which is the whole point.

### Defence in depth

RLS is the backstop, not the only line. Also add:

- The **request context** (below) carries `tenantId`; the JWT carries a `tid` claim; the
  middleware **401s if `tid` does not match the host-resolved tenant**. This stops a stolen
  cookie from a shared-domain era working anywhere else.
- A **Kysely plugin** that asserts (in dev/test only) that any query touching a
  tenant-scoped table ran inside a transaction with `app.tenant_id` set. Given DATA_LAYER.md's
  documented history of typecheck-clean silent bugs, a runtime assertion pays for itself.
- A test that enumerates every table in `schema.d.ts` and **fails if one lacks a
  tenant policy** — the tenancy equivalent of the existing route-permission matrix.

---

## Target architecture

```
                      *.mikapp.fi/*  (wildcard DNS, one Workers route)
                                  │
                    ┌─────────────▼──────────────┐
                    │  edge Worker (per app pair)│  Static Assets binding
                    │  /, /admin/  → SPA assets  │  host → tenant via KV
                    │  /api,/auth,/health,/t →──┐│
                    └───────────────────────────┼┘
                                                │  service binding
                    ┌───────────────────────────▼─────────────┐
                    │  API Worker (Hono)                      │
                    │  ported domains … + catch-all proxy ───►│──► legacy DO Express
                    └──┬────────┬────────┬────────┬───────────┘     (shrinks to zero)
                       │        │        │        │
              Hyperdrive│      R2│  Queues│  Email│  KV / Durable Objects
                       ▼        ▼        ▼        ▼
                 Neon Postgres  files  outbox   Email Sending
                 (RLS by tenant)       + cron
                                       fan-out
```

**Cloudflare resource map:**

| Concern                           | Today                                               | Cloudflare                                                                                           |
| --------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| SPAs                              | DO static sites                                     | Workers Static Assets (2 bundles, 1 Worker)                                                          |
| API                               | Express on DO container                             | Workers + Hono                                                                                       |
| Postgres                          | DO managed PG, `pg.Pool`                            | Neon + **Hyperdrive**                                                                                |
| Files                             | DO Spaces (`@aws-sdk/client-s3`)                    | **R2** binding, keys prefixed `t/<tenant>/…`                                                         |
| Outbox delivery                   | `while` loop + `FOR UPDATE SKIP LOCKED`             | **Queues** (outbox table stays)                                                                      |
| 12 cron workers                   | `node-cron` in-process                              | **Cron Triggers** → fan-out to Queues per tenant                                                     |
| 2 × 8h `setInterval` syncs        | in-process                                          | Cron Triggers                                                                                        |
| Email                             | nodemailer → Gmail SMTP                             | **Cloudflare Email Sending** binding                                                                 |
| Rate limiting                     | `RateLimiterMemory` (per-isolate → useless)         | Workers **rate-limiting binding** + edge rules; **Durable Object** where per-tenant fairness matters |
| SimplBooks 1 req/s serialisation  | module-level promise chain (breaks across isolates) | **Durable Object per tenant** as a token bucket                                                      |
| Host→tenant lookup, feature flags | n/a                                                 | **KV** (cache, ~60s TTL, DB as source of truth)                                                      |
| Logs                              | winston → Better Stack                              | `console` + Workers Logs, Logpush → Better Stack                                                     |
| Image processing                  | `sharp` (native)                                    | **Cloudflare Images** transformations                                                                |
| PDF                               | `pdfkit` (fs/AFM fonts)                             | `pdf-lib` (already a dep, pure JS); **Containers** if that proves too costly                         |
| Event store                       | `@event-driven-io/emmett-postgresql` (Node-only)    | Hand-rolled append/aggregate over the existing `emt_*` tables                                        |
| Backups                           | R2 already                                          | unchanged (repoint to Neon)                                                                          |

---

## Phase plan

Each phase is independently shippable and independently revertible. Phases 0–2 are the
foundation; nothing else can start until they land.

### Phase 0 — Provisioning and CI groundwork (no app change)

- Cloudflare account: Workers Paid, R2, Queues, Email Sending, Hyperdrive, KV.
- Neon project in `eu-central-1`; restore the latest R2 backup into it; point a **staging**
  Flyway at it and verify all 231 migrations replay clean (`./scripts/baseline_database.sh`
  against the Neon URL).
- Create the Hyperdrive config against Neon with **caching disabled**.
- New `infra/` or `wrangler/` directory with `wrangler.jsonc` per Worker. Secrets move from
  the `$GITHUB_ENV` blocks in `create-test-release-and-deploy-to-do.yml` /
  `prod-deploy-to-do.yml` to `wrangler secret bulk`.
- **Add a real bundling step to the backend.** Today the Dockerfile runs
  `node --import tsx src/app.ts` — TypeScript at runtime, no build. Wrangler/esbuild becomes
  the build; `.ts`-extension imports and `fileURLToPath`/`import.meta.url` uses
  (`routes/flight-log/exportFormats.ts`, `routes/occurrences/exportFormats.ts`,
  `services/tinyUrl.ts`, `routes/version/api.ts`) must be reworked into bundled imports.

**Verify:** `wrangler dev` serves a hello-world Worker that does `SELECT 1` through
Hyperdrive against Neon.

### Phase 1 — Frontends onto Workers Static Assets

The genuinely easy part: two pure SPAs, no SSR, `tsc -b && vite build` → `dist/`.

- One Worker per environment serving **both** bundles: `/` → `apps/frontend/dist`,
  `/admin/*` → `apps/admin/dist`. Rebuild `apps/admin` with `base: '/admin/'`
  (`apps/admin/vite.config.ts`).
- `apps/frontend/public/_headers` is already in Cloudflare's native format — carries over
  unchanged. CSP/HSTS keep coming from the edge rule.
- Drop `DEPLOY_TIMESTAMP` (a DO rebuild hack) and the `.deploy_timestamp` force-push branch
  dance in both deploy workflows.
- Add `VITE_STATS_YEAR_RANGE` and `VITE_MILEAGE_MAX_KM` as real build vars — they are used
  in code (`sections/stats/statsUtils.ts`, `sections/expenses/MileageDetailFields.tsx`) but
  set in **neither** `.do` spec, so they silently run on defaults today.
- The Worker's fallback route proxies `/api`, `/auth`, `/health`, `/t` to the **existing DO
  backend**. Nothing about the API changes yet.
- Worth doing here while you are in the build config: both apps ship **one monolithic
  bundle** (3.6 MB member, 2.6 MB admin, zero `React.lazy`, no `manualChunks`), and the
  member bundle carries four unused Poppins devanagari subsets (~360 KB). Route-level code
  splitting is a contained win.

**Verify:** log in on a preview URL, exercise booking + flight log + a document download
(`/t/:code` must not be intercepted by the service worker), install the PWA and confirm a
push notification still arrives.

### Phase 2 — The Workers runtime foundation (the hard, unavoidable part)

Before a single route moves, build the shared substrate in a new `apps/api` (Hono):

1. **Request context via `AsyncLocalStorage`** (available under `nodejs_compat`). One
   mechanism solves three problems at once: `env` is only available per-request on Workers,
   the tenant must be ambient, and the DB handle is per-request. The context carries
   `{ env, ctx, tenantId, jwt, db }`.

   This is what unblocks the **modules that throw at import time on missing env** —
   `services/storage.ts`, `services/simplbooks/simplbooksApiClient.ts`,
   `routes/auth/magiclink.ts` — which would otherwise break Worker cold starts. Every
   `process.env.X` (79 distinct vars) becomes `getCtx().env.X`.

2. **The tenant-scoped DB executor.** A Kysely `PostgresDialect` over a per-request `pg`
   `Client` through Hyperdrive, where **every** request — reads included — runs inside a
   transaction opened with:

   ```sql
   SET LOCAL TIME ZONE 'UTC';
   SELECT set_config('app.tenant_id', $1, true);
   ```

   Read-only transactions are cheap; this is what makes RLS and the timezone setting safe
   under Hyperdrive's multiplexing. Preserve `CamelCasePlugin({ maintainNestedObjectKeys: true })`
   and the per-pool `getTypeParser` overrides for DATE/INT8/NUMERIC exactly as
   `db/connection.ts` has them — DATA_LAYER.md explains why each one is load-bearing.

3. **Crypto swaps.**
   - `jsonwebtoken` → **`jose`** (HS256, same `iss: 'mik'` / `aud` claims, plus the new `tid`).
   - `lib/fieldEncryption.ts` `createCipheriv` AES-256-GCM → **WebCrypto**, _preserving the
     `iv:ct:tag` base64 format byte-for-byte_ — existing HETU rows must still decrypt. Write
     the round-trip test against fixtures captured from production-shaped data first.
   - `bcryptjs` (login codes, cost 10) is pure JS and works; it is a CPU cost, not a blocker.
   - `web-push` uses `node:crypto` ECDH/HKDF → a WebCrypto implementation.

4. **Middleware port.** `helmet` → Hono's `secureHeaders` (keeping `contentSecurityPolicy:
false` / `strictTransportSecurity: false`, since the edge rule owns both and the `cf-ray`
   fallback in `app.ts` exists precisely to avoid duplicate headers); `cors` → drop entirely
   once same-origin (Phase 1) lands; `cookie-parser` → Hono cookie helpers; `morgan`+winston
   → `console` + Workers Logs; `multer` (9 memory-storage instances, up to 50 MB) →
   `c.req.formData()`; the RFC-7807 `problemErrorHandler` in `routes/response.ts` ports
   nearly as-is.

5. **Rate limiting.** `RateLimiterMemory` is per-isolate and therefore effectively absent on
   Workers. Replace with the Workers rate-limiting binding, keyed on
   `(tenantId, cf.ip, authenticated?)` to preserve the current 3 / 0.5 / 2 point weighting.

6. **Bundled assets.** `templates/emailTemplate.ts` does a **CWD-relative `readFileSync` per
   email send** across ~95 markdown files. Bundle them as imports (esbuild text loader).
   Same for `mik-logo-blue.png` (`services/tinyUrl.ts` probes six candidate paths) and
   `package.json` (`routes/version/api.ts`).

7. **The strangler facade.** The API Worker's final `app.all('*')` proxies anything not yet
   ported to the DO origin, forwarding cookies and the `x-sudo` header verbatim. A per-domain
   allowlist in config decides what is live on Workers — so cutover is a config flip and
   rollback is the same flip back.

**Verify:** port **one small, read-only domain end to end** — `routes/version` then
`routes/time` then `routes/useful-phone-numbers` — and confirm the SPA cannot tell the
difference. Then port `routes/auth` (the riskiest single domain) behind a percentage rollout.

### Phase 3 — Storage to R2

- `apps/backend/src/services/storage.ts` is the **single** module (15 importers) and already
  speaks S3. Two-step: (a) repoint `@aws-sdk/client-s3` at the R2 S3 endpoint — it runs on
  Workers and is a config change; (b) then swap to the native **R2 binding**, which drops
  signing and a large dependency.
- **Key layout: `t/<tenantId>/<bucketRole>/<name>`** in a small number of R2 buckets rather
  than DO's per-aircraft `mik-ac-<last3>` bucket-per-thing pattern (`getAircraftBucketName`).
  Buckets are a provisioning step; prefixes are not — this is what keeps tenant onboarding
  an INSERT.
- **Presigned URLs → the tiny-URL table you already have.** `util/documentHelper.ts`
  currently mints a presigned URL, stores it as a tiny-URL row, and serves `/t/:code`. Keep
  the tiny URL; have `/t/:code` stream from the R2 binding directly after re-checking the
  caller's permission. This is _better_ than today: the presigned URL is currently valid to
  anyone who obtains it for `DOCUMENT_URL_TTL_SECS`.
- **Data migration**: `rclone sync` DO Spaces → R2 per bucket, dual-read (R2 first, Spaces
  fallback) for one release, then cut. R2 has no egress fee, so a full re-sync to verify is
  free.
- **`sharp` must go** (native libvips, 4 call sites: `util/imageUpload.ts`,
  `routes/occurrences/api.ts`, `services/tinyUrl.ts`, `services/liquid/qrSheet.ts`). Store
  the original in R2 and resize on read via **Cloudflare Images transformations**; that
  removes the EXIF-rotate/resize/mozjpeg pipeline entirely. For the QR logo compositing,
  render the QR as **SVG** (`qrcode` is pure JS) with the logo inlined — no raster step.

**Verify:** upload an avatar, an occurrence attachment with EXIF rotation, a 40 MB receipt,
and a 50 MB document; download each through `/t/:code`; confirm the QR sheet still prints.

### Phase 4 — Email

- `lib/sendGmail.ts` (nodemailer → Gmail SMTP) → **Cloudflare Email Sending** binding.
  There are **26 send sites in 20 files**, but all funnel through one `sendEmail(to, subject,
html, attachments?, replyTo?)` signature — so this is one module rewrite plus attachment
  handling (invoice PDFs, the `bwip-js` Finnish banking barcode, tiny-URL QR images).
- Keep the `DISABLE_EMAIL_SENDING` allowlist behaviour and the CRLF-stripping subject
  sanitisation exactly — both are security-relevant.
- **Multi-tenant deliverability is the real work here, not the API call.** Options:
  1. **Shared sending domain** (`mail.mikapp.fi`), tenant name in the From display name,
     `Reply-To` the club's address. One SPF/DKIM/DMARC setup, instant onboarding, shared
     reputation. **Recommended for v1.**
  2. **Per-tenant sending domain** — the club adds DNS records at onboarding. Better
     branding and reputation isolation, but onboarding now blocks on the club's DNS admin.
     Build this as an _opt-in upgrade_ once a club asks.
- `templates/registry.ts` gains tenant-derived vars (club name, billing email, logo URL)
  replacing the hardcoded "Malmin Ilmailukerho". Note the registry's `defaults` deliberately
  **win over caller-supplied vars** — tenant values must go in `defaults` resolved per
  request, not in the caller payload.
- `test/templates/email.test.ts` snapshots every template in all three languages. Those
  snapshots _will_ change; review them as a real change to what members receive.

### Phase 5 — Workers, outbox and Queues

**The outbox table stays.** `accts.outbox_simplbooks` exists so the enqueue is atomic with
the business write — `insertOutboxItem(eventType, payload, txn?)` takes the caller's Kysely
transaction. Cloudflare Queues cannot join a Postgres transaction, so removing the table
would reintroduce exactly the lost-message class it was built to prevent.

What Queues _do_ replace is `workers/simplbooksOutboxWorker.ts` — an infinite `while` loop
with `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1`, 30s/1s/5s sleeps, and hand-rolled
`checkAndClearStuckMessages()`. New shape:

```
Cron Trigger (every minute)
  → claim a batch: FOR UPDATE SKIP LOCKED, mark PROCESSING
  → publish one Queue message per outbox row
Queue consumer
  → dispatchOutboxMsg (unchanged switch over the 10 SimplbooksEventTypes)
  → mark SYNCED / FAILED; Queues handles retry + backoff + DLQ
```

Queue retries and the DLQ replace the stuck-message sweeper. `simplbooksOutboxHandler.ts`
(1117 LOC, 18 transactions) ports essentially unchanged — it is business logic over Kysely
plus HTTP calls; `axios` + `http.Agent` become `fetch`.

**SimplBooks' 1 req/s limit** is currently enforced by a module-level promise chain in
`simplbooksApiClient.ts` and a `Bottleneck` in `simplbooksInvoicePaymentWorker.ts`. Both
break across isolates. Replace with a **Durable Object per tenant** as a token bucket — and
note that per-tenant is now _correct_, since each club has its own SimplBooks account and
therefore its own limit.

**The 12 cron workers** (`workers/registry.ts`) become Cron Triggers, but with a
**fan-out**: the trigger enumerates active tenants and enqueues one Queue message per
tenant, and the consumer does one tenant's work. This avoids the 30s CPU limit as tenant
count grows, gives per-tenant retry, and is the pattern the email-batch workers
(`overdueInvoiceWorker`, `bookingReminderWorker`, `qualificationExpiryWorker`,
`aircraftDocumentExpiryWorker`, `occurrenceNotifyWorker`, `juniorMemberPromotionWorker`)
need anyway. The two `setInterval` 8-hour syncs (`brevoSyncWorker`,
`simplbooksMemberSyncWorker`) become plain Cron Triggers.

Keep the `defineWorker()` discipline: `<PREFIX>_ENABLED`, job function exported separately
from the declaration so tests call it directly, and **`runOnStartup` has no analogue on
Workers** — good, since the email fan-outs deliberately avoid it.

### Phase 6 — The Emmett event store

`@event-driven-io/emmett-postgresql` is Node-only (its dumbo adapter uses `pg` and mutates
the **global** `pg.types` registry, which is why `lib/eventStore.ts` runs a second pool at
all). It blocks the instructor-qualifications domain.

It is also the _smallest_ thing to replace: **14 call sites**, two files
(`db/instructor-qualification-queries.ts`, `routes/instructor-qualifications/events.ts`),
`appendToStream` / `aggregateStream` only, and **Flyway already owns the schema**
(`autoMigration: 'None'`). Write a ~150-line Kysely append/aggregate against `emt_messages`
/ `emt_streams` using the existing `emt_*` functions, and the second pool disappears with
it. Tenancy maps onto the existing `partition` column.

### Phase 7 — Tenancy migration

Only now, on a stable Workers stack:

1. Migration `V2180` (current highest is V2170 — always re-check, do not trust this number): control-plane tables, `tenant_id` + backfill +
   policies + `security_invoker` on all 49 views, composite unique constraints, the
   credit-note counter table. **Generate the DDL with a script over `schema.d.ts`, then
   review and commit the generated SQL** — 120 tables is too many to hand-write and too few
   to trust to a script unreviewed. Respect the branch discipline: new files only, version =
   current highest + 10, never edit a deployed migration.
2. Host→tenant resolution in the edge Worker, KV-cached, DB as source of truth.
3. `tid` in the JWT; middleware rejects a host/claim mismatch.
4. Per-tenant integration credentials out of env vars into `tenant_integration`.
5. Tenant provisioning: an INSERT + `emt_add_partition()` + R2 prefix + optional DNS row.
   Seed data per the testing policy — at minimum **two** tenants in
   `sql/schema/testdata/`, because one tenant proves nothing about isolation.
6. Cookie scoping: drop `COOKIE_DOMAIN` for new tenants; keep MIK's until the
   `intra`/`twr` aliases retire. `assertAuthCookieConfig()` becomes per-tenant.

### Phase 8 — Decommission

Delete `Dockerfile`, `.do/*.yaml`, the `doctl` workflows and their ~90-var `$GITHUB_ENV`
blocks. Repoint `.do/pg-backup-job.yaml` at Neon (or use Neon's own backups + keep the R2
copy as the off-site belt-and-braces) — it already writes to R2, so this is a URL change.
`apps/simplbooks_sync` is a manually-run CLI referenced by nothing in CI; leave it on Node.

---

## Testing

Per CLAUDE.md, **a change that alters behaviour brings tests in the same PR**. For this
migration specifically:

- **Tenancy is a permission gate**, so it gets the full-identity-set treatment: the backend
  admin/member/no-permissions triad **× at least two tenants**, asserting that tenant B's
  token cannot read tenant A's row _and_ that a query with no `app.tenant_id` set returns
  zero rows rather than everything.
- A **table-coverage test** over `schema.d.ts` that fails when a table has no tenant policy.
- Keep `test/db/camel-case-plugin.test.ts` and `test/db/stats-queries-smoke.test.ts` green —
  the latter executes all 43 stats queries against a real DB and is the only thing that
  catches the `occurrences_per_100h_by_ac_yr` camel/snake round-trip trap. It becomes _more_
  important once views gain `security_invoker`.
- **`miniflare`/`vitest-pool-workers`** for the Worker layer; keep the existing Postgres
  service container for query-layer tests.
- The frontend coverage ratchets in `apps/frontend/vitest.config.ts` may only be raised.
- Run `pnpm test` with `LANG=C.UTF-8 LC_ALL=C.UTF-8` — several frontend tests format via
  `toLocaleTimeString([])` and fail under a non-English shell locale.

## Verification, end to end

At each phase boundary, on a preview deployment:

1. `./scripts/baseline_database.sh` against the Neon staging URL — all 231 migrations replay.
2. `pnpm build && pnpm test && pnpm format:check && pnpm lint` (ratchets: frontend 5, admin 0,
   backend 66, contracts 0, ui 0 — lowerable only).
3. `wrangler dev` locally with `--remote` bindings; then a preview Worker.
4. Browser walkthrough, both identities, per CLAUDE.md's login flow: member
   (`chris.whellams@gmail.com`) and admin (`juho.kolehmainen@iki.fi`), magic link from
   `wrangler tail` output. Book a flight, file a flight log, upload a document and fetch it
   via `/t/:code`, raise an expense claim, trigger an invoice with `SIMPLBOOKS_DRY_RUN=true`
   and confirm the outbox row reaches SYNCED through the Queue.
5. Post-Phase-7: repeat the whole walkthrough as **two different tenants in two browser
   profiles simultaneously**, and confirm neither sees the other's data anywhere —
   especially in the `stats.*` pages, which are the views most likely to leak.

## Risks, honestly

- **Scale.** 486 endpoints, 39k non-test LOC of backend, 231 migrations. This is a multi-month
  programme, not a sprint. The strangler facade is what makes it survivable — but it also
  means running two backends for months, and _both_ must stay deployable.
- **Phase 2 has no partial credit.** Request context, the DB executor, crypto swaps and the
  facade all have to work before route one moves.
- **The field-encryption format migration is irreversible if botched** — existing HETU
  ciphertext must decrypt under WebCrypto. Fixture-test it before anything else in Phase 2.
- **`security_invoker` on views is the linchpin of the cheap tenancy story.** Validate it
  against three real `stats.*` views (one with a window function, one with `LATERAL`, one
  with `percentile_*`) in Phase 0, before committing to the model.
- **PDF generation may not fit.** `pdfkit`'s three call sites are non-trivial (multi-page
  occurrence reports with pagination and a `pageAdded` handler). If the `pdf-lib` rewrite
  stalls, fall back to a **Cloudflare Container** for PDF rendering rather than blocking the
  migration on it.
- **Hyperdrive + per-request transactions** changes the connection profile completely. Load
  test before cutover; Neon's connection limits and Hyperdrive's pool sizing both matter.
