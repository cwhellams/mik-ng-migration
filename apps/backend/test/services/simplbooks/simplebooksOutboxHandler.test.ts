import { jest } from '@jest/globals'

import { randomUUID } from 'crypto'
import {
  MIKInvoiceType,
  SimplbooksEventType,
  SimplbooksStatus,
  type AcctsOutboxSimplbooks,
} from '../../../src/services/simplbooks/models.ts'
import {
  InvoiceMemberSchema,
  MIKLang,
  MIKMemberTypes,
  type InvoiceMember,
  type Member,
} from '../../../src/routes/members/models.ts'
import {
  buildCreditNotePayload,
  buildReceiptPayload,
  dispatchOutboxMsg,
  validateFlightsBillableMemberId,
} from '../../../src/services/simplbooks/simplbooksOutboxHandler.ts'
import type { InvoiceResponse } from '../../../src/services/simplbooks/models.ts'
import { simplbooksApiClient } from '../../../src/services/simplbooks/simplbooksApiClient.ts'
import {
  mockSimplbooksGet,
  mockSimplbooksPost,
  resetSimplbooksMockCounters,
} from '../../__mocks__/simplbooksMock.ts'
import {
  checkForOutboxStuckRows,
  deleteCreatedInvoice,
  deleteSimplbooksOutbox,
  expectAnnualFeeRecordForJoiningFeeInvoice,
  expectBillingIdSet,
  expectInvoiceForJoiningFee,
  expectInvoiceForMemberFee,
  expectOutbox1Row,
  insertStuckRowToOutbox,
  revertBillingIdChanges,
} from '../../db/__helpers__/simplbooksDbHelpers.ts'
import { checkAndClearStuckMessages } from '../../../src/db/outbox-simplbooks-queries.ts'
import { db } from '../../../src/db/connection.ts'
import type { Json } from '../../../src/db/schema.d.ts'

const newMemberId = 'Anna1'

const flyingMember: Member = {
  memberId: newMemberId,
  memberType: MIKMemberTypes.FLYING,
  email: 'jonny.rotten@spistols.com',
  firstName: 'Jonny',
  lastName: 'Rotten',
  streetAddress: 'Isotie 10 B2',
  postcode: '00340',
  townCity: 'Nummela',
  country: 'FI',
  lang: MIKLang.FI,
  createdAt: '2024-01-01T00:00:00Z',
  createdBy: 'admin',
  updatedAt: '2024-01-01T00:00:00Z',
  updatedBy: 'admin',
  isTrainingProgramPilot: false,
  canMakeReservations: true,
  isMembershipApproved: true,
  memberSince: '2021-01-01',
  roles: [],
}

const flyingMemberInvoiceMemberPayload: InvoiceMember = InvoiceMemberSchema.parse({
  ...flyingMember,
  autoRenewAnnualMembership: false,
  autoRenewEquipmentFee: false,
  billingId: 'BILL004',
})

const obMsgAddMember: AcctsOutboxSimplbooks = {
  created_at_utc: new Date(),
  event_type: SimplbooksEventType.ADD_MEMBER,
  id: randomUUID(),
  payload: flyingMemberInvoiceMemberPayload,
  status: SimplbooksStatus.PENDING,
}

const obMsgMembershipFeeInvoice: AcctsOutboxSimplbooks = {
  created_at_utc: new Date(),
  event_type: SimplbooksEventType.ANNUAL_MEMBERSHIP_FEE,
  id: randomUUID(),
  payload: { ...flyingMember, billingId: '8766623' },
  status: SimplbooksStatus.PENDING,
}

const obMsgNewMembershipFeeInvoice: AcctsOutboxSimplbooks = {
  created_at_utc: new Date(),
  event_type: SimplbooksEventType.NEW_MEMBER_FEES,
  id: randomUUID(),
  payload: { ...flyingMember, billingId: '8766624' },
  status: SimplbooksStatus.PENDING,
}

