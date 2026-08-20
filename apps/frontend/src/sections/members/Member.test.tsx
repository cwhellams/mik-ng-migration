import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { MIKMemberTypes, MIKPermissions } from '@mik/contracts/members'
import { renderAs } from '../../test/auth'
import { aMember, aRoleWithPermissions } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import MemberProfile from './Member'

const removedMember = aMember({
  memberId: 'Removed1',
  memberType: MIKMemberTypes.REMOVED,
  roles: [],
})

/** An admin who only holds MEMBER_ADMIN — keeps AdminBookingsCard from mounting and needing its own mock. */
const membersAdmin = aMember({
  memberId: 'MembersAdmin1',
  roles: [aRoleWithPermissions(MIKPermissions.MEMBER_ADMIN)],
})

const mockMemberEndpoints = () => {
  server.use(
    http.get(apiUrl(`v1/members/${removedMember.memberId}`), () =>
      HttpResponse.json(removedMember),
    ),
    http.get(apiUrl('v1/members/mailing-lists'), () => HttpResponse.json([])),
    http.get(apiUrl(`v1/members/${removedMember.memberId}/invoices`), () =>
      HttpResponse.json({ invoices: [] }),
    ),
    http.get(apiUrl(`v1/members/${removedMember.memberId}/flights`), () =>
      HttpResponse.json({ logs: [] }),
    ),
  )
}

const renderProfile = () =>
  renderAs({ name: 'members admin', member: membersAdmin, sudo: true }, <MemberProfile />, {
    route: `/club/members/${removedMember.memberId}`,
    path: '/club/members/:memberId',
  })

describe('Member profile restore', () => {
  it('shows a Restore Member button for a removed member, not Deactivate', async () => {
    mockMemberEndpoints()

    renderProfile()

    expect(await screen.findByRole('button', { name: 'Restore' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate Member' })).not.toBeInTheDocument()
  })

  it('restores the member and shows the credited-fee and roles warnings', async () => {
    mockMemberEndpoints()
    server.use(
      http.post(apiUrl(`v1/members/${removedMember.memberId}/restore`), () =>
        HttpResponse.json({ member: removedMember, hadCreditedFee: true }),
      ),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { user } = renderProfile()

    await user.click(await screen.findByRole('button', { name: 'Restore' }))

    await waitFor(() =>
      expect(screen.getByText(/annual\/joining fee was credited/i)).toBeInTheDocument(),
    )
    expect(screen.getByText(/roles were cleared/i)).toBeInTheDocument()
  })

  it('omits the credited-fee warning when the fee was not credited', async () => {
    mockMemberEndpoints()
    server.use(
      http.post(apiUrl(`v1/members/${removedMember.memberId}/restore`), () =>
        HttpResponse.json({ member: removedMember, hadCreditedFee: false }),
      ),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { user } = renderProfile()

    await user.click(await screen.findByRole('button', { name: 'Restore' }))

    await waitFor(() => expect(screen.getByText(/roles were cleared/i)).toBeInTheDocument())
    expect(screen.queryByText(/annual\/joining fee was credited/i)).not.toBeInTheDocument()
  })
})
