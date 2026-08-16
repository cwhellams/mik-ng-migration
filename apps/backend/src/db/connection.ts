import 'dotenv/config'
import { CamelCasePlugin, Kysely, PostgresDialect, type Selectable } from 'kysely'
import pg from 'pg'
import { readFileSync } from 'fs'
import logger from '../lib/logger.ts'

import type { DB } from './schema.d.ts'

//Digital Ocean requires SSL connection to the database with a CA Certificate also used
const useSSL = process.env.DB_SSL

// Read CA certificate from file or environment variable
let caCert: string | undefined

if (useSSL) {
  try {
    const certFile = process.env.DATABASE_CA_CERT_FILE || './ca-certificate.crt'
    caCert = readFileSync(certFile, 'utf-8')
    logger.info(`Loaded CA certificate from ${certFile}`)
  } catch (error) {
    logger.error('Failed to read CA certificate file:', error)
    throw error
  }
}

// Per-pool type overrides — isolated from the global pg.types registry.
// This prevents third-party libraries (e.g. Emmett's dumbo adapter) from
// corrupting our parsers via pg.types.setTypeParser() globally.
const poolTypes: pg.CustomTypesConfig = {
  getTypeParser: (oid: number, format?: string) => {
    // Return dates as strings to avoid timezone-offset day-shift issues.
    if (oid === pg.types.builtins.DATE) return (val: string) => val
    // Return int8 (bigint) as string — mixing BigInt with Number throws at runtime.
    if (oid === pg.types.builtins.INT8) return (val: string) => val
    // Return numeric/decimal as JS number.
    if (oid === pg.types.builtins.NUMERIC) return (val: string) => Number.parseFloat(val)
    return pg.types.getTypeParser(oid, format as 'text' | 'binary')
  },
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: Number.parseInt(process.env.DATABASE_CN_TIMEOUT || '10000', 10), // Wait for a connection
  options: '-c timezone=UTC',
  types: poolTypes,
  ssl: useSSL
    ? {
        rejectUnauthorized: true,
        ca: caCert,
      }
    : undefined, // Fallback if not present
})

const dialect = new PostgresDialect({
  pool,
})

// Kysely's PostgresDriver ends the pool inside destroy(). pg rejects a second
// end() with "Called end on pool more than once", which is why teardown used to
// log an error the project instructions told you to ignore — closing the pool
// once is the whole job.
const closeDb = async (): Promise<void> => {
  await pool.end()
}

/**
 * Column names are camelCase in both directions: queries are written `noteId` and
 * reach Postgres as `note_id`, and rows come back `noteId` without a hand-written
 * mapper. Types come from schema.d.ts, generated with `--camel-case`.
 *
 * `maintainNestedObjectKeys` is NOT optional. Without it the plugin rewrites the keys
 * *inside* JSONB values too, and this database stores three kinds of JSON that must
 * survive a read byte-for-byte:
 *   - the `*_audit` tables' `changed_data`/`new_data`, written by triggers as
 *     `to_jsonb(OLD)` — whole row snapshots keyed by real snake_case column names;
 *   - `outbox.payload`, which is a SimplBooks API request body;
 *   - Emmett's `message_data`/`message_metadata`/`stream_metadata` event-store columns.
 * Nothing in this codebase builds nested objects from columns (there is no
 * json_agg/jsonb_build_object anywhere), so there is no case that wants the recursive
 * behaviour and several that are corrupted by it.
 *
 * This was `camelDb`, alongside a snake_case `db`, for the length of issue #1115
 * phase 5, so domains could move one at a time. Everything has moved and the two
 * collapsed into the single instance below; see DATA_LAYER.md.
 */
export const db = new Kysely<DB>({
  dialect,
  plugins: [new CamelCasePlugin({ maintainNestedObjectKeys: true })],
})

/**
 * A row as `db` returns it, keyed by the same table name the query uses:
 * `DbRow<'accts.localFuelPrice'>`. The table key is checked against the schema, so a
 * typo is a compile error rather than a hand-written row shape that quietly disagrees
 * with the database.
 */
export type DbRow<T extends keyof DB> = Selectable<DB[T]>

/**
 * Repairs the one place where `maintainNestedObjectKeys` above works against us.
 *
 * `jsonArrayFrom`/`jsonObjectFrom` build their JSON inside Postgres, from the raw
 * column names in the emitted SQL — so the objects *inside* the array come back
 * snake_case. The plugin is told not to touch nested keys (it must not, or it would
 * rewrite the audit tables' row snapshots), so they stay that way. Kysely's inferred
 * type, meanwhile, is derived from the camelCase schema and says `updatedAt`.
 *
 * The type and the runtime value therefore disagree, silently, with nothing to catch
 * it: `row.updatedAt` is `undefined` and typechecks. Call this on the result of any
 * nested subquery to make the runtime match the type it already claims to have.
 */
export const camelCaseNestedRows = <T>(rows: T[]): T[] =>
  rows.map((row) => {
    const mapped: Record<string, unknown> = {}
    for (const key in row as Record<string, unknown>) {
      // Only pay for the regex on keys that actually contain an underscore; nested
      // rows from selectAll() are mostly already single-word.
      const camel = key.includes('_')
        ? key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
        : key
      mapped[camel] = (row as Record<string, unknown>)[key]
    }
    return mapped as T
  })

// Test database connection
export const testConnection = async (): Promise<void> => {
  try {
    await pool.query('SELECT 1')
    logger.info('Database connection verified')
  } catch (error) {
    logger.error('Database connection test failed:', error)
    throw error
  }
}

export { closeDb } // Export the pool for testing
