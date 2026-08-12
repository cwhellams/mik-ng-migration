import { jest } from '@jest/globals'
//import * as simplbooksApiClient from '../../../src/services/simplbooks/simplbooksApiClient.ts'
jest.unstable_mockModule('../../../src/services/simplbooks/simplbooksApiClient.ts', () => ({
  getItemByCode: jest.fn(),
}))

const { getItemByCode } = await import('../../../src/services/simplbooks/simplbooksApiClient.ts')

const { createNewMemberFeesInvoicePayload: createMembershipFeeInvoicePayload } =
  await import('../../../src/services/accounting/recurringFeesInvoiceCreator.ts')

import { MIKLang, MIKMemberTypes, type Member } from '@mik/contracts/members'

// A date in January — before both discount cutoffs (Sept 1 and Oct 1)
const DATE_BEFORE_DISCOUNTS = new Date('2025-01-15T12:00:00Z')
// A date on October 1 — membership fee discount applies
const DATE_AFTER_MEMBERSHIP_DISCOUNT = new Date('2025-10-01T12:00:00Z')

const flyingMember: Member = {
  memberId: 'abc123',
  memberType: MIKMemberTypes.FLYING,
  email: 'jonny.rotten@spistols.com',
  firstName: 'Jonny',
  lastName: 'Rotten',
  streetAddress: 'Isotie 10 B2',
  postcode: '00340',
  townCity: 'Nummela',
  country: 'FI',
  lang: MIKLang.FI,
  billingId: '123456',
  createdAt: '2024-01-01T00:00:00Z',
  createdBy: 'admin',
  updatedAt: '2024-01-01T00:00:00Z',
  updatedBy: 'admin',
  isTrainingProgramPilot: false,
  canMakeReservations: true,
  isMembershipApproved: true,
  memberSince: '2021-01-01T00:00:00Z',
  roles: [],
}

describe('Membership Fee Invoice Payload Tests', () => {
  beforeAll(() => {
    jest.clearAllMocks()
  })

  describe('without seasonal discount (before October 1)', () => {
    it('creates an invoice template for a FLYING member', async () => {
      const mockedGetItemByCode = jest.mocked(getItemByCode)
      mockedGetItemByCode.mockResolvedValue({
        id: 1,
        name: 'Flying Member',
        markup_value: 120.0,
      })

      var invoice = await createMembershipFeeInvoicePayload(flyingMember, DATE_BEFORE_DISCOUNTS)
      expect(invoice).toMatchSnapshot()
    })

    it('creates an invoice template for a JUNIOR member', async () => {
      const juniorMember = { ...flyingMember, memberType: MIKMemberTypes.JUNIOR }

      const mockedGetItemByCode = jest.mocked(getItemByCode)
      mockedGetItemByCode.mockResolvedValue({
        id: 2,
        name: 'Junior Member',
        markup_value: 50.0,
      })

      var invoice = await createMembershipFeeInvoicePayload(juniorMember, DATE_BEFORE_DISCOUNTS)
      expect(invoice).toMatchSnapshot()
    })

    it('creates an invoice template for a supporting member', async () => {
      const supportingMember = { ...flyingMember, memberType: MIKMemberTypes.NONFLYING }

      const mockedGetItemByCode = jest.mocked(getItemByCode)
      mockedGetItemByCode.mockResolvedValue({
        id: 3,
        name: 'Supporting Member',
        markup_value: 80.0,
      })

      var invoice = await createMembershipFeeInvoicePayload(supportingMember, DATE_BEFORE_DISCOUNTS)
      expect(invoice).toMatchSnapshot()
    })

    it('creates an invoice template for an HONORARY member with 100% discount and note', async () => {
      const honoraryMember = { ...flyingMember, memberType: MIKMemberTypes.HONORARY }

      const mockedGetItemByCode = jest.mocked(getItemByCode)
      mockedGetItemByCode.mockResolvedValue({
        id: 1,
        name: 'Flying Member',
        markup_value: 120.0,
      })

      const invoice = await createMembershipFeeInvoicePayload(honoraryMember, DATE_BEFORE_DISCOUNTS)

      // Both tasks must have 100% discount
      expect(invoice.Tasks[0].Task.discount).toBe(100)
      expect(invoice.Tasks[1].Task.discount).toBe(100)
      // Invoice must carry the honorary note
      expect(invoice.Invoice.additional_info).toBe('Honorary member — fees fully discounted')
      expect(invoice).toMatchSnapshot()
    })
  })

  describe('with 50% membership fee seasonal discount (on or after October 1)', () => {
    it('applies 50% discount to membership fee for a FLYING member', async () => {
      const mockedGetItemByCode = jest.mocked(getItemByCode)
      mockedGetItemByCode.mockResolvedValue({
        id: 1,
        name: 'Flying Member',
        markup_value: 120.0,
      })

      const invoice = await createMembershipFeeInvoicePayload(
        flyingMember,
        DATE_AFTER_MEMBERSHIP_DISCOUNT,
      )

      // Joining fee task should have no discount
      expect(invoice.Tasks[0].Task.discount).toBeUndefined()
      // Membership fee task should have 50% discount
      expect(invoice.Tasks[1].Task.discount).toBe(50)
      expect(invoice).toMatchSnapshot()
    })

    it('applies 50% discount to membership fee for a JUNIOR member', async () => {
      const juniorMember = { ...flyingMember, memberType: MIKMemberTypes.JUNIOR }
      const mockedGetItemByCode = jest.mocked(getItemByCode)
      mockedGetItemByCode.mockResolvedValue({
        id: 2,
        name: 'Junior Member',
        markup_value: 50.0,
      })

      const invoice = await createMembershipFeeInvoicePayload(
        juniorMember,
        DATE_AFTER_MEMBERSHIP_DISCOUNT,
      )

      expect(invoice.Tasks[0].Task.discount).toBeUndefined()
      expect(invoice.Tasks[1].Task.discount).toBe(50)
    })

    it('always applies 100% discount for an HONORARY member regardless of season', async () => {
      const honoraryMember = { ...flyingMember, memberType: MIKMemberTypes.HONORARY }
      const mockedGetItemByCode = jest.mocked(getItemByCode)
      mockedGetItemByCode.mockResolvedValue({
        id: 1,
        name: 'Flying Member',
        markup_value: 120.0,
      })

      const invoice = await createMembershipFeeInvoicePayload(
        honoraryMember,
        DATE_AFTER_MEMBERSHIP_DISCOUNT,
      )

      // Both tasks must carry the full honorary discount, not the seasonal 50%
      expect(invoice.Tasks[0].Task.discount).toBe(100)
      expect(invoice.Tasks[1].Task.discount).toBe(100)
      expect(invoice.Invoice.additional_info).toBe('Honorary member — fees fully discounted')
    })
  })
})
