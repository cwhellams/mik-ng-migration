import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/liquid/api.ts'
import { LiquidType } from '@mik/contracts/liquid'
import {
  asAdmin,
  asMember,
  cleanupClaims,
  cleanupLiquid,
  HOME,
  insertRecord,
  JET_AIRCRAFT,
  mountRouter,
  trackedRecordIds,
} from './testSupport.ts'

const app = mountRouter('/liquid', router)

const cleanup = async () => {
  await cleanupClaims()
  await cleanupLiquid()
}

beforeEach(cleanup)
afterAll(cleanup)

/**
 * "All changes and deletions, by any user, must be audit logged."
 *
 * Enforced by a database trigger rather than by the service layer, so there is no
 * code path that can forget — which is exactly what these tests check: the audit
 * rows appear for writes made through the API *and* for a write made straight to
 * the table.
 */

const auditFor = (recordId: string) =>
  db
    .selectFrom('liquid.recordAudit')
    .selectAll()
    .where('recordId', '=', recordId)
    .orderBy('auditId', 'asc')
    .execute()

describe('liquid.record_audit', () => {
  it('records an insert with the member who reported it', async () => {
    const res = await request(app).post('/liquid/records').set('Cookie', asMember).send({
      liquidType: LiquidType.FUEL,
      aircraftRegistration: JET_AIRCRAFT,
      airport: HOME,
      fuelType: 'JET A-1',
      quantityLitres: 120,
    })
    trackedRecordIds.push(res.body.recordId)

    const audit = await auditFor(res.body.recordId)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ operationType: 'INSERT', changedBy: 'Matti1' })
    expect(audit[0]!.changedData).toBeNull()
  })

  it('records an update with both sides of the change', async () => {
    const recordId = await insertRecord({ quantityLitres: 100 })
    await request(app)
      .patch(`/liquid/records/${recordId}`)
      .set('Cookie', asMember)
      .send({ quantityLitres: 175 })

    const audit = await auditFor(recordId)
    const update = audit.find((a) => a.operationType === 'UPDATE')

    expect(update).toBeDefined()
    // The snapshots are whole rows written by `to_jsonb(OLD)`, so their keys are
    // the real snake_case column names — this is the JSON that
    // `maintainNestedObjectKeys: true` exists to keep intact.
    const before = update!.changedData as Record<string, unknown>
    const after = update!.newData as Record<string, unknown>
    expect(before.quantity_litres).toBe(100)
    expect(after.quantity_litres).toBe(175)
    // And the camelCase spelling is absent, which is the half that would break
    // silently if the plugin ever recursed into JSONB values.
    expect(after.quantityLitres).toBeUndefined()
  })

  it('distinguishes a soft delete from an ordinary update', async () => {
    const recordId = await insertRecord()
    await request(app).delete(`/liquid/records/${recordId}`).set('Cookie', asMember)

    const audit = await auditFor(recordId)
    expect(audit.map((a) => a.operationType)).toEqual(['INSERT', 'SOFT_DELETE'])
  })

  it('names the admin who deleted another member’s record, not the owner', async () => {
    const recordId = await insertRecord({ memberId: 'Matti1' })
    await request(app).delete(`/liquid/records/${recordId}`).set('Cookie', asAdmin)

    const audit = await auditFor(recordId)
    expect(audit.at(-1)).toMatchObject({ operationType: 'SOFT_DELETE', changedBy: 'k1mnimda' })
  })

  it('audits a write made straight to the table, bypassing every route', async () => {
    // The reason this is a trigger: a future code path that forgets to log
    // cannot exist.
    const recordId = await insertRecord()
    await db
      .updateTable('liquid.record')
      .set({ quantityLitres: 42, updatedBy: 'simplbks' })
      .where('recordId', '=', recordId)
      .execute()

    const audit = await auditFor(recordId)
    expect(audit.at(-1)).toMatchObject({ operationType: 'UPDATE', changedBy: 'simplbks' })
  })

  it('audits a hard delete as a safety net', async () => {
    // The application only ever soft-deletes, but a manual cleanup should still
    // leave a trace. The audit row has no FK to the record, so it survives.
    const recordId = await insertRecord()
    await db.deleteFrom('liquid.record').where('recordId', '=', recordId).execute()

    const audit = await auditFor(recordId)
    expect(audit.at(-1)!.operationType).toBe('DELETE')
    // Already gone from the table, so the shared cleanup has nothing to do.
    trackedRecordIds.splice(trackedRecordIds.indexOf(recordId), 1)
    await db.deleteFrom('liquid.recordAudit').where('recordId', '=', recordId).execute()
  })

  it('keeps one row per change, in order', async () => {
    const recordId = await insertRecord()
    await request(app)
      .patch(`/liquid/records/${recordId}`)
      .set('Cookie', asMember)
      .send({ quantityLitres: 110 })
    await request(app)
      .patch(`/liquid/records/${recordId}`)
      .set('Cookie', asMember)
      .send({ quantityLitres: 120 })
    await request(app).delete(`/liquid/records/${recordId}`).set('Cookie', asMember)

    const audit = await auditFor(recordId)
    expect(audit.map((a) => a.operationType)).toEqual(['INSERT', 'UPDATE', 'UPDATE', 'SOFT_DELETE'])
  })
})
