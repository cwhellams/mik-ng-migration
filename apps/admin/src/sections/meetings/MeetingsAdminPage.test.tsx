import type { Meeting, MeetingVote } from '@mik/contracts/meetings'
import { MIKPermissions } from '@mik/contracts/members'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { signInAs, signInWithPermissions } from '../../test/auth'
import { aMemberListResponse, aMemberWithoutPermissions } from '../../test/fixtures'
import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import MeetingsAdminPage from './MeetingsAdminPage'

/**
 * Meetings admin (#1115 §9). The page is a state machine — DRAFT → ONGOING →
 * PENDING_NOTES → ENDED — and which controls exist at all depends on where the
 * meeting is in that sequence. Every irreversible step is behind a confirm(),
 * so the tests assert the API is left alone when the admin backs out.
 */
const aMeeting = (overrides: Partial<Meeting> = {}) =>
  ({
    meetingId: 'meet-1',
    title: 'Autumn AGM',
    description: 'Yearly general meeting',
    documentSearchFilter: 'agm-2027',
    meetingUrl: 'https://meet.example/agm',
    status: 'DRAFT',
    attendanceCount: 0,
    meetingNotesDocumentId: null,
    ...overrides,
  }) as Meeting

const aVote = (overrides: Partial<MeetingVote> = {}) =>
  ({
    voteId: 'vote-1',
    meetingId: 'meet-1',
    topic: 'Approve the accounts',
    description: null,
    status: 'DRAFT',
    isMultiSelect: false,
    maxSelections: null,
    totalVotes: null,
    options: [
      { optionId: 'opt-1', optionText: 'For', voteCount: null },
      { optionId: 'opt-2', optionText: 'Against', voteCount: null },
    ],
    ...overrides,
  }) as MeetingVote

type Write = { method: string; path: string; body: unknown }

interface MeetingsApiOptions {
  meetings?: Meeting[]
  votes?: MeetingVote[]
  voteCounters?: { memberId: string; firstName: string; lastName: string }[]
  attendees?: { memberId: string; firstName: string; lastName: string }[]
}

const meetingsApi = ({
  meetings = [aMeeting()],
  votes = [],
  voteCounters = [],
  attendees = [],
}: MeetingsApiOptions = {}) => {
  const state = { writes: [] as Write[] }
  const record = async (method: string, path: string, request?: Request) => {
    state.writes.push({
      method,
      path,
      body: request ? await request.json().catch(() => null) : null,
    })
  }

  server.use(
    http.get(apiUrl('v1/meetings'), () => HttpResponse.json({ meetings })),
    http.get(apiUrl('v1/meetings/:id'), ({ params }) => {
      const found = meetings.find((m) => m.meetingId === params.id)
      return found ? HttpResponse.json(found) : problemResponse(404, 'Not found')
    }),
    http.get(apiUrl('v1/meetings/:id/attendance'), () => HttpResponse.json({ attendees })),
    http.get(apiUrl('v1/meetings/:id/vote-counters'), () => HttpResponse.json({ voteCounters })),
    http.get(apiUrl('v1/meetings/:id/votes'), () => HttpResponse.json({ votes })),
    http.get(apiUrl('v1/members'), () => HttpResponse.json(aMemberListResponse())),

    http.post(apiUrl('v1/meetings/:id/votes/:voteId/open'), async ({ params }) => {
      await record('VOTE_OPEN', String(params.voteId))
      return HttpResponse.json(aVote({ status: 'OPEN' }))
    }),
    http.patch(apiUrl('v1/meetings/:id/votes/:voteId/close'), async ({ params }) => {
      await record('VOTE_CLOSE', String(params.voteId))
      return HttpResponse.json(aVote({ status: 'CLOSED' }))
    }),
    http.patch(apiUrl('v1/meetings/:id/votes/:voteId/abandon'), async ({ params }) => {
      await record('VOTE_ABANDON', String(params.voteId))
      return HttpResponse.json(aVote({ status: 'ABANDONED' }))
    }),
    http.post(apiUrl('v1/meetings/:id/votes'), async ({ request }) => {
      await record('VOTE_CREATE', '', request)
      return HttpResponse.json(aVote({ voteId: 'vote-new' }))
    }),

    http.post(apiUrl('v1/meetings/:id/vote-counters'), async ({ request }) => {
      await record('COUNTER_ADD', '', request)
      return HttpResponse.json({ voteCounters })
    }),
    http.delete(apiUrl('v1/meetings/:id/vote-counters/:memberId'), async ({ params }) => {
      await record('COUNTER_REMOVE', String(params.memberId))
      return HttpResponse.json({ voteCounters: [] })
    }),

    http.post(apiUrl('v1/meetings/:id/start'), async ({ params }) => {
      await record('START', String(params.id))
      return HttpResponse.json(aMeeting({ status: 'ONGOING' }))
    }),
    http.post(apiUrl('v1/meetings/:id/pending-notes'), async ({ params }) => {
      await record('PENDING_NOTES', String(params.id))
      return HttpResponse.json(aMeeting({ status: 'PENDING_NOTES' }))
    }),
    http.post(apiUrl('v1/meetings/:id/end'), async ({ params }) => {
      await record('END', String(params.id))
      return HttpResponse.json(aMeeting({ status: 'ENDED' }))
    }),
    http.post(apiUrl('v1/meetings'), async ({ request }) => {
      await record('CREATE', '', request)
      return HttpResponse.json(aMeeting({ meetingId: 'meet-new', title: 'Spring AGM' }))
    }),
    http.patch(apiUrl('v1/meetings/:id'), async ({ request, params }) => {
      await record('PATCH', String(params.id), request)
      return HttpResponse.json(aMeeting())
    }),
    http.delete(apiUrl('v1/meetings/:id'), async ({ params }) => {
      await record('DELETE', String(params.id))
      return HttpResponse.json({})
    }),
  )

  return state
}

