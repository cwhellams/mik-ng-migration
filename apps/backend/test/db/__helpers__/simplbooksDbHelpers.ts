import { randomUUID } from 'crypto'
import { db } from '../../../src/db/connection.ts'
import { SimplbooksEventType } from '../../../src/services/simplbooks/models.ts'
import { MIKInvoiceType } from '@mik/contracts/invoicing'

export const deleteSimplbooksOutbox = async () =>
  await db.deleteFrom('accts.outboxSimplbooks').execute()

export const deleteCreatedInvoice = async (invoiceType: MIKInvoiceType) => {
  // Delete annual_fees records first due to foreign key constraint
  await db.deleteFrom('member.annualFees').where('memberId', '=', 'Anna1').execute()

  await db
    .deleteFrom('accts.invoice')
    .where('memberId', '=', 'Anna1')
    .where('invoiceType', '=', invoiceType)
    .execute()
}

// Baseline catalog rows go up to id 76 (V100__Items.sql, V380__MembershipFeeItemsTestData.sql,
// which mirrors real accts.items ids and isn't sequential); everything above that is
// test-created and safe to sweep.
export const deleteCreatedInvoiceItems = async () =>
  await db.deleteFrom('accts.items').where('id', '>', 76).execute()

// export const expectAddMember1Row = async () => {
//   const result = await db.selectFrom('accts.outboxSimplbooks').selectAll().execute()

//   expect(result.length).toEqual(1)
//   expect(result[0].event_type).toEqual('addMember')
// }

export const expectOutbox1Row = async (eventType: SimplbooksEventType) => {
  const result = await db.selectFrom('accts.outboxSimplbooks').selectAll().execute()

  expect(result.length).toEqual(1)
  expect(result[0].eventType).toEqual(eventType)

  return result[0]
}

export const expectBillingIdSet = async (memberId: string) => {
  const result = await db
    .selectFrom('member.register')
    .selectAll()
    .where('memberId', '=', memberId)
    .execute()

  expect(result.length).toEqual(1)
  expect(result[0].billingId).toEqual('123457')
  expect(result[0].updatedBy).toEqual('simplbks')
}

export const expectInvoiceForMemberFee = async (memberId: string) => {
  const result = await db
    .selectFrom('accts.invoice')
    .selectAll()
    .where('memberId', '=', memberId)
    .where('invoiceType', '=', MIKInvoiceType.ANNUAL_FEE)
    .execute()

  expect(result.length).toEqual(1)
  expect(result[0].invoiceType).toEqual(MIKInvoiceType.ANNUAL_FEE)
  expect(result[0].updatedBy).toEqual('simplbks')
}

export const expectInvoiceForJoiningFee = async (memberId: string) => {
  const result = await db
    .selectFrom('accts.invoice')
    .selectAll()
    .where('memberId', '=', memberId)
    .where('invoiceType', '=', MIKInvoiceType.JOINING_FEE)
    .execute()

  expect(result.length).toEqual(1)
  expect(result[0].invoiceType).toEqual(MIKInvoiceType.JOINING_FEE)
  expect(result[0].updatedBy).toEqual('simplbks')
}

export const revertBillingIdChanges = async (memberId: string, billingId: string) => {
  await db
    .updateTable('member.register')
    .set({
      billingId: 'BILL004',
      updatedBy: 'k1mnimda',
    })
    .where('memberId', '=', memberId)
    .execute()
}

export const expectAnnualFeeRecordForJoiningFeeInvoice = async (memberId: string) => {
  const invoice = await db
    .selectFrom('accts.invoice')
    .select(['id'])
    .where('memberId', '=', memberId)
    .where('invoiceType', '=', MIKInvoiceType.JOINING_FEE)
    .executeTakeFirstOrThrow()

  const result = await db
    .selectFrom('member.annualFees')
    .selectAll()
    .where('memberId', '=', memberId)
    .where('feeType', '=', 'annual_fee')
    .where('invoiceId', '=', Number(invoice.id))
    .execute()

  expect(result.length).toEqual(1)
  expect(result[0].feeType).toEqual('annual_fee')
}

export const insertStuckRowToOutbox = async () => {
  await db
    .insertInto('accts.outboxSimplbooks')
    .values({
      id: randomUUID(),
      eventType: SimplbooksEventType.ADD_MEMBER,
      payload: '{}',
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
      status: 'PROCESSING',
    })
    .execute()
}

export const checkForOutboxStuckRows = async () => {
  var results = await db
    .selectFrom('accts.outboxSimplbooks')
    .where('status', '=', 'PROCESSING')
    .execute()

  expect(results.length).toBe(0)
}
