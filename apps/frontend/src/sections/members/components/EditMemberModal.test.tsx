// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Member, MemberListResponse, MIKLang, MIKMemberTypes } from '@backend/routes/members/models'
import type { APIMutation } from '../../../hooks/useApi'
import { EditMemberModal } from './EditMemberModal'
import '../../../i18n'

// The modal fetches the instructor list through useApi; stub it out so no HTTP
// (or SWR cache) is involved. The mutation API is injected as a prop, so the
// submitted payload is captured there instead.
vi.mock('../../../hooks/useApi', () => {
  const instructors: MemberListResponse['members'] = [
    {
      memberId: 'Jukka1',
      first: 'Jukka',
      last: 'Nieminen',
      email: 'jukka@example.com',
      roles: ['INSTRUCTOR'],
      lang: MIKLang.FI,
    },
  ]
  return { default: () => ({ data: { members: instructors } }) }
})

const memberData = {
  memberId: 'Liisa1',
  memberType: MIKMemberTypes.FLYING,
  email: 'liisa@example.com',
  firstName: 'Liisa',
  lastName: 'Lentäjä',
  country: 'FI',
  isTrainingProgramPilot: false,
  isMembershipApproved: true,
  canMakeReservations: true,
  memberSince: '2020-01-01',
  lang: MIKLang.FI,
  roles: [],
  defaultInstructorMemberId: null,
} as unknown as Member

const renderTrainingDialog = (isAdmin: boolean) => {
  const trigger = vi.fn().mockResolvedValue({ data: memberData })
  const api = { isMutating: false, trigger } as unknown as APIMutation<Member>

  render(
    <MemoryRouter>
      <EditMemberModal
        mode='training'
        memberData={memberData}
        api={api}
        isAdmin={isAdmin}
        onClose={() => {}}
      />
    </MemoryRouter>,
  )

  return trigger
}

/** Pick "Jukka Nieminen" in the Default Instructor autocomplete. */
const selectDefaultInstructor = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('combobox'))
  await user.click(await screen.findByText('Jukka Nieminen'))
}

const submit = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /save|tallenna|spara/i }))
}

describe('EditMemberModal training dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('omits isTrainingProgramPilot from the payload for a non-admin', async () => {
    const user = userEvent.setup()
    const trigger = renderTrainingDialog(false)

    // The admin-only checkbox must not be rendered for a non-admin.
    expect(screen.queryByRole('checkbox')).toBeNull()

    await selectDefaultInstructor(user)
    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))

    const [method, payload] = trigger.mock.calls[0] as [string, Partial<Member>]
    expect(method).toBe('PATCH')
    // MemberProfileSchema on PATCH /v1/members/me is .strict(): any extra key
    // (such as isTrainingProgramPilot) makes the request a 400 Bad Request.
    expect(Object.keys(payload)).toEqual(['defaultInstructorMemberId'])
    expect(payload).not.toHaveProperty('isTrainingProgramPilot')
    expect(payload.defaultInstructorMemberId).toBe('Jukka1')
  })

  it('omits isTrainingProgramPilot when a non-admin clears the default instructor', async () => {
    const user = userEvent.setup()
    const trigger = renderTrainingDialog(false)

    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))

    const [, payload] = trigger.mock.calls[0] as [string, Partial<Member>]
    expect(payload).not.toHaveProperty('isTrainingProgramPilot')
    expect(payload.defaultInstructorMemberId).toBeNull()
  })

  it('still sends isTrainingProgramPilot for an admin', async () => {
    const user = userEvent.setup()
    const trigger = renderTrainingDialog(true)

    await user.click(screen.getByRole('checkbox'))
    await selectDefaultInstructor(user)
    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))

    const [, payload] = trigger.mock.calls[0] as [string, Partial<Member>]
    expect(payload.isTrainingProgramPilot).toBe(true)
    expect(payload.defaultInstructorMemberId).toBe('Jukka1')
  })
})