/** Signs in as a meeting admin — all this page requires in the admin app. */
const renderAsMeetingAdmin = () => {
  signInWithPermissions(MIKPermissions.MEETING_ADMIN)
  return renderWithProviders(<MeetingsAdminPage />)
}

describe('MeetingsAdminPage access', () => {
  it('refuses a member without the meeting-admin permission', async () => {
    meetingsApi()
    signInWithPermissions(MIKPermissions.MEETING_USER)

    renderWithProviders(<MeetingsAdminPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/access/i)
  })

  it('refuses a member with no permissions at all', async () => {
    meetingsApi()
    signInAs(aMemberWithoutPermissions())

    renderWithProviders(<MeetingsAdminPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/access/i)
  })

  // In apps/frontend this page also required the sudo toggle, and there was a
  // test for a meeting admin who had not switched it on. That case cannot
  // arise here: the admin app has no toggle, because reaching it is itself the
  // deliberate admin-intent step (#1233). Holding MEETING_ADMIN is now the
  // whole gate.
  it('lets a meeting admin in', async () => {
    meetingsApi()

    renderAsMeetingAdmin()

    expect(await screen.findByText('Meeting Details')).toBeInTheDocument()
  })
})

describe('MeetingsAdminPage listing', () => {
  it('lists the meetings with their status and attendee count', async () => {
    meetingsApi({ meetings: [aMeeting({ attendanceCount: 12 })] })

    renderAsMeetingAdmin()

    expect(await screen.findAllByText('Autumn AGM')).not.toHaveLength(0)
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0)
    expect(screen.getByText('12 attendee(s)')).toBeInTheDocument()
  })

  it('selects the first meeting by itself so the detail pane is never empty', async () => {
    meetingsApi({
      meetings: [aMeeting(), aMeeting({ meetingId: 'meet-2', title: 'Board meeting' })],
    })

    renderAsMeetingAdmin()

    expect(await screen.findByDisplayValue('Autumn AGM')).toBeInTheDocument()
  })

  it('switches the detail pane when another meeting is picked', async () => {
    meetingsApi({
      meetings: [aMeeting(), aMeeting({ meetingId: 'meet-2', title: 'Board meeting' })],
    })

    const { user } = renderAsMeetingAdmin()
    await screen.findByDisplayValue('Autumn AGM')

    await user.click(screen.getByText('Board meeting'))

    expect(await screen.findByDisplayValue('Board meeting')).toBeInTheDocument()
  })

  it('says so when there are no meetings at all', async () => {
    meetingsApi({ meetings: [] })

    renderAsMeetingAdmin()

    expect(await screen.findByText('No meetings yet.')).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    meetingsApi()
    server.use(http.get(apiUrl('v1/meetings'), () => problemResponse(500, 'Down')))

    renderAsMeetingAdmin()

    expect(await screen.findByText(/Down/)).toBeInTheDocument()
  })
})

