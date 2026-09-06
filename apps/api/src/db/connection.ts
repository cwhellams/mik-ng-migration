import { CamelCasePlugin, Kysely, PostgresDialect, type Selectable } from 'kysely'
import pg from 'pg'

import type { DB } from '@mik/db-schema/schema'

/**
 * Per-request type overrides, kept identical to apps/backend/src/db/connection.ts.
 *
 * Each one is load-bearing and DATA_LAYER.md explains why; they are repeated
 * rather than shared because they are three lines and the alternative is a
 * package that exists only to hold them.
 */
const clientTypes: pg.CustomTypesConfig = {
  getTypeParser: (oid: number, format?: string) => {
    // Dates as strings, to avoid timezone-offset day shifts.
    if (oid === pg.types.builtins.DATE) return (val: string) => val
    // int8 as string: mixing BigInt with Number throws at runtime.
    if (oid === pg.types.builtins.INT8) return (val: string) => val
    // numeric/decimal as a JS number.
    if (oid === pg.types.builtins.NUMERIC) return (val: string) => Number.parseFloat(val)
    return pg.types.getTypeParser(oid, format as 'text' | 'binary')
  },
}

/**
 * One client per request, not a pool.
 *
 * A `pg.Pool` is meaningless here: an isolate handles one request at a time and
 * may be evicted between them, so a pool would be a pool of one connection with
 * an idle timer that never fires usefully. Hyperdrive is the pool — it keeps
 * warm connections to the origin so this handshake is local to Cloudflare's
 * network rather than a round trip to the database.
 *
 * No `ssl` and no CA certificate, unlike the Express backend: Hyperdrive
 * terminates TLS to the origin itself, so the Worker never sees it. The
 * `DATABASE_CA_CERT_FILE` read that connection.ts does has nothing to read from
 * on workerd anyway.
 */
export const createClient = (connectionString: string): pg.Client =>
  new pg.Client({ connectionString, types: clientTypes })

/**
 * Wraps a connected client in Kysely with the same plugin the backend uses.
 *
 * `maintainNestedObjectKeys` is NOT optional. Without it the plugin rewrites
 * the keys *inside* JSONB values, and this database stores three kinds of JSON
 * that must survive a read byte-for-byte: the `*_audit` tables' `to_jsonb(OLD)`
 * row snapshots, `outbox.payload` (a SimplBooks request body), and Emmett's
 * event-store columns. See DATA_LAYER.md.
 */
export const createDb = (client: pg.Client): Kysely<DB> =>
  new Kysely<DB>({
    dialect: new PostgresDialect({
      // Kysely's PostgresDialect wants a pool-shaped thing. A single client
      // satisfies the two methods it actually calls, and handing it the client
      // directly is what keeps the whole request on one connection — which is
      // what makes the transaction-local settings below mean anything.
      pool: {
        // Kysely's PostgresDriver calls `client.release()` when it is done with
        // a connection, which a pooled client has and a bare one does not. The
        // no-op is correct here: the client outlives every query in the request
        // and is closed once, by the middleware, through ctx.waitUntil().
        connect: async () => Object.assign(client, { release: () => {} }),
        end: async () => {},
      } as unknown as pg.Pool,
    }),
    plugins: [new CamelCasePlugin({ maintainNestedObjectKeys: true })],
  })

/** A row as the database returns it: `DbRow<'flight.logs'>`. */
export type DbRow<T extends keyof DB> = Selectable<DB[T]>
