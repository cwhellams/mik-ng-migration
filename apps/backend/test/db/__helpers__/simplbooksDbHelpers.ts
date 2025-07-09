import { randomUUID } from 'crypto'
import { db } from '../../../src/db/connection.ts'
import { MIKInvoiceType, SimplbooksEventType } from '../../../src/services/simplbooks/models.ts'

export const deleteSimplbooksOutbox = async () =>
  await db.deleteFrom('accts.outbox_simplbooks').execute()

export const deleteCreatedInvoice = async () =>
  await db
    .deleteFrom('accts.invoice')
    .where('member_id', '=', 'Anna1')
    .where('invoice_type', '=', MIKInvoiceType.ANNUAL_FEE)
    .execute()

export const deleteCreatedInvoiceItems = async () =>
  await db.deleteFrom('accts.items').where('id', '>', 30).execute()

// export const expectAddMember1Row = async () => {
//   const result = await db.selectFrom('accts.outbox_simplbooks').selectAll().execute()

//   expect(result.length).toEqual(1)
//   expect(result[0].event_type).toEqual('addMember')
// }

export const expectmemberFee1Row = async () => {
  const result = await db.selectFrom('accts.outbox_simplbooks').selectAll().execute()

  expect(result.length).toEqual(1)
  expect(result[0].event_type).toEqual('membershipFee')
}

export const expectBillingIdSet = async (memberId: string) => {
  const result = await db
    .selectFrom('member.register')
    .selectAll()
    .where('member_id', '=', memberId)
    .execute()

  expect(result.length).toEqual(1)
  expect(result[0].billing_id).toEqual('123456')
  expect(result[0].updated_by).toEqual('simplbks')
}

export const expectInvoiceForMemberFee = async (memberId: string) => {
  const result = await db
    .selectFrom('accts.invoice')
    .selectAll()
    .where('member_id', '=', memberId)
    .where('invoice_type', '=', MIKInvoiceType.ANNUAL_FEE)
    .execute()

  expect(result.length).toEqual(1)
  expect(result[0].invoice_type).toEqual(MIKInvoiceType.ANNUAL_FEE)
  expect(result[0].updated_by).toEqual('simplbks')
}

export const revertBillingIdChanges = async (memberId: string, billingId: string) => {
  await db
    .updateTable('member.register')
    .set({
      billing_id: 'BILL004',
      updated_by: 'k1mnimda',
    })
    .where('member_id', '=', memberId)
    .execute()
}

export const insertStuckRowToOutbox = async () => {
  await db
    .insertInto('accts.outbox_simplbooks')
    .values({
      id: randomUUID(),
      event_type: SimplbooksEventType.ADD_MEMBER,
      payload: '{}',
      created_at_utc: new Date(),
      updated_at_utc: new Date(),
      status: 'PROCESSING',
    })
    .execute()
}

export const checkForOutboxStuckRows = async () => {
  var results = await db
    .selectFrom('accts.outbox_simplbooks')
    .where('status', '=', 'PROCESSING')
    .execute()

  expect(results.length).toBe(0)
}
