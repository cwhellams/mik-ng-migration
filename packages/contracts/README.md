# `@mik/contracts`

The API contract shared by `apps/backend` and `apps/frontend`: the Zod request/response
models, the shared enums (`MIKPermissions`, `MIKLang`, `MIKMemberTypes`, …), the RFC 9457
`Problem` shape, and the handful of helpers that both apps genuinely need to agree on
(ICS calendar generation, Helsinki-timezone conversion, URL/path sanitisers).

Before this package existed the frontend imported those models straight out of
`apps/backend/src` through an `@backend/*` path alias. Sharing the contract was right;
aliasing into another app's source was not — it let the browser bundle import _anything_
the backend exports, including `db/connection.ts` and `dotenv`. This package replaces the
alias, so that leak is now a build error instead of a convention (issue #1115, phase 4).

## Layout

One module per API domain, mirroring `apps/backend/src/routes/<domain>/`:

```
@mik/contracts/members        ← routes/members/models.ts
@mik/contracts/flight-log     ← routes/flight-log/models.ts
@mik/contracts/problem        ← the RFC 9457 Problem shape
@mik/contracts/schema         ← AuditableSchema, PaginationSchema, LocalisedSchema, …
@mik/contracts/calendar       ← ICS + Google Calendar link generation
@mik/contracts/date           ← Helsinki timezone helpers
@mik/contracts/sanitizers     ← URL / path sanitisers used by both apps
```

The package ships TypeScript source — there is no build step. The backend runs it through
`tsx`, the frontend through Vite, and both typecheck it as part of their own `tsc` run.

## Rules

**It must stay isomorphic.** Everything here runs in the browser as well as in Node:

- No Node builtins, no `process.env`, no `Buffer`. `tsconfig.json` deliberately sets
  `"types": []` so those don't even typecheck, and `eslint.config.js` blocks the
  server-only packages by name.
- No Express, Kysely, `pg`, or anything else from the backend's runtime. Anything a
  contract needs from the server environment (an organiser email address, a base URL) is
  passed in as an argument by the caller.
- No DOM side effects either. `calendar.ts` builds the ICS string; the frontend's
  `downloadIcs` wraps it in a `Blob` on its own side.

**Adding a domain:** create `src/<domain>.ts`, export the Zod schemas and inferred types,
and import it as `@mik/contracts/<domain>`. No barrel file and no `index.ts` — subpath
exports keep unrelated domains out of each other's dependency graph.

## Tests

```bash
pnpm --filter @mik/contracts test
```

Vitest, in `test/`. The suite lives here rather than in either app because both depend on
this code — the shared primitives are a single point of failure for the whole repo, which
is exactly why `calendar`, `date`, `schema` and `sanitizers` are covered. CI runs it as
part of the backend workflow.

The ICS tests assert the **entire** payload rather than individual lines. That is
deliberate: the builder replaced two hand-written copies, and the claim being defended is
that the bytes did not change — field order included.

Note the two tsconfigs. `tsconfig.json` covers `src/` only and deliberately has no Node
types; `tsconfig.test.json` covers the tests, which do need them (the Vitest config sets
`process.env.TZ`). They are separate because TypeScript applies ambient types per
_program_: merging them back together brings Node's globals into `src/` and silently
disables the guard. `eslint.config.js` bans `process`/`Buffer`/`__dirname` in `src/**` as
well, so the boundary survives a future tsconfig edit.

The suite runs under `TZ=UTC`, unlike the frontend's, so a dropped `.tz()` in the Helsinki
helpers can't pass by accident.
