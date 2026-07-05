import { describe, expect, it } from '@jest/globals'
import { MIKLang, MIKMemberTypes, type Member } from '../../../src/routes/members/models.ts'
import {
  PurchasePostSchema,
  PurchaseRowWrapperSchema,
  mapMIKLangToSimplbooksLanguage,
  mapMemberToClient,
} from '../../../src/services/simplbooks/models.ts'

const baseMember: Member = {
  memberId: 'M1',
  memberType: MIKMemberTypes.FLYING,
  email: 'member@example.com',
  firstName: 'Matti',
  lastName: 'Meikalainen',
  streetAddress: 'Street 1',
  postcode: '00100',
  townCity: 'Helsinki',
  phoneNumber: '+35840111222',
  iban: 'FI2112345600000785',
  ibanAccountName: 'Matti Meikalainen',
  lang: MIKLang.FI,
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'admin',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'admin',
  isTrainingProgramPilot: false,
  canMakeReservations: true,
  isMembershipApproved: true,
  memberSince: '2024-01-01',
  roles: [],
}

describe('simplbooks models', () => {
  it('maps language values to SimplBooks language codes', () => {
    expect(mapMIKLangToSimplbooksLanguage(MIKLang.EN)).toBe('en_GB')
    expect(mapMIKLangToSimplbooksLanguage(MIKLang.FI)).toBe('fi_FI')
    expect(mapMIKLangToSimplbooksLanguage(MIKLang.SV)).toBe('sv_SE')
    expect(mapMIKLangToSimplbooksLanguage('unexpected')).toBe('fi_FI')
  })

  it('maps member to client and prefers IBAN override', () => {
    const client = mapMemberToClient(baseMember, 'FI0099999999999999')

    expect(client.Client.e_mail).toBe(baseMember.email)
    expect(client.Client.account_no).toBe('FI0099999999999999')
    expect(client.Client.client_settings_language).toBe('fi_FI')
  })

  it('omits account_no when no IBAN is present', () => {
    const memberWithoutIban: Member = { ...baseMember, iban: undefined }
    const client = mapMemberToClient(memberWithoutIban)

    expect(client.Client.account_no).toBeUndefined()
  })

  it('defaults wrapper Projects to empty array', () => {
    const row = PurchaseRowWrapperSchema.parse({
      PurchaseRow: {
        name: 'Fuel',
        amount: 2,
        sum: 100,
        vat: 25.5,
      },
    })

    expect(row.Projects).toEqual([])
  })

  it('accepts PurchaseRows with PurchaseRow wrapper and per-row Projects', () => {
    const payload = PurchasePostSchema.parse({
      Purchase: {
        created: '2026-01-01',
        currency_name: 'EUR',
        comments: 'Expense claim title',
      },
      PurchaseRows: [
        {
          PurchaseRow: {
            name: 'Oil',
            amount: 1,
            sum: 35,
            vat: 25.5,
            Projects: [{ code: 'OH' }],
          },
          Projects: [{ code: 'OH' }],
        },
      ],
    })

    expect(payload.PurchaseRows[0].PurchaseRow.Projects).toEqual([{ code: 'OH' }])
  })

  it('rejects legacy PurchaseRows shape without PurchaseRow wrapper', () => {
    expect(() =>
      PurchasePostSchema.parse({
        Purchase: {
          created: '2026-01-01',
          currency_name: 'EUR',
        },
        PurchaseRows: [
          {
            name: 'Legacy row',
            amount: 1,
            sum: 10,
            vat: 25.5,
          },
        ],
      }),
    ).toThrow()
  })
})
