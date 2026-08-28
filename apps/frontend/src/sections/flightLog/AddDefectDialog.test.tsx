import type { Defect } from '@mik/contracts/defects'
import { screen, waitFor, within } from '@testing-library/react'
import dayjs from 'dayjs'
import { toHelsinkiDate } from '@mik/contracts/date'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { signInAs } from '../../test/auth'
import { AIRCRAFT_REGISTRATION, aMember } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { AddDefectDialog } from './AddDefectDialog'

const aDefect = (): Defect =>
  ({
    defectId: 'def-1',
    aircraftRegistration: AIRCRAFT_REGISTRATION,
    description: 'Nose wheel shimmy on landing',
    status: 'ACTIVE',
    flightMins: 285_000,
    recordedOn: '2025-06-02',
    rows: 1,
    createdBy: 'Matti1',
    createdAt: '2025-06-02T09:00:00.000Z',
    flightId: null,
    hilId: null,
    resolvedNoteId: null,
    updatedAt: '2025-06-02T09:00:00.000Z',
    updatedBy: 'Matti1',
  }) as unknown as Defect

/** Records every POST so the payload/call-count can be asserted. */
const defectApi = () => {
  const posts: unknown[] = []
  server.use(
    http.post(apiUrl('v1/defects'), async ({ request }) => {
      posts.push(await request.json())
      return HttpResponse.json(aDefect(), { status: 201 })
    }),
  )
  return posts
}

const renderDialog = (onSuccess = vi.fn(), flightId: string | null = null) => {
  const onClose = vi.fn()
  const rendered = renderWithProviders(
    <AddDefectDialog
      open
      onClose={onClose}
      onSuccess={onSuccess}
      aircraftRegistration={AIRCRAFT_REGISTRATION}
      ajlbSeqNo={1}
      flightId={flightId}
    />,
  )
  return { ...rendered, onClose, onSuccess }
}

const fillAndSubmit = async (user: ReturnType<typeof renderDialog>['user']) => {
  await user.type(screen.getByLabelText(/Description/), 'Nose wheel shimmy on landing')
  await user.click(screen.getByRole('button', { name: 'Save' }))
}

/** Accepts the "this grounds the aircraft" confirmation the save always raises. */
const confirmGrounding = async (user: ReturnType<typeof renderDialog>['user']) => {
  const confirmDialog = (
    await screen.findByText(/Submitting this action will ground the aircraft/)
  ).closest('[role="dialog"]') as HTMLElement
  await user.click(within(confirmDialog).getByRole('button', { name: 'Confirm & Save' }))
}

describe('AddDefectDialog', () => {
  it('asks for grounding confirmation before creating the defect, without calling the API yet', async () => {
    const posts = defectApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await fillAndSubmit(user)

    expect(
      await screen.findByText(/Submitting this action will ground the aircraft/),
    ).toBeInTheDocument()
    expect(posts).toHaveLength(0)
  })

  it('creates the defect only after the grounding confirmation is accepted', async () => {
    const posts = defectApi()
    signInAs(aMember())

    const { user, onSuccess } = renderDialog()
    await fillAndSubmit(user)

    const confirmDialog = (
      await screen.findByText(/Submitting this action will ground the aircraft/)
    ).closest('[role="dialog"]') as HTMLElement
    await user.click(within(confirmDialog).getByRole('button', { name: 'Confirm & Save' }))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ description: 'Nose wheel shimmy on landing' })
    expect(onSuccess).toHaveBeenCalled()
  })

  it('does not create the defect when the grounding confirmation is cancelled', async () => {
    const posts = defectApi()
    signInAs(aMember())

    const { user, onSuccess } = renderDialog()
    await fillAndSubmit(user)

    const confirmDialog = (
      await screen.findByText(/Submitting this action will ground the aircraft/)
    ).closest('[role="dialog"]') as HTMLElement
    await user.click(within(confirmDialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(
        screen.queryByText(/Submitting this action will ground the aircraft/),
      ).not.toBeInTheDocument(),
    )
    expect(posts).toHaveLength(0)
    expect(onSuccess).not.toHaveBeenCalled()
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

describe('AddDefectDialog recorded date', () => {
  it('defaults to today, so the common case needs no typing', async () => {
    defectApi()
    signInAs(aMember())

    renderDialog()

    expect(screen.getByRole('group', { name: /Date/ })).toHaveTextContent(
      dayjs().format('DD/MM/YYYY'),
    )
  })

  it('posts the date the defect was observed when the reporter backdates it', async () => {
    // #1254: found on the ramp on the 14th, written up days later.
    const posts = defectApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await user.click(screen.getByRole('spinbutton', { name: 'Day' }))
    await user.keyboard('14032026')
    await fillAndSubmit(user)
    await confirmGrounding(user)

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ recordedOn: '2026-03-14' })
  })

  it('posts today when the reporter leaves the date alone', async () => {
    const posts = defectApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await fillAndSubmit(user)
    await confirmGrounding(user)

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ recordedOn: toHelsinkiDate() })
  })

  it('refuses to save once the date has been cleared', async () => {
    const posts = defectApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await user.click(screen.getByRole('spinbutton', { name: 'Day' }))
    // Clearing one section leaves no date at all, which the schema rejects rather
    // than quietly filing the defect under today.
    await user.keyboard('{Delete}')
    await fillAndSubmit(user)

    await waitFor(() => expect(posts).toHaveLength(0))
    // Never even got as far as the grounding confirmation.
    expect(
      screen.queryByText(/Submitting this action will ground the aircraft/),
    ).not.toBeInTheDocument()
  })

  it('asks for the date on an in-flight defect too, where the flight time fields are hidden', async () => {
    defectApi()
    signInAs(aMember())

    renderDialog(vi.fn(), 'fi_inst1')

    expect(screen.getByRole('group', { name: /Date/ })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: 'Hours' })).toBeNull()
  })

  it("defaults to the club's Helsinki date, not the reporter's own", async () => {
    // #1288 review: dayjs() is whoever is reading's calendar. At 17:00 Helsinki on the
    // 15th it is already the 16th in Kiritimati (UTC+14) — and the journey log book has
    // one date, the club's — so the default has to come from toHelsinkiDate().
    inTimezone('Pacific/Kiritimati', '2026-07-15T14:00:00.000Z')
    defectApi()
    signInAs(aMember())

    renderDialog()

    expect(screen.getByRole('group', { name: /Date/ })).toHaveTextContent('15/07/2026')
  })
})
