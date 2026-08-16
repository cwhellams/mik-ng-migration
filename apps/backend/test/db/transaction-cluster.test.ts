import 'dotenv/config'

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'

import { db } from '../../src/db/connection.ts'
import { resolveDefects, setDefectsForHil } from '../../src/db/defect-queries.ts'
import { updateAircraftHilEntry } from '../../src/db/aircraft-hil-queries.ts'

/**
 * aircraft-hil, defect and maintenance-note share transactions across module
 * boundaries — maintenance-note opens one and passes it into defect-queries, and
 * routes/aircraft-hil/api.ts opens one spanning both aircraft-hil-queries and
 * defect-queries.
 *
 * What these tests guard is that a module *uses the executor it was handed* rather
 * than reaching for the module-level `db`. That distinction still exists with a single
 * Kysely instance: `db.transaction()` runs on its own connection, so a function that
 * quietly ignores the transaction it was given writes outside it and survives the
 * rollback.
 *
 * The route's happy path — hold item resolved and its defect cascaded — is covered
 * end-to-end by test/routes/aircraft-hil/api.test.ts. That test would still pass if the
 * writes stopped being atomic, which is why the rollback assertions below exist.
 *
 * (These were written during issue #1115 phase 5, when a transaction additionally could
 * not span the two Kysely instances that then existed. That hazard is gone with the
 * instances; the executor-plumbing one is not.)
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
      .insertInto('flight.maintenanceNote')
      .values({
        aircraftRegistration: registration,
        ajlbSeqNo: ajlbSeqNo,
        description: 'transaction cluster fixture note',
        performedBy: 'Matti1',
        flightMins: 0,
        createdBy: 'Matti1',
        updatedBy: 'Matti1',
      })
      .returning('noteId')
      .executeTakeFirstOrThrow()
    noteId = note.noteId

    const now = new Date()
    const hil = await db
      .insertInto('flight.aircraftHil')
      .values({
        aircraftRegistration: registration,
        hilNumber: 99001,
        description: 'transaction cluster fixture hil',
        openDate: now,
        name: 'Plane Captain',
        createdBy: 'Matti1',
        updatedBy: 'Matti1',
      })
      .returning('hilId')
      .executeTakeFirstOrThrow()
    hilId = hil.hilId

    const row = await db
      .insertInto('flight.defect')
      .values({
        aircraftRegistration: registration,
        ajlbSeqNo: ajlbSeqNo,
        description: 'transaction cluster fixture',
        flightMins: 0,
        status: 'ACTIVE',
        createdBy: 'Matti1',
        updatedBy: 'Matti1',
      })
      .returning('defectId')
      .executeTakeFirstOrThrow()
    defectId = row.defectId
  })

  afterEach(async () => {
    await db.deleteFrom('flight.defect').where('defectId', '=', defectId).execute()
    await db.deleteFrom('flight.maintenanceNote').where('noteId', '=', noteId).execute()
    await db.deleteFrom('flight.aircraftHil').where('hilId', '=', hilId).execute()
  })

  const statusOf = async (id: string) =>
    (
      await db
        .selectFrom('flight.defect')
        .select('status')
        .where('defectId', '=', id)
        .executeTakeFirstOrThrow()
    ).status

  it('applies a cross-module write inside a db transaction', async () => {
    await db.transaction().execute(async (trx) => {
      await resolveDefects([defectId], registration, noteId, 'Matti1', trx)
    })

    expect(await statusOf(defectId)).toBe('RESOLVED')
  })

  // The one that matters. If defect-queries ignored the `trx` it is handed and reached
  // for the module-level `db`, this write would land on a separate connection, commit
  // independently, and survive the rollback.
  it('rolls the write back when the transaction fails', async () => {
    await expect(
      db.transaction().execute(async (trx) => {
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
          .selectFrom('flight.aircraftHil')
          .select('restrictions')
          .where('hilId', '=', hilId)
          .executeTakeFirstOrThrow()
      ).restrictions

    expect(await restrictionsOf()).toBeNull()

    await expect(
      db.transaction().execute(async (trx) => {
        await updateAircraftHilEntry(hilId, { restrictions: 'Day VFR only' }, 'Matti1', trx)
        await setDefectsForHil(hilId, registration, [defectId], 'Matti1', trx)
        throw new Error('forced rollback')
      }),
    ).rejects.toThrow('forced rollback')

    // Neither module's write survived.
    expect(await restrictionsOf()).toBeNull()
    const defect = await db
      .selectFrom('flight.defect')
      .select('hilId')
      .where('defectId', '=', defectId)
      .executeTakeFirstOrThrow()
    expect(defect.hilId).toBeNull()
  })
})
