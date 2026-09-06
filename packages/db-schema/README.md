# `@mik/db-schema`

The Kysely types generated from the live database by `kysely-codegen`, in one place so that
**both** services that talk to Postgres describe it the same way: `apps/backend` (Express,
Node) and `apps/api` (Hono, Workers).

```ts
import type { DB, FlightLogs } from '@mik/db-schema/schema'
```

## Regenerating

Unchanged, and still run from the backend, which owns the database connection settings:

```bash
cd apps/backend && pnpm schema
```

It writes `packages/db-schema/src/schema.d.ts`. **Never edit that file by hand** — the
header says so and the next regeneration would silently discard the edit.

## Why a package rather than a copy

The two services are mid-migration and will both be live for months. A second generated
copy would be correct on the day it was made and wrong the first time someone regenerated
one and not the other — and the failure would be a type that quietly disagrees with the
database, which is the exact class of bug `apps/backend/src/db/DATA_LAYER.md` was written
about.

## Types only

There is no runtime code here: every import of it is `import type`, and both consumers'
bundlers erase those. The `build` script is a `tsc --noEmit` typecheck, like
`@mik/contracts`.

`tsconfig.json` sets `"types": []` deliberately. This package is consumed by a Node service
and a Workers one, so it must describe the database and pull in neither runtime's globals.
