import { sql } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'

import { runWithContext } from '../../src/context'
import type { Env } from '../../src/env'
import { closeDbSession, getDb, openDbSession } from '../../src/db/session'

const CONNECTION =
  process.env.TEST_DATABASE_URL ?? 'postgres://admin:password@127.0.0.1:5432/mik_ng'

const pending: Promise<unknown>[] = []

const query = <T>(fn: () => Promise<T>): Promise<T> =>
  runWithContext(
    {
      env: {
        LEGACY_ORIGIN: 'https://legacy.example.test',
        HYPERDRIVE: { connectionString: CONNECTION },
      } as unknown as Env,
      ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext,
    },
    async () => {
      const session = await openDbSession()
      try {
        return await fn()
      } finally {
        await closeDbSession(session, false)
      }
    },
  )

afterEach(async () => {
  await Promise.all(pending.splice(0))
})

/**
 * The three type overrides carried across from apps/backend/src/db/connection.ts.
 * Each exists for a reason DATA_LAYER.md records, and each fails silently if it
 * is dropped — the value still arrives, just as the wrong JavaScript type.
 */
describe('type parsers', () => {
  it('returns DATE as a string, not a Date', async () => {
    // A Date would be constructed in the runtime's timezone and could report
    // the previous day. Flight logs are keyed by date.
    const value = await query(async () => {
      const res = await sql<{ d: unknown }>`select '2026-03-01'::date as d`.execute(getDb())
      return res.rows[0].d
    })

    expect(typeof value).toBe('string')
    expect(value).toBe('2026-03-01')
  })

  it('returns int8 as a string, not a BigInt', async () => {
    // Mixing BigInt with Number throws at runtime, and counts flow straight
    // into arithmetic.
    const value = await query(async () => {
      const res = await sql<{ n: unknown }>`select 9007199254740993::int8 as n`.execute(getDb())
      return res.rows[0].n
    })

    expect(typeof value).toBe('string')
    expect(value).toBe('9007199254740993')
  })

  it('returns numeric as a number, not a string', async () => {
    // Prices and hours are numeric, and a string would concatenate rather than
    // add — silently, and only in the total.
    const value = await query(async () => {
      const res = await sql<{ n: unknown }>`select 12.34::numeric as n`.execute(getDb())
      return res.rows[0].n
    })

    expect(typeof value).toBe('number')
    expect(value).toBe(12.34)
  })
})

describe('the camelCase plugin', () => {
  it('camelCases column names on the way out', async () => {
    const row = await query(async () => {
      const res = await sql<Record<string, unknown>>`select 1 as note_id`.execute(getDb())
      return res.rows[0]
    })

    expect(row).toHaveProperty('noteId')
  })

  it('leaves the keys inside a JSONB value alone', async () => {
    // maintainNestedObjectKeys. Without it the plugin rewrites keys *inside*
    // JSONB, which would corrupt the *_audit tables' to_jsonb(OLD) row
    // snapshots, outbox.payload, and Emmett's event-store columns — all of
    // which are keyed by real snake_case column names.
    const payload = await query(async () => {
      const res = await sql<{ payload: Record<string, unknown> }>`
        select '{"note_id": 1, "created_at": "x"}'::jsonb as payload
      `.execute(getDb())
      return res.rows[0].payload
    })

    expect(payload).toEqual({ note_id: 1, created_at: 'x' })
    expect(payload).not.toHaveProperty('noteId')
  })
})