describe('Simplbooks Outbox Handler tests', () => {
  beforeAll(async () => {
    await deleteSimplbooksOutbox()
  })

  beforeEach(() => {
    resetSimplbooksMockCounters()
    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(mockSimplbooksPost)
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(mockSimplbooksGet)
  })

  afterEach(async () => {
    await deleteSimplbooksOutbox()
    jest.clearAllMocks()
  })

  it('dispatches outbox messages for add member', async () => {
    await dispatchOutboxMsg(obMsgAddMember)

    await expectBillingIdSet(newMemberId)
    await expectOutbox1Row(SimplbooksEventType.NEW_MEMBER_FEES)

    await revertBillingIdChanges(newMemberId, 'BILL004')
  })

  it('queues NEW_MEMBER_FEES with a billing ID set for an honorary member', async () => {
    const honoraryMember: Member = { ...flyingMember, memberType: MIKMemberTypes.HONORARY }
    const honoraryMemberPayload: InvoiceMember = InvoiceMemberSchema.parse({
      ...honoraryMember,
      autoRenewAnnualMembership: false,
      autoRenewEquipmentFee: false,
      billingId: 'BILL004',
    })
    const obMsgAddHonoraryMember: AcctsOutboxSimplbooks = {
      ...obMsgAddMember,
      id: randomUUID(),
      payload: honoraryMemberPayload,
    }

    await dispatchOutboxMsg(obMsgAddHonoraryMember)

    await expectBillingIdSet(newMemberId)
    await expectOutbox1Row(SimplbooksEventType.NEW_MEMBER_FEES)

    await revertBillingIdChanges(newMemberId, 'BILL004')
  })

  it('dispatches outbox messages for annual member fee', async () => {
    await dispatchOutboxMsg(obMsgMembershipFeeInvoice)

    await expectInvoiceForMemberFee(newMemberId)
    await revertBillingIdChanges(newMemberId, 'BILL004')
    await deleteCreatedInvoice(MIKInvoiceType.ANNUAL_FEE)
  })

  it('dispatches outbox messages for new member fees', async () => {
    await dispatchOutboxMsg(obMsgNewMembershipFeeInvoice)

    await expectInvoiceForJoiningFee(newMemberId)
    await expectAnnualFeeRecordForJoiningFeeInvoice(newMemberId)
    await revertBillingIdChanges(newMemberId, 'BILL004')
    await deleteCreatedInvoice(MIKInvoiceType.JOINING_FEE)
  })

  it('skips new member fees invoice when annual_fee row already exists (idempotency)', async () => {
    // First dispatch creates the invoice and annual_fee row normally
    await dispatchOutboxMsg(obMsgNewMembershipFeeInvoice)
    await expectInvoiceForJoiningFee(newMemberId)

    // Count SimplBooks post calls before the duplicate dispatch
    const baselineApiCallCount = (simplbooksApiClient.post as jest.Mock).mock.calls.length

    // Insert a duplicate outbox row and dispatch it — annual_fee row now exists, must be skipped
    const duplicateId = randomUUID()
    await db
      .insertInto('accts.outbox_simplbooks')
      .values({
        id: duplicateId,
        event_type: SimplbooksEventType.NEW_MEMBER_FEES,
        payload: obMsgNewMembershipFeeInvoice.payload as Json,
        created_at_utc: new Date(),
        updated_at_utc: new Date(),
        status: SimplbooksStatus.PENDING,
      })
      .execute()

    const duplicateMsg: AcctsOutboxSimplbooks = {
      ...obMsgNewMembershipFeeInvoice,
      id: duplicateId,
    }
    await dispatchOutboxMsg(duplicateMsg)

    // No additional SimplBooks calls should have been made
    expect((simplbooksApiClient.post as jest.Mock).mock.calls.length).toBe(baselineApiCallCount)

    // The duplicate outbox row should be marked SKIPPED
    const skipped = await db
      .selectFrom('accts.outbox_simplbooks')
      .selectAll()
      .where('id', '=', duplicateId)
      .executeTakeFirst()
    expect(skipped?.status).toBe(SimplbooksStatus.SKIPPED)

    await revertBillingIdChanges(newMemberId, 'BILL004')
    await deleteCreatedInvoice(MIKInvoiceType.JOINING_FEE)
  })

  it('checks and clears stuck outbox messages ', async () => {
    await insertStuckRowToOutbox()
    await checkAndClearStuckMessages()
    await checkForOutboxStuckRows()
  })

  describe('Flight invoice validation', () => {
    it('should not throw error when all flights have the same billable member ID', () => {
      const flights = [
        { flightId: 'FL001', billableMemberId: 'MEMBER123' },
        { flightId: 'FL002', billableMemberId: 'MEMBER123' },
        { flightId: 'FL003', billableMemberId: 'MEMBER123' },
      ]

      expect(() => validateFlightsBillableMemberId(flights, 'MEMBER123')).not.toThrow()
    })

    it('should throw error when one flight has a different billable member ID', () => {
      const flights = [
        { flightId: 'FL001', billableMemberId: 'MEMBER123' },
        { flightId: 'FL002', billableMemberId: 'MEMBER456' },
      ]

      expect(() => validateFlightsBillableMemberId(flights, 'MEMBER123')).toThrow(
        /Flight invoice validation failed.*MEMBER123.*1 flight\(s\).*FL002/,
      )
    })

    it('should throw error with multiple mismatched flights and include all flight IDs', () => {
      const flights = [
        { flightId: 'FL001', billableMemberId: 'MEMBER123' },
        { flightId: 'FL002', billableMemberId: 'MEMBER456' },
        { flightId: 'FL003', billableMemberId: 'MEMBER789' },
        { flightId: 'FL004', billableMemberId: 'MEMBER123' },
      ]

      expect(() => validateFlightsBillableMemberId(flights, 'MEMBER123')).toThrow(/FL002, FL003/)
    })

    it('should throw error message containing expected member ID and count of invalid flights', () => {
      const flights = [
        { flightId: 'FL001', billableMemberId: 'MEMBER123' },
        { flightId: 'FL002', billableMemberId: 'MEMBER456' },
        { flightId: 'FL003', billableMemberId: 'MEMBER789' },
      ]

      expect(() => validateFlightsBillableMemberId(flights, 'MEMBER123')).toThrow(
        /Expected all flights to have billable member ID MEMBER123.*found 2 flight\(s\)/,
      )
    })
  })

  describe('buildCreditNotePayload', () => {
    const baseInvoiceResponse: InvoiceResponse = {
      status: 200,
      duration: 0.1,
      data: {
        Invoice: {
          id: 42,
          client_id: 7,
          number: '2024-042',
          total_sum: 150.0,
          currency_name: 'EUR',
          currency_rate: 1,
          created: '2024-03-01',
        },
        Task: [
          {
            id: 10,
            name: 'Annual fee',
            price_per_unit: 75.0,
            amount: 2,
            Projects: [{ code: 'PROJ1' }],
          },
          {
            id: 11,
            name: 'Equipment fee',
            price_per_unit: 0,
            amount: 1,
            Projects: [],
          },
        ],
      },
    }

    it('strips the id from the invoice', async () => {
      const result = await buildCreditNotePayload(baseInvoiceResponse, '42', 'Test reason')
      expect(result.Invoice.id).toBeUndefined()
    })

    it('sets credit_invoice_for to the original invoice id', async () => {
      const result = await buildCreditNotePayload(baseInvoiceResponse, '42', 'Test reason')
      expect(result.Invoice.credit_invoice_for).toBe(42)
    })

    it('sets additional_info with the invoice id and reason', async () => {
      const result = await buildCreditNotePayload(baseInvoiceResponse, '42', 'Duplicate charge')
      expect(result.Invoice.additional_info).toBe(
        'Credit note for invoice 42. Reason: Duplicate charge',
      )
    })

    it('preserves other invoice fields from the original', async () => {
      const result = await buildCreditNotePayload(baseInvoiceResponse, '42', 'reason')
      expect(result.Invoice.client_id).toBe(7)
    })

    it('negates price_per_unit on each task', async () => {
      const result = await buildCreditNotePayload(baseInvoiceResponse, '42', 'reason')
      expect(result.Tasks[0].Task.price_per_unit).toBe(-75.0)
    })

    it('sets price_per_unit to 0 when original is 0', async () => {
      const result = await buildCreditNotePayload(baseInvoiceResponse, '42', 'reason')
      expect(result.Tasks[1].Task.price_per_unit).toBe(0)
    })

    it('strips the id from each task', async () => {
      const result = await buildCreditNotePayload(baseInvoiceResponse, '42', 'reason')
      result.Tasks.forEach((t) => expect(t.Task.id).toBeUndefined())
    })

    it('includes Projects from the original task', async () => {
      const result = await buildCreditNotePayload(baseInvoiceResponse, '42', 'reason')
      expect(result.Tasks[0].Projects).toEqual([{ code: 'PROJ1' }])
    })

    it('defaults to empty Projects array when task has no Projects', async () => {
      const invoiceWithNoProjects: InvoiceResponse = {
        ...baseInvoiceResponse,
        data: {
          ...baseInvoiceResponse.data,
          Task: [{ id: 20, name: 'Fee', price_per_unit: 50.0 }],
        },
      }
      const result = await buildCreditNotePayload(invoiceWithNoProjects, '42', 'reason')
      expect(result.Tasks[0].Projects).toEqual([])
    })
  })

  describe('buildReceiptPayload', () => {
    const validInvoice = {
      id: 99,
      client_id: 7,
      number: '2024-099',
      total_sum: 200.0,
      created: '2024-03-01',
    }

    it('maps total_sum to income_sum', () => {
      const result = buildReceiptPayload(validInvoice)
      expect(result.Incoming.income_sum).toBe(200.0)
    })

    it('maps created to income_date', () => {
      const result = buildReceiptPayload(validInvoice)
      expect(result.Incoming.income_date).toBe('2024-03-01')
    })

    it('maps client_id correctly', () => {
      const result = buildReceiptPayload(validInvoice)
      expect(result.Incoming.client_id).toBe(7)
    })

    it('sets description using invoice number when present', () => {
      const result = buildReceiptPayload(validInvoice)
      expect(result.Incoming.description).toBe('Invoice no. 2024-099')
    })

    it('falls back to invoice id in description when number is absent', () => {
      const { number: _n, ...invoiceWithoutNumber } = validInvoice
      const result = buildReceiptPayload(invoiceWithoutNumber)
      expect(result.Incoming.description).toBe('Invoice 99')
    })

    it('sets invoice_id from invoice id', () => {
      const result = buildReceiptPayload(validInvoice)
      expect(result.invoice_id).toBe(99)
    })

    it('throws when total_sum is missing', () => {
      const { total_sum: _ts, ...invoice } = validInvoice
      expect(() => buildReceiptPayload(invoice)).toThrow(
        'Cannot build receipt: invoice is missing total_sum',
      )
    })

    it('throws when created is missing', () => {
      const { created: _c, ...invoice } = validInvoice
      expect(() => buildReceiptPayload(invoice)).toThrow(
        'Cannot build receipt: invoice is missing created date',
      )
    })

    it('throws when client_id is missing', () => {
      const { client_id: _cid, ...invoice } = validInvoice
      expect(() => buildReceiptPayload(invoice)).toThrow(
        'Cannot build receipt: invoice is missing client_id',
      )
    })
  })
})
