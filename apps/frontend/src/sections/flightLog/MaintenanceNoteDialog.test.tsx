import type { MaintenanceNote } from '@mik/contracts/maintenance-notes'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { signInAs } from '../../test/auth'
import { AIRCRAFT_REGISTRATION, aMember, MEMBER_ID } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { MaintenanceNoteDialog } from './MaintenanceNoteDialog'

const aNote = (overrides: Partial<MaintenanceNote> = {}): MaintenanceNote => ({
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
  ...overrides,
})

/** Records every PATCH so the payload can be asserted. */
const noteApi = () => {
  const patches: unknown[] = []
  server.use(
    http.get(apiUrl('v1/aircraft-hil/overview'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/aircraft-hil'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/defects'), () => HttpResponse.json([])),
    http.patch(apiUrl('v1/maintenance-notes/:id'), async ({ request }) => {
      patches.push(await request.json())
      return HttpResponse.json(aNote())
    }),
  )
  return patches
}

const renderDialog = (note = aNote(), onChanged = vi.fn()) => {
  const onClose = vi.fn()
  const rendered = renderWithProviders(
    <MaintenanceNoteDialog note={note} open onClose={onClose} onChanged={onChanged} />,
  )
  return { ...rendered, onClose, onChanged }
}

describe('MaintenanceNoteDialog reading', () => {
  it('shows the note and who performed the work', async () => {
    noteApi()
    signInAs(aMember())

    renderDialog()

    expect(await screen.findByText('50 h inspection')).toBeInTheDocument()
    expect(screen.getByText('AME')).toBeInTheDocument()
  })

  it('shows the aircraft total flight time in hours and minutes', async () => {
    noteApi()
    signInAs(aMember())

    renderDialog(aNote({ flightMins: 125 }))

    expect(await screen.findByText('2:05')).toBeInTheDocument()
  })
})

describe('MaintenanceNoteDialog recorded date', () => {
  it('shows the date the work was done', async () => {
    noteApi()
    signInAs(aMember())

    renderDialog()

    expect(await screen.findByText('14.03.2026')).toBeInTheDocument()
  })

  it('shows the recorded date, not the date the row was written', async () => {
    // #1254: these were the same value before the field existed, and the whole
    // point is that they no longer have to be.
    noteApi()
    signInAs(aMember())

    renderDialog(aNote({ recordedOn: '2026-03-14', createdAt: '2026-03-20T09:00:00.000Z' }))

    expect(await screen.findByText('14.03.2026')).toBeInTheDocument()
    expect(screen.queryByText('20.03.2026')).toBeNull()
  })

  it('offers it for correction on Edit, seeded with the stored date', async () => {
    noteApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('group', { name: /Date/ })).toHaveTextContent('14/03/2026')
  })

  it('patches the corrected date', async () => {
    const patches = noteApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('spinbutton', { name: 'Day' }))
    await user.keyboard('16032026')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({ recordedOn: '2026-03-16' })
  })

  it('keeps the stored date on a save that only changes the description', async () => {
    const patches = noteApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const description = screen.getByRole('textbox', { name: /Description/ })
    await user.clear(description)
    await user.type(description, '100 h inspection')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({
      description: '100 h inspection',
      recordedOn: '2026-03-14',
    })
  })

  it('refuses a save once the date has been cleared', async () => {
    const patches = noteApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('spinbutton', { name: 'Day' }))
    await user.keyboard('{Delete}')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(patches).toHaveLength(0))
    // Still in edit mode rather than silently accepting a dateless note.
    expect(screen.getByRole('textbox', { name: /Description/ })).toBeInTheDocument()
  })
})
