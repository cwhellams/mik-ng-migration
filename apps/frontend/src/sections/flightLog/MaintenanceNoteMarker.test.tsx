import type { MaintenanceNote } from '@mik/contracts/maintenance-notes'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { signInAs } from '../../test/auth'
import { AIRCRAFT_REGISTRATION, aMember, MEMBER_ID } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { MaintenanceNoteMarker } from './MaintenanceNoteMarker'

const aNote = (overrides: Partial<MaintenanceNote> = {}): MaintenanceNote => ({
  noteId: 'note-1',
  aircraftRegistration: AIRCRAFT_REGISTRATION,
  ajlbSeqNo: 1,
  description: 'Annual inspection',
  performedBy: 'AME',
  flightMins: 285_000,
  recordedOn: '2025-06-02',
  rows: 1,
  createdAt: '2025-06-02T09:00:00.000Z',
  createdBy: MEMBER_ID,
  ...overrides,
})

describe('MaintenanceNoteMarker', () => {
  it('shows the recorded date next to the marker when it renders on its own row', async () => {
    server.use(http.get(apiUrl('v1/aircraft-hil/overview'), () => HttpResponse.json([])))
    signInAs(aMember())

    renderWithProviders(
      <MaintenanceNoteMarker
        note={aNote()}
        onChanged={vi.fn()}
        recordedDate='2025-06-02T09:00:00.000Z'
      />,
    )

    expect(await screen.findByText('02.06.2025')).toBeInTheDocument()
  })

  it('omits the date when the marker renders inline on its anchor flight row', async () => {
    server.use(http.get(apiUrl('v1/aircraft-hil/overview'), () => HttpResponse.json([])))
    signInAs(aMember())

    renderWithProviders(<MaintenanceNoteMarker note={aNote()} onChanged={vi.fn()} />)

    expect(await screen.findByText('Annual inspection — AME')).toBeInTheDocument()
    expect(screen.queryByText('02.06.2025')).not.toBeInTheDocument()
  })
})