describe('MeetingsAdminPage creating', () => {
  const openCreate = async (user: ReturnType<typeof renderWithProviders>['user']) => {
    await user.click(await screen.findByRole('button', { name: 'Create Meeting' }))
    return screen.findByRole('dialog')
  }

  it('needs a title before it will create anything', async () => {
    meetingsApi()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreate(user)

    expect(within(dialog).getByRole('button', { name: 'Create Meeting' })).toBeDisabled()
  })

  it('treats a title of only spaces as missing', async () => {
    meetingsApi()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreate(user)

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '   ')

    expect(within(dialog).getByRole('button', { name: 'Create Meeting' })).toBeDisabled()
  })

  it('posts the trimmed meeting with nulls for the blanks', async () => {
    const state = meetingsApi()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreate(user)

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '  Spring AGM  ')
    await user.click(within(dialog).getByRole('button', { name: 'Create Meeting' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'CREATE',
      body: {
        title: 'Spring AGM',
        description: null,
        documentSearchFilter: null,
        meetingUrl: null,
      },
    })
  })

  it('selects the meeting it just created', async () => {
    meetingsApi()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreate(user)

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Spring AGM')
    await user.click(within(dialog).getByRole('button', { name: 'Create Meeting' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('reports a rejected create without closing the dialog', async () => {
    meetingsApi()
    server.use(http.post(apiUrl('v1/meetings'), () => problemResponse(409, 'Already scheduled')))

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreate(user)

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Spring AGM')
    await user.click(within(dialog).getByRole('button', { name: 'Create Meeting' }))

    expect(await screen.findByText('Already scheduled')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('MeetingsAdminPage lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lets a draft be edited, started or deleted', async () => {
    meetingsApi()

    renderAsMeetingAdmin()
    await screen.findByText('Meeting Details')

    expect(screen.getByRole('button', { name: 'Open Meeting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Meeting' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeEnabled()
  })

  it('locks the title and description once the meeting is open', async () => {
    meetingsApi({ meetings: [aMeeting({ status: 'ONGOING' })] })

    renderAsMeetingAdmin()
    await screen.findByText('Meeting Details')

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeDisabled()
    // The meeting link stays editable — it may need fixing mid-meeting.
    expect(screen.getByRole('textbox', { name: /Meeting link/ })).toBeEnabled()
  })

  it('offers only the next step for each status', async () => {
    meetingsApi({ meetings: [aMeeting({ status: 'ONGOING' })] })

    renderAsMeetingAdmin()
    await screen.findByText('Meeting Details')

    expect(
      screen.getByRole('button', { name: 'Move to Waiting for Meeting Notes' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Meeting' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Meeting' })).toBeNull()
  })

  it('offers to close a meeting only once it is waiting for notes', async () => {
    meetingsApi({ meetings: [aMeeting({ status: 'PENDING_NOTES' })] })

    renderAsMeetingAdmin()
    await screen.findByText('Meeting Details')

    expect(screen.getByRole('button', { name: 'Close Meeting' })).toBeInTheDocument()
  })

  it('leaves an ended meeting with nothing but a link to its notes', async () => {
    meetingsApi({
      meetings: [aMeeting({ status: 'ENDED', meetingNotesDocumentId: 1 })],
    })

    renderAsMeetingAdmin()
    await screen.findByText('Meeting Details')

    expect(screen.getByRole('button', { name: 'View meeting notes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('patches the edited meeting fields', async () => {
    const state = meetingsApi()

    const { user } = renderAsMeetingAdmin()
    const title = await screen.findByDisplayValue('Autumn AGM')

    await user.clear(title)
    await user.type(title, 'Autumn AGM 2027')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PATCH',
      path: 'meet-1',
      body: { title: 'Autumn AGM 2027' },
    })
  })

  it('will not start the meeting unless the admin confirms', async () => {
    const state = meetingsApi()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    const { user } = renderAsMeetingAdmin()
    await screen.findByText('Meeting Details')

    await user.click(screen.getByRole('button', { name: 'Open Meeting' }))

    expect(confirm).toHaveBeenCalled()
    expect(state.writes).toHaveLength(0)
  })

  it('starts the meeting once confirmed', async () => {
    const state = meetingsApi()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { user } = renderAsMeetingAdmin()
    await screen.findByText('Meeting Details')

    await user.click(screen.getByRole('button', { name: 'Open Meeting' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'START', path: 'meet-1' })
  })

  it('moves an open meeting to waiting-for-notes once confirmed', async () => {
    const state = meetingsApi({ meetings: [aMeeting({ status: 'ONGOING' })] })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { user } = renderAsMeetingAdmin()
    await screen.findByText('Meeting Details')

    await user.click(screen.getByRole('button', { name: 'Move to Waiting for Meeting Notes' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'PENDING_NOTES', path: 'meet-1' })
  })

  it('deletes a draft once confirmed', async () => {
    const state = meetingsApi()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { user } = renderAsMeetingAdmin()
    await screen.findByText('Meeting Details')

    await user.click(screen.getByRole('button', { name: 'Delete Meeting' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'DELETE', path: 'meet-1' })
  })

  it('surfaces the API’s reason when a lifecycle step is refused', async () => {
    meetingsApi()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    server.use(
      http.post(apiUrl('v1/meetings/:id/start'), () => problemResponse(409, 'Needs a quorum')),
    )

    const { user } = renderAsMeetingAdmin()
    await screen.findByText('Meeting Details')

    await user.click(screen.getByRole('button', { name: 'Open Meeting' }))

    expect(await screen.findByText('Needs a quorum')).toBeInTheDocument()
  })
})

describe('MeetingsAdminPage closing with notes', () => {
  const openEndDialog = async (user: ReturnType<typeof renderWithProviders>['user']) => {
    await screen.findByText('Meeting Details')
    await user.click(screen.getByRole('button', { name: 'Close Meeting' }))
    return screen.findByRole('dialog')
  }

  it('will not close the meeting without a notes file', async () => {
    meetingsApi({ meetings: [aMeeting({ status: 'PENDING_NOTES' })] })

    const { user } = renderAsMeetingAdmin()
    const dialog = await openEndDialog(user)

    expect(within(dialog).getByRole('button', { name: 'Close Meeting' })).toBeDisabled()
  })

  it('uploads the notes and closes the meeting', async () => {
    const state = meetingsApi({ meetings: [aMeeting({ status: 'PENDING_NOTES' })] })

    const { user } = renderAsMeetingAdmin()
    const dialog = await openEndDialog(user)

    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['notes'], 'agm-notes.pdf', { type: 'application/pdf' }))
    await user.click(within(dialog).getByRole('button', { name: 'Close Meeting' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'END', path: 'meet-1' })
  })

  it('names the chosen file so the admin can see what will be uploaded', async () => {
    meetingsApi({ meetings: [aMeeting({ status: 'PENDING_NOTES' })] })

    const { user } = renderAsMeetingAdmin()
    const dialog = await openEndDialog(user)

    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['notes'], 'agm-notes.pdf', { type: 'application/pdf' }))

    expect(within(dialog).getByText('agm-notes.pdf')).toBeInTheDocument()
  })

  it('reports a rejected upload inside the dialog rather than closing it', async () => {
    meetingsApi({ meetings: [aMeeting({ status: 'PENDING_NOTES' })] })
    server.use(http.post(apiUrl('v1/meetings/:id/end'), () => problemResponse(413, 'File too big')))

    const { user } = renderAsMeetingAdmin()
    const dialog = await openEndDialog(user)

    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['notes'], 'agm-notes.pdf', { type: 'application/pdf' }))
    await user.click(within(dialog).getByRole('button', { name: 'Close Meeting' }))

    expect(await within(dialog).findByText('File too big')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('MeetingsAdminPage vote counters', () => {
  it('says so when nobody has been assigned', async () => {
    meetingsApi()

    renderAsMeetingAdmin()

    expect(await screen.findByText('No vote counters assigned.')).toBeInTheDocument()
  })

  it('lists the assigned counters', async () => {
    meetingsApi({
      voteCounters: [{ memberId: 'mem-9', firstName: 'Liisa', lastName: 'Korhonen' }],
    })

    renderAsMeetingAdmin()

    expect(await screen.findByText('Liisa Korhonen')).toBeInTheDocument()
  })

  it('will not add a counter until a member is chosen', async () => {
    meetingsApi()

    renderAsMeetingAdmin()

    expect(await screen.findByRole('button', { name: 'Add vote counter' })).toBeDisabled()
  })

  it('removes a counter by member id', async () => {
    const state = meetingsApi({
      voteCounters: [{ memberId: 'mem-9', firstName: 'Liisa', lastName: 'Korhonen' }],
    })

    const { user } = renderAsMeetingAdmin()
    await screen.findByText('Liisa Korhonen')

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'COUNTER_REMOVE', path: 'mem-9' })
  })
})

describe('MeetingsAdminPage votes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const ongoing = (votes: MeetingVote[] = []) =>
    meetingsApi({ meetings: [aMeeting({ status: 'ONGOING' })], votes })

  it('says so when no votes have been created', async () => {
    meetingsApi()

    renderAsMeetingAdmin()

    expect(await screen.findByText('No votes created yet.')).toBeInTheDocument()
  })

  it('only offers to create a vote while the meeting is open', async () => {
    meetingsApi()

    renderAsMeetingAdmin()
    await screen.findByText('Meeting Details')

    expect(screen.queryByRole('button', { name: 'Create Vote' })).toBeNull()
  })

  it('lists a vote with its options and how many may be picked', async () => {
    ongoing([aVote()])

    renderAsMeetingAdmin()

    expect(await screen.findByText('Approve the accounts')).toBeInTheDocument()
    expect(screen.getByText('For')).toBeInTheDocument()
    expect(screen.getByText('Select one option')).toBeInTheDocument()
  })

  it('withholds the counts until results are released', async () => {
    ongoing([aVote({ status: 'OPEN', totalVotes: null })])

    renderAsMeetingAdmin()
    await screen.findByText('Approve the accounts')

    expect(screen.queryByText(/Total votes/)).toBeNull()
  })

  it('shows the counts once the vote reports a total', async () => {
    ongoing([
      aVote({
        status: 'CLOSED',
        totalVotes: 9,
        options: [
          { optionId: 'opt-1', optionText: 'For', voteCount: 7 },
          { optionId: 'opt-2', optionText: 'Against', voteCount: 2 },
        ],
      } as Partial<MeetingVote>),
    ])

    renderAsMeetingAdmin()

    expect(await screen.findByText('Total votes: 9')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('offers only the action each vote status allows', async () => {
    ongoing([aVote({ status: 'OPEN' })])

    renderAsMeetingAdmin()
    await screen.findByText('Approve the accounts')

    expect(screen.getByRole('button', { name: 'Close voting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abandon vote' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open voting' })).toBeNull()
  })

  it('opens a draft vote once confirmed', async () => {
    const state = ongoing([aVote()])
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { user } = renderAsMeetingAdmin()
    await screen.findByText('Approve the accounts')

    await user.click(screen.getByRole('button', { name: 'Open voting' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'VOTE_OPEN', path: 'vote-1' })
  })

  it('leaves an open vote alone when the admin backs out of closing it', async () => {
    const state = ongoing([aVote({ status: 'OPEN' })])
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const { user } = renderAsMeetingAdmin()
    await screen.findByText('Approve the accounts')

    await user.click(screen.getByRole('button', { name: 'Close voting' }))

    expect(state.writes).toHaveLength(0)
  })

  it('abandons a vote once confirmed', async () => {
    const state = ongoing([aVote({ status: 'OPEN' })])
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { user } = renderAsMeetingAdmin()
    await screen.findByText('Approve the accounts')

    await user.click(screen.getByRole('button', { name: 'Abandon vote' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'VOTE_ABANDON', path: 'vote-1' })
  })
})

describe('MeetingsAdminPage creating a vote', () => {
  const openCreateVote = async (user: ReturnType<typeof renderWithProviders>['user']) => {
    await user.click(await screen.findByRole('button', { name: 'Create Vote' }))
    return screen.findByRole('dialog')
  }

  const ongoing = () => meetingsApi({ meetings: [aMeeting({ status: 'ONGOING' })] })

  it('needs a topic and two real options', async () => {
    ongoing()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreateVote(user)
    const q = within(dialog)
    const submit = q.getByRole('button', { name: 'Create Vote' })

    expect(submit).toBeDisabled()

    await user.type(q.getByRole('textbox', { name: 'Topic' }), 'Approve the accounts')
    expect(submit).toBeDisabled()

    await user.type(q.getByRole('textbox', { name: 'Options 1' }), 'For')
    expect(submit).toBeDisabled()

    await user.type(q.getByRole('textbox', { name: 'Options 2' }), 'Against')
    expect(submit).toBeEnabled()
  })

  it('will not count a blank option towards the two required', async () => {
    ongoing()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreateVote(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: 'Topic' }), 'Approve the accounts')
    await user.type(q.getByRole('textbox', { name: 'Options 1' }), 'For')
    await user.type(q.getByRole('textbox', { name: 'Options 2' }), '   ')

    expect(q.getByRole('button', { name: 'Create Vote' })).toBeDisabled()
  })

  it('keeps at least two option rows', async () => {
    ongoing()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreateVote(user)

    within(dialog)
      .getAllByRole('button', { name: '' })
      .forEach((button) => expect(button).toBeDisabled())

    await user.click(within(dialog).getByRole('button', { name: 'Add option' }))

    expect(within(dialog).getByRole('textbox', { name: 'Options 3' })).toBeInTheDocument()
  })

  it('drops the option row that was removed', async () => {
    ongoing()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreateVote(user)
    const q = within(dialog)

    await user.click(q.getByRole('button', { name: 'Add option' }))
    await user.type(q.getByRole('textbox', { name: 'Options 3' }), 'Abstain')
    const removeButtons = q.getAllByRole('button', { name: '' })
    await user.click(removeButtons[removeButtons.length - 1])

    expect(q.queryByRole('textbox', { name: 'Options 3' })).toBeNull()
    expect(q.queryByDisplayValue('Abstain')).toBeNull()
  })

  it('only asks for a maximum once multi-select is on', async () => {
    ongoing()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreateVote(user)
    const q = within(dialog)

    expect(q.queryByRole('spinbutton', { name: /Maximum selections/ })).toBeNull()

    await user.click(q.getByRole('switch'))

    expect(q.getByRole('spinbutton', { name: /Maximum selections/ })).toBeInTheDocument()
  })

  it('posts the vote with its blank options stripped out', async () => {
    const state = ongoing()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreateVote(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: 'Topic' }), 'Approve the accounts')
    await user.type(q.getByRole('textbox', { name: 'Options 1' }), 'For')
    await user.type(q.getByRole('textbox', { name: 'Options 2' }), 'Against')
    await user.click(q.getByRole('button', { name: 'Add option' }))
    await user.click(q.getByRole('button', { name: 'Create Vote' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'VOTE_CREATE',
      body: {
        topic: 'Approve the accounts',
        options: ['For', 'Against'],
        isMultiSelect: false,
        maxSelections: null,
      },
    })
  })

  it('sends the maximum as a number when multi-select is on', async () => {
    const state = ongoing()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreateVote(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: 'Topic' }), 'Elect the board')
    await user.type(q.getByRole('textbox', { name: 'Options 1' }), 'Matti')
    await user.type(q.getByRole('textbox', { name: 'Options 2' }), 'Liisa')
    await user.click(q.getByRole('switch'))
    await user.type(q.getByRole('spinbutton', { name: /Maximum selections/ }), '2')
    await user.click(q.getByRole('button', { name: 'Create Vote' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ isMultiSelect: true, maxSelections: 2 })
  })

  it('forgets the maximum again when multi-select is switched back off', async () => {
    const state = ongoing()

    const { user } = renderAsMeetingAdmin()
    const dialog = await openCreateVote(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: 'Topic' }), 'Elect the board')
    await user.type(q.getByRole('textbox', { name: 'Options 1' }), 'Matti')
    await user.type(q.getByRole('textbox', { name: 'Options 2' }), 'Liisa')
    await user.click(q.getByRole('switch'))
    await user.type(q.getByRole('spinbutton', { name: /Maximum selections/ }), '2')
    await user.click(q.getByRole('switch'))
    await user.click(q.getByRole('button', { name: 'Create Vote' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ isMultiSelect: false, maxSelections: null })
  })
})
