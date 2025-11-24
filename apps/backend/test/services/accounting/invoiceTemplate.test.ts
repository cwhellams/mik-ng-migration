import { MIKLang, MIKMemberTypes, type Member } from '../../../src/routes/members/models.ts'
import { createInvoicePostPayload } from '../../../src/services/accounting/invoiceTemplate.ts'

const invoicingMember: Member = {
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
  autoRenewAnnualMembership: true,
  autoRenewEquipmentFee: false,
  isMembershipExpired: false,
}

describe('Invoice Template Tests', () => {
  it('creates an invoice template for a member', () => {
    var invoice = createInvoicePostPayload(invoicingMember)

    expect(invoice).toMatchSnapshot()
  })

  it('creates an invoice template with zero late fee for a member', () => {
    var invoice = createInvoicePostPayload(invoicingMember, true)

    expect(invoice).toMatchSnapshot()
  })

  it('should t hrow when no billing id for member', () => {
    const { billingId, ...memberWithoutBillingId } = invoicingMember

    expect(() => createInvoicePostPayload(memberWithoutBillingId)).toThrow(
      'Error creating membership fee invoice, no billing id for member !',
    )
  })
})
