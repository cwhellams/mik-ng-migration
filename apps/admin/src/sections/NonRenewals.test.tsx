import { MIKLang, MIKMemberTypes, type NonRenewalMember } from '@mik/contracts/members'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiUrl } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import NonRenewals from './NonRenewals'

/**
 * Four of this page's strings interpolate a member's name into a confirmation
 * or a result message. Issue #1255: i18next escaped the interpolated value, so
 * a name like `O'Brien` reached the prompt as `O&#39;Brien`.
 */
const aNonRenewalMember = (overrides: Partial<NonRenewalMember> = {}): NonRenewalMember => ({
  memberId: '1001',
  firstName: 'Niko',
  lastName: "O'Brien",
  email: 'niko@example.com',
  phoneNumber: null,
  memberType: MIKMemberTypes.FLYING,
  lang: MIKLang.EN,
  autoRenewAnnualMembership: false,
  feeStatus: 'no_record',
  invoiceSentAt: null,
  invoiceDueAt: null,
  lastReminderSentAt: null,
  billableFlightCount: 0,
  ...overrides,
})

const nonRenewalsApi = (members: NonRenewalMember[] = [aNonRenewalMember()]) => {
  const writes: { path: string }[] = []

  server.use(
    http.get(apiUrl('v1/members/non-renewals'), () => HttpResponse.json({ members, year: 2026 })),
    http.post(apiUrl('v1/members/:memberId/send-renewal-reminder'), ({ params }) => {
      writes.push({ path: String(params.memberId) })
      return new HttpResponse(null, { status: 204 })
    }),
    http.post(apiUrl('v1/members/:memberId/deactivate'), ({ params }) => {
      writes.push({ path: String(params.memberId) })
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return writes
}

afterEach(() => vi.restoreAllMocks())

describe('NonRenewals', () => {
  it('names the member in the reminder prompt without escaping the apostrophe (issue #1255)', async () => {
    nonRenewalsApi()
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)

    const { user } = renderWithProviders(<NonRenewals />)
    await user.click(await screen.findByRole('button', { name: /Send Reminder/ }))

    expect(confirm).toHaveBeenCalledWith("Send a final renewal reminder email to Niko O'Brien?")
  })

  it('names the member in the removal prompt unescaped', async () => {
    nonRenewalsApi()
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)

    const { user } = renderWithProviders(<NonRenewals />)
    await user.click(await screen.findByRole('button', { name: /Remove/ }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Niko O'Brien"))
    expect(confirm.mock.calls[0]?.[0]).not.toContain('&#39;')
  })

  it('reports success with the name unescaped once the reminder is sent', async () => {
    const writes = nonRenewalsApi()
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { user } = renderWithProviders(<NonRenewals />)
    await user.click(await screen.findByRole('button', { name: /Send Reminder/ }))

    // The name also appears in the row, so assert the success message exactly.
    expect(await screen.findByText("Reminder email sent to Niko O'Brien")).toBeInTheDocument()
    expect(writes).toHaveLength(1)
  })

  it("labels the row checkbox with the member's name", async () => {
    nonRenewalsApi()

    renderWithProviders(<NonRenewals />)

    // Rendered via a template literal rather than a translation, so it is the
    // control case: it was never escaped, and must still match.
    expect(await screen.findByRole('checkbox', { name: "select Niko O'Brien" })).toBeInTheDocument()
  })
})
