import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { MIKMemberTypes } from '@mik/contracts/members'
import { authScenarios, renderAs } from '../../test/auth'
import { aMember } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import MemberTrash from './MemberTrash'

const removedMember = aMember({
  memberId: 'Removed1',
  firstName: 'Poistettu',
  lastName: 'Jäsen',
  memberType: MIKMemberTypes.REMOVED,
  roles: [],
})

const trashList = () => ({
  members: [
    {
      memberId: removedMember.memberId,
      first: removedMember.firstName,
      last: removedMember.lastName,
      email: removedMember.email,
      roles: [],
      lang: removedMember.lang,
    },
  ],
})

describe('MemberTrash restore', () => {
  it('does not offer restore to a non-admin', async () => {
    server.use(http.get(apiUrl('v1/members/trash'), () => HttpResponse.json(trashList())))

    renderAs(authScenarios.user, <MemberTrash />)

    expect(
      await screen.findByText('You do not have permission to view this page.'),
    ).toBeInTheDocument()
  })

  it('restores a member and refreshes the list on confirm', async () => {
    server.use(http.get(apiUrl('v1/members/trash'), () => HttpResponse.json(trashList())))

    let restoreCalls = 0
    server.use(
      http.post(apiUrl(`v1/members/${removedMember.memberId}/restore`), () => {
        restoreCalls++
        return HttpResponse.json({ member: removedMember, hadCreditedFee: true })
      }),
    )

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { user } = renderAs(authScenarios.admin, <MemberTrash />)

    await user.click(await screen.findByRole('button', { name: /restore/i }))

    await waitFor(() => expect(restoreCalls).toBe(1))
    expect(await screen.findByText(/annual\/joining fee was credited/i)).toBeInTheDocument()
    expect(await screen.findByText(/roles were cleared/i)).toBeInTheDocument()
  })

  it('does not call restore when the confirmation is dismissed', async () => {
    server.use(http.get(apiUrl('v1/members/trash'), () => HttpResponse.json(trashList())))

    let restoreCalls = 0
    server.use(
      http.post(apiUrl(`v1/members/${removedMember.memberId}/restore`), () => {
        restoreCalls++
        return HttpResponse.json({ member: removedMember, hadCreditedFee: false })
      }),
    )

    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const { user } = renderAs(authScenarios.admin, <MemberTrash />)

    await user.click(await screen.findByRole('button', { name: /restore/i }))

    expect(restoreCalls).toBe(0)
  })
})
