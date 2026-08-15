import 'dotenv/config'

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'

import { camelDb, db } from '../../src/db/connection.ts'
import { resolveDefects, setDefectsForHil } from '../../src/db/defect-queries.ts'
import { updateAircraftHilEntry } from '../../src/db/aircraft-hil-queries.ts'

/**
 * aircraft-hil, defect and maintenance-note share transactions across module
 * boundaries — maintenance-note opens one and passes it into defect-queries, and
 * routes/aircraft-hil/api.ts opens one spanning both aircraft-hil-queries and
 * defect-queries. That is why phase 5 (issue #1115) had to move all three in one
 * commit: a transaction belongs to a single Kysely instance, so a `db.transaction()`
 * handed to a function that queries `camelDb` would run on a different connection and
 * not roll back with it.
 *
 * What guards what, since the three mechanisms are easy to conflate:
 *
 *   - The *route* using the wrong instance is a compile error. Reverting
 *     routes/aircraft-hil/api.ts to db.transaction() gives
 *     "TS2345: Argument of type 'Transaction<DB>' is not assignable to parameter of
 *     type 'Kysely<DB>'" on each call that takes the executor. No test needed, and no
 *     test could catch it anyway — it does not build.
 *   - A *module* ignoring the executor it was handed and reaching for its own instance
 *     compiles fine, and is what these tests catch.
 *   - The route's happy path — hold item resolved and its defect cascaded — is covered
 *     end-to-end by test/routes/aircraft-hil/api.test.ts. That test would still pass if
 *     the writes stopped being atomic, which is why the rollback assertions below exist.
 */
describe('transaction cluster: aircraft-hil / defect / maintenance-note', () => {
  // flight.defect has an FK onto the journey log book, so the fixture has to hang
  // off a real (registration, seq_no) pair from the seed data.
  const registration = 'OH-IHQ'
  const ajlbSeqNo = 1
  let defectId: string
  let noteId: string
  let hilId: string

  beforeEach(async () => {
    // flight.defect.resolved_note_id has an FK onto the maintenance note, so the
    // note the rollback would undo has to exist first.
    const note = await db
      .insertInto('flight.maintenance_note')
      .values({
        aircraft_registration: registration,
        ajlb_seq_no: ajlbSeqNo,
        description: 'transaction cluster fixture note',
        performed_by: 'Matti1',
        flight_mins: 0,
        created_by: 'Matti1',
        updated_by: 'Matti1',
      })
      .returning('note_id')
      .executeTakeFirstOrThrow()
    noteId = note.note_id

    const now = new Date()
    const hil = await db
      .insertInto('flight.aircraft_hil')
      .values({
        aircraft_registration: registration,
        hil_number: 99001,
        description: 'transaction cluster fixture hil',
        open_date: now,
        name: 'Plane Captain',
        created_by: 'Matti1',
        updated_by: 'Matti1',
      })
      .returning('hil_id')
      .executeTakeFirstOrThrow()
    hilId = hil.hil_id

    const row = await db
      .insertInto('flight.defect')
      .values({
        aircraft_registration: registration,
        ajlb_seq_no: ajlbSeqNo,
        description: 'transaction cluster fixture',
        flight_mins: 0,
        status: 'ACTIVE',
        created_by: 'Matti1',
        updated_by: 'Matti1',
      })
      .returning('defect_id')
      .executeTakeFirstOrThrow()
    defectId = row.defect_id
  })

  afterEach(async () => {
    await db.deleteFrom('flight.defect').where('defect_id', '=', defectId).execute()
    await db.deleteFrom('flight.maintenance_note').where('note_id', '=', noteId).execute()
    await db.deleteFrom('flight.aircraft_hil').where('hil_id', '=', hilId).execute()
  })

  const statusOf = async (id: string) =>
    (
      await db
        .selectFrom('flight.defect')
        .select('status')
        .where('defect_id', '=', id)
        .executeTakeFirstOrThrow()
    ).status

  it('applies a cross-module write inside a camelDb transaction', async () => {
    await camelDb.transaction().execute(async (trx) => {
      await resolveDefects([defectId], registration, noteId, 'Matti1', trx)
    })

    expect(await statusOf(defectId)).toBe('RESOLVED')
  })

  // The one that matters. If defect-queries were still on `db` while the caller
  // opened a `camelDb` transaction, this write would land on a separate connection,
  // commit independently, and survive the rollback.
  it('rolls the write back when the transaction fails', async () => {
    await expect(
      camelDb.transaction().execute(async (trx) => {
        await resolveDefects([defectId], registration, noteId, 'Matti1', trx)
        throw new Error('forced rollback')
      }),
    ).rejects.toThrow('forced rollback')

    expect(await statusOf(defectId)).toBe('ACTIVE')
  })

  // The shape routes/aircraft-hil/api.ts actually uses: one transaction spanning
  // aircraft-hil-queries *and* defect-queries. The single-module test above would
  // still pass if only one of the two modules honoured the executor.
  it('rolls back across both modules when a transaction spanning them fails', async () => {
    const restrictionsOf = async () =>
      (
        await db
          .selectFrom('flight.aircraft_hil')
          .select('restrictions')
          .where('hil_id', '=', hilId)
          .executeTakeFirstOrThrow()
      ).restrictions

    expect(await restrictionsOf()).toBeNull()

    await expect(
      camelDb.transaction().execute(async (trx) => {
        await updateAircraftHilEntry(hilId, { restrictions: 'Day VFR only' }, 'Matti1', trx)
        await setDefectsForHil(hilId, registration, [defectId], 'Matti1', trx)
        throw new Error('forced rollback')
      }),
    ).rejects.toThrow('forced rollback')

    // Neither module's write survived.
    expect(await restrictionsOf()).toBeNull()
    const defect = await db
      .selectFrom('flight.defect')
      .select('hil_id')
      .where('defect_id', '=', defectId)
      .executeTakeFirstOrThrow()
    expect(defect.hil_id).toBeNull()
  })
})
