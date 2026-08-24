// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { MemoryRouter } from 'react-router'
import { Member, MemberListResponse, MIKLang, MIKMemberTypes } from '@mik/contracts/members'
import type { MemberEditMode } from './EditMemberModal'
import type { APIMutation } from '../../../hooks/useApi'
import { EditMemberModal } from './EditMemberModal'
import '@mik/ui/i18n'

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

/** Router plus the picker context the licence/membership modes' DateFields need. */
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale='en-gb'>
      {children}
    </LocalizationProvider>
  </MemoryRouter>
)

/**
 * Renders one mode of the modal and hands back the injected mutation, so a
 * test can assert on the exact payload the dialog would PATCH.
 *
 * The modal only ever sends the slice of the member its current mode owns —
 * `PATCH /v1/members/me` is `.strict()`, so one stray key is a 400.
 */
const renderDialog = (
  mode: MemberEditMode,
  {
    isAdmin = false,
    member = memberData,
    onClose = () => {},
  }: { isAdmin?: boolean; member?: Member; onClose?: () => void } = {},
) => {
  const trigger = vi.fn().mockResolvedValue({ data: member })
  const api = { isMutating: false, trigger } as unknown as APIMutation<Member>

  render(
    <Wrapper>
      <EditMemberModal
        mode={mode}
        memberData={member}
        api={api}
        isAdmin={isAdmin}
        onClose={onClose}
      />
    </Wrapper>,
  )

  return trigger
}

const renderTrainingDialog = (isAdmin: boolean) => renderDialog('training', { isAdmin })

/** The single payload argument of the one PATCH/POST the dialog made. */
const payloadOf = (trigger: ReturnType<typeof vi.fn>) =>
  (trigger.mock.calls[0] as [string, Partial<Member>])[1]

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

describe('EditMemberModal per-mode payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const populated = {
    ...memberData,
    phoneNumber: '0401234567',
    phoneCountry: 'FI',
    streetAddress: 'Keskuskatu 1',
    postcode: '00100',
    townCity: 'Helsinki',
    dateOfBirth: '1980-01-15',
    iceContactName: 'Matti Lentäjä',
    iceContactPhoneNumber: '0407654321',
    licenceId: 'FI.FCL.123456',
    licenceExpiry: '2027-03-20',
    iban: 'FI2112345600000785',
    ibanAccountName: 'Liisa Lentäjä',
    imTelegram: 'https://t.me/liisa',
  } as unknown as Member

  it('titles the dialog for the section being edited', () => {
    renderDialog('email')

    expect(screen.getByText('Edit Email')).toBeInTheDocument()
  })

  it('pre-fills the email form and sends only the email', async () => {
    const user = userEvent.setup()
    const trigger = renderDialog('email', { member: populated })

    const email = screen.getByRole('textbox', { name: /Email/ })
    expect(email).toHaveValue('liisa@example.com')

    await user.clear(email)
    await user.type(email, 'uusi@example.com')
    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))
    expect(payloadOf(trigger)).toEqual({ email: 'uusi@example.com' })
  })

  it('sends only the emergency-contact fields', async () => {
    const user = userEvent.setup()
    const trigger = renderDialog('emergencyContact', { member: populated })

    expect(screen.getByRole('textbox', { name: /ICE Contact/ })).toHaveValue('Matti Lentäjä')

    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))
    expect(Object.keys(payloadOf(trigger)).sort()).toEqual([
      'iceContactName',
      'iceContactPhoneCountry',
      'iceContactPhoneNumber',
    ])
  })

  it('sends only the instant-messaging handles', async () => {
    const user = userEvent.setup()
    const trigger = renderDialog('instantMessaging', { member: populated })

    expect(screen.getByRole('textbox', { name: 'Telegram' })).toHaveValue('https://t.me/liisa')

    await user.type(screen.getByRole('textbox', { name: 'Discord' }), 'liisa#0001')
    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))
    const payload = payloadOf(trigger)
    expect(payload.imDiscord).toBe('liisa#0001')
    expect(Object.keys(payload).every((key) => key.startsWith('im'))).toBe(true)
  })

  it('sends only the licence fields, dates included', async () => {
    const user = userEvent.setup()
    const trigger = renderDialog('licence', { member: populated })

    expect(screen.getByRole('textbox', { name: 'Licence ID' })).toHaveValue('FI.FCL.123456')

    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))
    expect(Object.keys(payloadOf(trigger)).sort()).toEqual([
      'licenceExpiry',
      'licenceId',
      'medicalClass1Expiry',
      'medicalClass2Expiry',
      'medicalLaplExpiry',
    ])
  })

  it('sends only the bank details', async () => {
    const user = userEvent.setup()
    const trigger = renderDialog('bankDetails', { member: populated })

    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))
    expect(payloadOf(trigger)).toEqual({
      iban: 'FI2112345600000785',
      ibanAccountName: 'Liisa Lentäjä',
    })
  })

  it('sends the personal-info slice, and the bank details it also carries', async () => {
    const user = userEvent.setup()
    const trigger = renderDialog('personalInfo', { member: populated })

    const firstName = screen.getByRole('textbox', { name: 'First Name' })
    await user.clear(firstName)
    await user.type(firstName, 'Liisa-Maria')
    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))
    const payload = payloadOf(trigger)
    expect(payload.firstName).toBe('Liisa-Maria')
    expect(payload.lastName).toBe('Lentäjä')
    expect(payload).not.toHaveProperty('email')
    expect(payload).not.toHaveProperty('memberType')
  })

  it('sends the language the member picked', async () => {
    const user = userEvent.setup()
    const trigger = renderDialog('personalInfo', { member: populated })

    await user.click(screen.getByRole('radio', { name: /EN/ }))
    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))
    expect(payloadOf(trigger).lang).toBe(MIKLang.EN)
  })

  it('sends only the membership fields', async () => {
    const user = userEvent.setup()
    const trigger = renderDialog('membership', { member: populated })

    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))
    expect(Object.keys(payloadOf(trigger)).sort()).toEqual([
      'billingId',
      'canMakeReservations',
      'isMembershipApproved',
      'memberSince',
      'memberType',
    ])
  })

  it('sends the member type the admin picked', async () => {
    const user = userEvent.setup()
    const trigger = renderDialog('membership', { member: populated })

    await user.click(screen.getByRole('radio', { name: 'Junior' }))
    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))
    expect(payloadOf(trigger).memberType).toBe(MIKMemberTypes.JUNIOR)
  })

  it('sends only the auto-renew flags', async () => {
    const user = userEvent.setup()
    const trigger = renderDialog('billing', { member: populated })

    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))
    expect(Object.keys(payloadOf(trigger)).sort()).toEqual([
      'autoRenewAnnualMembership',
      'autoRenewEquipmentFee',
    ])
  })
})

