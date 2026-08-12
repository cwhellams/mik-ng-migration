import { randomUUID } from 'crypto'
import { db } from '../../../src/db/connection.ts'
import { SimplbooksEventType } from '../../../src/services/simplbooks/models.ts'
import { MIKInvoiceType } from '@mik/contracts/invoicing'

export const deleteSimplbooksOutbox = async () =>
  await db.deleteFrom('accts.outbox_simplbooks').execute()

export const deleteCreatedInvoice = async (invoiceType: MIKInvoiceType) => {
  // Delete annual_fees records first due to foreign key constraint
  await db.deleteFrom('member.annual_fees').where('member_id', '=', 'Anna1').execute()

  await db
    .deleteFrom('accts.invoice')
    .where('member_id', '=', 'Anna1')
    .where('invoice_type', '=', invoiceType)
    .execute()
}

export const deleteCreatedInvoiceItems = async () =>
  await db.deleteFrom('accts.items').where('id', '>', 30).execute()

// export const expectAddMember1Row = async () => {
//   const result = await db.selectFrom('accts.outbox_simplbooks').selectAll().execute()

//   expect(result.length).toEqual(1)
//   expect(result[0].event_type).toEqual('addMember')
// }

export const expectOutbox1Row = async (eventType: SimplbooksEventType) => {
  const result = await db.selectFrom('accts.outbox_simplbooks').selectAll().execute()

  expect(result.length).toEqual(1)
  expect(result[0].event_type).toEqual(eventType)

  return result[0]
}

export const expectBillingIdSet = async (memberId: string) => {
  const result = await db
    .selectFrom('member.register')
    .selectAll()
    .where('member_id', '=', memberId)
    .execute()

  expect(result.length).toEqual(1)
  expect(result[0].billing_id).toEqual('123457')
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

export const expectInvoiceForJoiningFee = async (memberId: string) => {
  const result = await db
    .selectFrom('accts.invoice')
    .selectAll()
    .where('member_id', '=', memberId)
    .where('invoice_type', '=', MIKInvoiceType.JOINING_FEE)
    .execute()

  expect(result.length).toEqual(1)
  expect(result[0].invoice_type).toEqual(MIKInvoiceType.JOINING_FEE)
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

export const expectAnnualFeeRecordForJoiningFeeInvoice = async (memberId: string) => {
  const invoice = await db
    .selectFrom('accts.invoice')
    .select(['id'])
    .where('member_id', '=', memberId)
    .where('invoice_type', '=', MIKInvoiceType.JOINING_FEE)
    .executeTakeFirstOrThrow()

  const result = await db
    .selectFrom('member.annual_fees')
    .selectAll()
    .where('member_id', '=', memberId)
    .where('fee_type', '=', 'annual_fee')
    .where('invoice_id', '=', Number(invoice.id))
    .execute()

  expect(result.length).toEqual(1)
  expect(result[0].fee_type).toEqual('annual_fee')
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
