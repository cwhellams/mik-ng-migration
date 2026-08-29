import { screen, waitFor } from '@testing-library/react'
import type { Finding } from '@mik/contracts/findings'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { apiUrl, problemResponse } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { TechnicalNotesLink } from './TechnicalNotesDialog'

/**
 * "Recent technical notes" (#1230) — the aircraft card's link to everything
 * that has been written up about that aeroplane lately.
 */

const notesUrl = apiUrl('v1/findings/technical-notes')

const aFinding = (overrides: Partial<Finding> = {}): Finding => ({
  findingId: 'f-1',
  kind: 'REMARK',
  aircraftRegistration: 'OH-STL',
  ajlbSeqNo: 3,
  flightId: 'flt-1',
  description: 'Cabin door seal whistles above 100 kt',
  status: null,
  performedBy: null,
  recordedOn: null,
  createdAt: '2026-08-20T09:00:00.000Z',
  createdBy: 'Matti1',
  ...overrides,
})

const serveNotes = (entries: Finding[], onRequest?: (params: Record<string, string>) => void) =>
  server.use(
    http.get(notesUrl, ({ request }) => {
      onRequest?.(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json({ entries })
    }),
  )

describe('TechnicalNotesLink', () => {
  it('fetches nothing until the link is opened', async () => {
    // The aircraft page renders a card per aeroplane; fetching each one's
    // history up front would be a request per card for a panel most visits
    // never open.
    const seen = vi.fn()
    serveNotes([aFinding()], seen)

    const { user } = renderWithProviders(<TechnicalNotesLink aircraftRegistration='OH-STL' />)

    expect(seen).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Recent technical notes' }))

    await waitFor(() =>
      expect(seen).toHaveBeenCalledWith({ aircraftRegistration: 'OH-STL', limit: '20' }),
    )
  })

  it('shows defects, remarks and maintenance notes in one list', async () => {
    serveNotes([
      aFinding({
        findingId: 'n-1',
        kind: 'MAINTENANCE_NOTE',
        description: '50 h inspection, oil and filter changed',
        performedBy: 'Huolto Oy',
      }),
      aFinding({
        findingId: 'd-1',
        kind: 'DEFECT',
        status: 'MOVED_TO_HIL',
        description: 'Landing light does not illuminate',
      }),
      aFinding({ findingId: 'r-1', description: 'Cabin door seal whistles above 100 kt' }),
    ])

    const { user } = renderWithProviders(<TechnicalNotesLink aircraftRegistration='OH-STL' />)
    await user.click(screen.getByRole('button', { name: 'Recent technical notes' }))

    expect(await screen.findByText('50 h inspection, oil and filter changed')).toBeInTheDocument()
    expect(screen.getByText('Landing light does not illuminate')).toBeInTheDocument()
    expect(screen.getByText('Cabin door seal whistles above 100 kt')).toBeInTheDocument()

    expect(screen.getByText('Maintenance note')).toBeInTheDocument()
    expect(screen.getByText('Defect')).toBeInTheDocument()
    expect(screen.getByText('Remark')).toBeInTheDocument()
  })

  it('shows a defect’s status and who did the maintenance work', async () => {
    serveNotes([
      aFinding({
        findingId: 'n-1',
        kind: 'MAINTENANCE_NOTE',
        description: 'Landing light bulb replaced',
        performedBy: 'Huolto Oy',
      }),
      aFinding({ findingId: 'd-1', kind: 'DEFECT', status: 'RESOLVED', description: 'Bulb out' }),
    ])

    const { user } = renderWithProviders(<TechnicalNotesLink aircraftRegistration='OH-STL' />)
    await user.click(screen.getByRole('button', { name: 'Recent technical notes' }))

    expect(await screen.findByText('by Huolto Oy')).toBeInTheDocument()
    expect(screen.getByText('Resolved')).toBeInTheDocument()
  })

  it('names the aircraft in the title, so a card is never read as another’s', async () => {
    serveNotes([aFinding()])

    const { user } = renderWithProviders(<TechnicalNotesLink aircraftRegistration='OH-IHQ' />)
    await user.click(screen.getByRole('button', { name: 'Recent technical notes' }))

    expect(await screen.findByText('OH-IHQ — recent technical notes')).toBeInTheDocument()
  })

  it('says so when the aircraft has no history yet', async () => {
    serveNotes([])

    const { user } = renderWithProviders(<TechnicalNotesLink aircraftRegistration='OH-STL' />)
    await user.click(screen.getByRole('button', { name: 'Recent technical notes' }))

    expect(
      await screen.findByText('Nothing has been recorded for this aircraft yet.'),
    ).toBeInTheDocument()
  })

  it('surfaces a failed request rather than an empty list', async () => {
    server.use(http.get(notesUrl, () => problemResponse(403, 'Forbidden')))

    const { user } = renderWithProviders(<TechnicalNotesLink aircraftRegistration='OH-STL' />)
    await user.click(screen.getByRole('button', { name: 'Recent technical notes' }))

    expect(await screen.findByText('No access')).toBeInTheDocument()
  })

  it('closes again', async () => {
    serveNotes([aFinding()])

    const { user } = renderWithProviders(<TechnicalNotesLink aircraftRegistration='OH-STL' />)
    await user.click(screen.getByRole('button', { name: 'Recent technical notes' }))
    await screen.findByText('Cabin door seal whistles above 100 kt')

    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() =>
      expect(screen.queryByText('Cabin door seal whistles above 100 kt')).not.toBeInTheDocument(),
    )
  })
})
