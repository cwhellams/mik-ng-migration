import 'dotenv/config'

import { afterAll, describe, expect, it } from '@jest/globals'

import { sql } from 'kysely'

import { camelDb, db } from '../../src/db/connection.ts'

/**
 * Pins the behaviour the phase 5 migration (issue #1115) rests on. If any of this
 * changes, every domain already moved to `camelDb` is silently wrong, so these
 * assertions matter more than their size suggests.
 */
describe('CamelCasePlugin (camelDb)', () => {
  const code = `UT_CAMEL_${Date.now()}`

  afterAll(async () => {
    await db.deleteFrom('accts.cost_centre').where('code', '=', code).execute()
  })

  it('writes camelCase identifiers to snake_case columns and reads them back camelCase', async () => {
    await camelDb
      .insertInto('accts.costCentre')
      .values({ code, description: 'Camel case plugin test' })
      .execute()

    const viaCamel = await camelDb
      .selectFrom('accts.costCentre')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirstOrThrow()

    expect(viaCamel.description).toBe('Camel case plugin test')

    // The row really did land in the snake_case column, i.e. the plugin rewrote the
    // identifier on the way out rather than the two instances disagreeing.
    const viaSnake = await db
      .selectFrom('accts.cost_centre')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirstOrThrow()

    expect(viaSnake.description).toBe('Camel case plugin test')
  })

  it('camelCases the audit quadruple without a hand-written mapper', async () => {
    const row = await camelDb
      .selectFrom('flight.maintenanceNote')
      .selectAll()
      .limit(1)
      .executeTakeFirst()

    if (!row) return // no seeded maintenance notes in this environment

    expect(Object.keys(row)).toEqual(
      expect.arrayContaining(['createdAt', 'createdBy', 'updatedAt']),
    )
    expect(Object.keys(row).filter((k) => k.includes('_'))).toEqual([])
  })

  // The reason connection.ts passes maintainNestedObjectKeys: true. The *_audit
  // tables are written by triggers as to_jsonb(OLD) — whole row snapshots keyed by
  // real column names. Without the option the plugin rewrites those keys on read,
  // so the audit trail would report field names that never existed in the database.
  // outbox.payload (a SimplBooks request body) and Emmett's event-store metadata
  // columns have the same requirement.
  it('leaves the keys inside JSONB values alone', async () => {
    const row = await camelDb
      .selectFrom('flight.maintenanceNoteAudit')
      .selectAll()
      .where('changedData', 'is not', null)
      .limit(1)
      .executeTakeFirst()

    if (!row) return // no audit history seeded in this environment

    // The column itself is camelCased...
    expect(row).toHaveProperty('changedData')
    // ...but the row snapshot inside it is untouched.
    const snapshot = row.changedData as Record<string, unknown>
    expect(Object.keys(snapshot).some((k) => k.includes('_'))).toBe(true)
    expect(snapshot).toHaveProperty('note_id')
    expect(snapshot).not.toHaveProperty('noteId')
  })

  // The trap for every module that still has raw sql. transformResult renames the
  // keys of *any* row the instance returns, including one produced by a hand-written
  // fragment the identifier transformer never touched — so a `sql<{ total_mins: number }>`
  // type annotation becomes a lie, and row.total_mins is undefined at runtime with
  // nothing failing to compile.
  it('camelCases the result keys of raw sql too, not just built queries', async () => {
    const result = await sql<{
      totalCount: number
    }>`select count(*)::int as total_count from accts.cost_centre`.execute(camelDb)

    expect(result.rows[0]).toHaveProperty('totalCount')
    expect(result.rows[0]).not.toHaveProperty('total_count')
  })

  it('leaves raw sql result keys alone on the original instance', async () => {
    const result = await sql<{
      total_count: number
    }>`select count(*)::int as total_count from accts.cost_centre`.execute(db)

    expect(result.rows[0]).toHaveProperty('total_count')
    expect(result.rows[0]).not.toHaveProperty('totalCount')
  })

  it('does not change what the original snake_case instance returns', async () => {
    const row = await db
      .selectFrom('flight.maintenance_note')
      .selectAll()
      .limit(1)
      .executeTakeFirst()

    if (!row) return

    expect(row).toHaveProperty('created_at')
    expect(row).not.toHaveProperty('createdAt')
  })
})
