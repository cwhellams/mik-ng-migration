import { jest } from '@jest/globals'
//import * as simplbooksApiClient from '../../../src/services/simplbooks/simplbooksApiClient.ts'
jest.unstable_mockModule('../../../src/services/simplbooks/simplbooksApiClient.ts', () => ({
  getItemByCode: jest.fn(),
}))

const { getItemByCode } = await import('../../../src/services/simplbooks/simplbooksApiClient.ts')

const { createNewMemberFeesInvoicePayload: createMembershipFeeInvoicePayload } = await import(
  '../../../src/services/accounting/recurringFeesInvoiceCreator.ts'
)

import { MIKLang, MIKMemberTypes, type Member } from '../../../src/routes/members/models.ts'

const flyingMember: Member = {
  memberId: 'abc123',
  memberType: MIKMemberTypes.FLYING,
  email: 'jonny.rotten@spistols.com',
  firstName: 'Jonny',
  lastName: 'Rotten',
  streetAddress: 'Isotie 10 B2',
  postcode: '00340',
  townCity: 'Nummela',
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

  it('creates an invoice template for a FLYING member', async () => {
    const mockedGetItemByCode = jest.mocked(getItemByCode)
    //;(getItemByCode as jest.Mock)
    mockedGetItemByCode.mockResolvedValue({
      id: 1,
      name: 'Flying Member',
      markup_value: 120.0,
    })

    var invoice = await createMembershipFeeInvoicePayload(flyingMember)
    expect(invoice).toMatchSnapshot()
  })

  it('creates an invoice template for a FLYING member', async () => {
    const juniorMember = { ...flyingMember, memberType: MIKMemberTypes.JUNIOR }

    const mockedGetItemByCode = jest.mocked(getItemByCode)

    //;(getItemByCode as jest.Mock)
    mockedGetItemByCode.mockResolvedValue({
      id: 2,
      name: 'Junior Member',
      markup_value: 50.0,
    })

    var invoice = await createMembershipFeeInvoicePayload(juniorMember)
    expect(invoice).toMatchSnapshot()
  })

  it('creates an invoice template for a supporting member', async () => {
    const supportingMember = { ...flyingMember, memberType: MIKMemberTypes.NONFLYING }

    const mockedGetItemByCode = jest.mocked(getItemByCode)

    //;(getItemByCode as jest.Mock<Promise<ItemListArticle>)
    mockedGetItemByCode.mockResolvedValue({
      id: 3,
      name: 'Supporting Member',
      markup_value: 80.0,
    })

    var invoice = await createMembershipFeeInvoicePayload(supportingMember)
    expect(invoice).toMatchSnapshot()
  })
})