describe('EditMemberModal registering a new member', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts rather than patches', async () => {
    const user = userEvent.setup()
    const trigger = renderDialog('register')

    await user.type(screen.getByRole('textbox', { name: /First Name/ }), 'Uusi')
    await user.type(screen.getByRole('textbox', { name: /Last Name/ }), 'Jäsen')
    await user.type(screen.getByRole('textbox', { name: /Email/ }), 'uusi@example.com')
    await submit(user)

    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1))
    expect((trigger.mock.calls[0] as [string, unknown])[0]).toBe('POST')
  })

  it('defaults a new member to external, and so asks for no address', () => {
    renderDialog('register')

    expect(screen.getByRole('radio', { name: 'External user' })).toBeChecked()
    expect(screen.queryByRole('textbox', { name: /Street Address/ })).toBeNull()
  })

  it('asks for the address once the member is a flying one', async () => {
    const user = userEvent.setup()
    renderDialog('register')

    await user.click(screen.getByRole('radio', { name: 'Full Member' }))

    expect(screen.getByRole('textbox', { name: /Street Address/ })).toBeInTheDocument()
  })
})

describe('EditMemberModal outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('closes once the save succeeds', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDialog('email', { onClose })

    await submit(user)

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('stays open and shows the reason when the save is rejected', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const trigger = vi.fn().mockResolvedValue({
      error: { status: 409, title: 'Conflict', detail: 'That email is already in use' },
    })
    const api = { isMutating: false, trigger } as unknown as APIMutation<Member>

    render(
      <Wrapper>
        <EditMemberModal mode='email' memberData={memberData} api={api} onClose={onClose} />
      </Wrapper>,
    )

    await submit(user)

    expect(await screen.findByText(/That email is already in use/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes without saving anything on cancel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const trigger = renderDialog('email', { onClose })

    await user.click(screen.getByRole('button', { name: /cancel|peruuta|avbryt/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(trigger).not.toHaveBeenCalled()
  })
})
