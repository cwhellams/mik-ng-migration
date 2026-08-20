import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { FlightLogAuditResponse } from '@mik/contracts/flight-log'

import { renderWithProviders } from '../../../test/renderWithProviders'
import { apiUrl, problemResponse } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { FlightLogAuditDialog } from './FlightLogAuditDialog'

const FLIGHT_ID = 'fi_inst1'

const trail = (entries: FlightLogAuditResponse['entries']) =>
  server.use(
    http.get(apiUrl(`v1/flight-logs/${FLIGHT_ID}/audit`), () => HttpResponse.json({ entries })),
  )

const anEntry = (
  overrides: Partial<FlightLogAuditResponse['entries'][number]> = {},
): FlightLogAuditResponse['entries'][number] => ({
  auditId: 1,
  operationType: 'UPDATE',
  changedBy: 'Jukka1',
  changedByName: 'Jukka Nieminen',
  changedAt: '2025-06-02T12:30:00.000Z',
  changes: [{ field: 'numberOfLandings', before: '1', after: '3' }],
  ...overrides,
})

describe('FlightLogAuditDialog', () => {
  it('lists who changed what, and to what', async () => {
    trail([anEntry()])
    renderWithProviders(<FlightLogAuditDialog flightId={FLIGHT_ID} open onClose={vi.fn()} />)

    const row = (await screen.findByText('Jukka Nieminen')).closest('tr')!
    expect(within(row).getByText('Edited')).toBeInTheDocument()
    expect(within(row).getByText(/Landings: 1 → 3/)).toBeInTheDocument()
  })

  it('falls back to the raw member id when the name no longer resolves', async () => {
    trail([anEntry({ changedByName: null })])
    renderWithProviders(<FlightLogAuditDialog flightId={FLIGHT_ID} open onClose={vi.fn()} />)

    expect(await screen.findByText('Jukka1')).toBeInTheDocument()
  })

  it('renders a null side of a change as a dash rather than the word null', async () => {
    trail([
      anEntry({
        changes: [{ field: 'incidentOrObservations', before: null, after: 'Engine ran rough' }],
      }),
    ])
    renderWithProviders(<FlightLogAuditDialog flightId={FLIGHT_ID} open onClose={vi.fn()} />)

    expect(
      await screen.findByText(/Incidents or observations: – → Engine ran rough/),
    ).toBeInTheDocument()
  })

  it('falls back to the raw field name for a column with no translation', async () => {
    // Keeps a newly added column showing up as itself instead of a missing-key marker.
    trail([anEntry({ changes: [{ field: 'someNewColumn', before: 'a', after: 'b' }] })])
    renderWithProviders(<FlightLogAuditDialog flightId={FLIGHT_ID} open onClose={vi.fn()} />)

    expect(await screen.findByText(/someNewColumn: a → b/)).toBeInTheDocument()
  })

  it('says so when the flight has no recorded changes', async () => {
    trail([])
    renderWithProviders(<FlightLogAuditDialog flightId={FLIGHT_ID} open onClose={vi.fn()} />)

    expect(await screen.findByText('No changes recorded for this flight.')).toBeInTheDocument()
  })

  it('shows an INSERT with no field list, since creating a flight changes nothing', async () => {
    trail([anEntry({ operationType: 'INSERT', changes: [] })])
    renderWithProviders(<FlightLogAuditDialog flightId={FLIGHT_ID} open onClose={vi.fn()} />)

    expect(await screen.findByText('Created')).toBeInTheDocument()
  })

  it('surfaces a refusal instead of an empty table', async () => {
    server.use(
      http.get(apiUrl(`v1/flight-logs/${FLIGHT_ID}/audit`), () =>
        problemResponse(403, 'Forbidden'),
      ),
    )
    renderWithProviders(<FlightLogAuditDialog flightId={FLIGHT_ID} open onClose={vi.fn()} />)

    expect(await screen.findByText('No access')).toBeInTheDocument()
  })

  it('does not fetch until it is opened', async () => {
    let requests = 0
    server.use(
      http.get(apiUrl(`v1/flight-logs/${FLIGHT_ID}/audit`), () => {
        requests += 1
        return HttpResponse.json({ entries: [] })
      }),
    )
    renderWithProviders(
      <FlightLogAuditDialog flightId={FLIGHT_ID} open={false} onClose={vi.fn()} />,
    )

    expect(requests).toEqual(0)
  })
})
