import 'dotenv/config'

import { afterAll, describe, expect, it } from '@jest/globals'

import { sql } from 'kysely'

import { db } from '../../src/db/connection.ts'

/**
 * Pins the behaviour the whole data layer rests on. Every query in the backend goes
 * through this plugin, so if any of this changes, everything is silently wrong — these
 * assertions matter more than their size suggests. See src/db/DATA_LAYER.md.
 *
 * Two further cases used to live here, asserting that the *other* instance left keys
 * snake_case. They were meaningful only while `db` and `camelDb` ran side by side
 * during issue #1115 phase 5; with a single instance they would assert the opposite of
 * the truth, so they went with the second instance.
 */
describe('CamelCasePlugin', () => {
  const code = `UT_CAMEL_${Date.now()}`

  afterAll(async () => {
    await db.deleteFrom('accts.costCentre').where('code', '=', code).execute()
  })

  it('writes camelCase identifiers to snake_case columns and reads them back camelCase', async () => {
    await db
      .insertInto('accts.costCentre')
      .values({ code, description: 'Camel case plugin test' })
      .execute()

    const viaCamel = await db
      .selectFrom('accts.costCentre')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirstOrThrow()

    expect(viaCamel.description).toBe('Camel case plugin test')

    // Raw SQL is never touched by the identifier transformer, so naming the real
    // relation here is what proves the insert actually landed in accts.cost_centre —
    // a second query builder call would just repeat the same rewrite and prove nothing.
    const viaRawSql = await sql<{
      description: string
    }>`select description from accts.cost_centre where code = ${code}`.execute(db)

    expect(viaRawSql.rows).toHaveLength(1)
    expect(viaRawSql.rows[0].description).toBe('Camel case plugin test')
  })

  // accts.cost_centre has no multi-word column, so the test above can only demonstrate
  // the table half of the rewrite. This covers the column half without needing a
  // fixture, by checking the SQL that is actually sent.
  it('rewrites multi-word identifiers to snake_case in the emitted SQL', async () => {
    const { sql: emitted } = db
      .selectFrom('flight.maintenanceNote')
      .select(['aircraftRegistration', 'ajlbSeqNo'])
      .where('performedBy', '=', 'Matti1')
      .compile()

    expect(emitted).toContain('"flight"."maintenance_note"')
    expect(emitted).toContain('"aircraft_registration"')
    expect(emitted).toContain('"ajlb_seq_no"')
    expect(emitted).toContain('"performed_by"')
    expect(emitted).not.toMatch(/[a-z][A-Z]/)
  })

  it('camelCases the audit quadruple without a hand-written mapper', async () => {
    const row = await db
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
    const row = await db
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
    }>`select count(*)::int as total_count from accts.cost_centre`.execute(db)

    expect(result.rows[0]).toHaveProperty('totalCount')
    expect(result.rows[0]).not.toHaveProperty('total_count')
  })
})
