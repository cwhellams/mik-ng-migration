import type { MaintenanceNote } from '@mik/contracts/maintenance-notes'
import { screen, waitFor } from '@testing-library/react'
import dayjs from 'dayjs'
import { toHelsinkiDate } from '@mik/contracts/date'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { signInAs } from '../../test/auth'
import { AIRCRAFT_REGISTRATION, aMember, MEMBER_ID } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { AddMaintenanceNoteDialog } from './AddMaintenanceNoteDialog'

const aNote = (): MaintenanceNote => ({
  noteId: 'note-1',
  aircraftRegistration: AIRCRAFT_REGISTRATION,
  ajlbSeqNo: 1,
  description: '50 h inspection',
  performedBy: 'AME',
  flightMins: 285_000,
  recordedOn: '2026-03-14',
  rows: 1,
  createdAt: '2026-03-20T09:00:00.000Z',
  createdBy: MEMBER_ID,
})

/** Records every POST so the payload can be asserted. */
const noteApi = () => {
  const posts: unknown[] = []
  server.use(
    http.get(apiUrl('v1/aircraft-hil'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/defects'), () => HttpResponse.json([])),
    http.post(apiUrl('v1/maintenance-notes'), async ({ request }) => {
      posts.push(await request.json())
      return HttpResponse.json(aNote(), { status: 201 })
    }),
  )
  return posts
}

const renderDialog = (onSuccess = vi.fn()) => {
  const onClose = vi.fn()
  const rendered = renderWithProviders(
    <AddMaintenanceNoteDialog
      open
      onClose={onClose}
      onSuccess={onSuccess}
      aircraftRegistration={AIRCRAFT_REGISTRATION}
      ajlbSeqNo={1}
      defaultFlightMins={285_000}
    />,
  )
  return { ...rendered, onClose, onSuccess }
}

const fillAndSubmit = async (user: ReturnType<typeof renderDialog>['user']) => {
  await user.type(screen.getByLabelText(/Description/), '50 h inspection')
  await user.type(screen.getByLabelText(/Performed by/), 'AME')
  await user.click(screen.getByRole('button', { name: 'Save' }))
}

describe('AddMaintenanceNoteDialog', () => {
  it('creates the note from the filled-in fields', async () => {
    const posts = noteApi()
    signInAs(aMember())

    const { user, onSuccess } = renderDialog()
    await fillAndSubmit(user)

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({
      aircraftRegistration: AIRCRAFT_REGISTRATION,
      ajlbSeqNo: 1,
      description: '50 h inspection',
      performedBy: 'AME',
      flightMins: 285_000,
      rows: 1,
    })
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('refuses a note with no description', async () => {
    const posts = noteApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await user.type(screen.getByLabelText(/Performed by/), 'AME')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(posts).toHaveLength(0))
  })
})

/**
 * Runs the rest of the test as if the browser were somewhere other than Helsinki, at a
 * fixed instant — the only way to tell a club-wide date apart from the reader's own,
 * since the suite otherwise pins TZ to Europe/Helsinki (vitest.config.ts) and the two
 * agree. Restored by the afterEach below.
 */
const inTimezone = (tz: string, at: string) => {
  vi.stubEnv('TZ', tz)
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(at))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('AddMaintenanceNoteDialog recorded date', () => {
  it('defaults to today, so the common case needs no typing', async () => {
    noteApi()
    signInAs(aMember())

    renderDialog()

    expect(screen.getByRole('group', { name: /Date/ })).toHaveTextContent(
      dayjs().format('DD/MM/YYYY'),
    )
  })

  it('posts the date the work was done when the admin backdates it', async () => {
    // #1254: the work was signed off on the 14th and typed in days later.
    const posts = noteApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await user.click(screen.getByRole('spinbutton', { name: 'Day' }))
    await user.keyboard('14032026')
    await fillAndSubmit(user)

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ recordedOn: '2026-03-14' })
  })

  it('posts today when the admin leaves the date alone', async () => {
    const posts = noteApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await fillAndSubmit(user)

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ recordedOn: toHelsinkiDate() })
  })

  it('refuses to save once the date has been cleared', async () => {
    const posts = noteApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await user.click(screen.getByRole('spinbutton', { name: 'Day' }))
    // Clearing one section leaves no date at all, which the schema rejects rather
    // than quietly filing the note under today.
    await user.keyboard('{Delete}')
    await fillAndSubmit(user)

    await waitFor(() => expect(posts).toHaveLength(0))
    expect(screen.getByText('Pick a valid date')).toBeInTheDocument()
  })

  it("defaults to the club's Helsinki date, not the reporter's own", async () => {
    // #1288 review: dayjs() is whoever is reading's calendar. At 17:00 Helsinki on the
    // 15th it is already the 16th in Kiritimati (UTC+14) — and the journey log book has
    // one date, the club's — so the default has to come from toHelsinkiDate().
    inTimezone('Pacific/Kiritimati', '2026-07-15T14:00:00.000Z')
    noteApi()
    signInAs(aMember())

    renderDialog()

    expect(screen.getByRole('group', { name: /Date/ })).toHaveTextContent('15/07/2026')
  })
})
