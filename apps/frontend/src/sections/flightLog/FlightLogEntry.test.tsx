import { FlightLogStatus } from '@mik/contracts/flight-log'
import type { Defect } from '@mik/contracts/defects'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { aFlightLog, AIRCRAFT_REGISTRATION } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import FlightLogEntry from './FlightLogEntry'

/**
 * The desktop-width classic form (the wizard's alternative, used on wide
 * viewports or via "Use full form instead"). Only covers the one behaviour
 * this suite was written for -- see FlightLogEntryWizard.test.tsx for the
 * mobile wizard's own, much broader coverage of the same "notes" step.
 */
const anExistingDefect = (overrides: Partial<Defect> = {}): Defect =>
  ({
    defectId: 'def-existing-1',
    aircraftRegistration: AIRCRAFT_REGISTRATION,
    description: 'Landing light flickers',
    status: 'ACTIVE',
    flightMins: 285_000,
    rows: 0,
    flightId: 'fi_inst1',
    hilId: null,
    resolvedNoteId: null,
    createdBy: 'Matti1',
    createdAt: '2025-06-02T09:00:00.000Z',
    updatedAt: '2025-06-02T09:00:00.000Z',
    updatedBy: 'Matti1',
    ...overrides,
  }) as unknown as Defect

// FlightLogEntry renders the mobile wizard below the "sm" breakpoint and the
// classic form at or above it. The test harness's default matchMedia stub
// answers `matches: false` to every query -- fine for components that check
// `.down(...)`, but this one checks `.up('sm')`, so left alone every test
// here would render the mobile view instead of the classic form under test.
window.matchMedia = ((query: string) => ({
  matches: true,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
  addListener: () => {},
  removeListener: () => {},
})) as typeof window.matchMedia

const classicFormApi = (existingDefects: Defect[] = []) => {
  server.use(
    http.get(apiUrl('v1/flight-logs/:id'), () =>
      HttpResponse.json(aFlightLog({ flightId: 'fi_inst1', status: FlightLogStatus.NEW })),
    ),
    http.get(apiUrl('v1/flight-logs/overlap-check'), () => HttpResponse.json({ conflicts: [] })),
    http.get(apiUrl('v1/useful-phone-numbers/flight-plan-centre'), () =>
      HttpResponse.json(null, { status: 404 }),
    ),
    http.get(apiUrl('v1/defects'), () => HttpResponse.json(existingDefects)),
  )
}

const renderClassicForm = () =>
  renderWithProviders(<FlightLogEntry />, {
    route: '/logs/fi_inst1',
    path: '/logs/:flightId',
  })

describe('FlightLogEntry (classic form) already-reported defects', () => {
  it('shows a defect already reported against this flight', async () => {
    classicFormApi([anExistingDefect()])

    renderClassicForm()

    expect(await screen.findByText('Landing light flickers')).toBeInTheDocument()
  })

  it('still offers to report new defects alongside existing ones', async () => {
    classicFormApi([anExistingDefect()])

    renderClassicForm()

    await screen.findByText('Landing light flickers')
    expect(screen.getByRole('button', { name: /add defect/i })).toBeInTheDocument()
  })

  it("does not show another flight's defects", async () => {
    classicFormApi([anExistingDefect({ flightId: 'some-other-flight' })])

    renderClassicForm()

    await screen.findByRole('button', { name: /add defect/i })
    expect(screen.queryByText('Landing light flickers')).not.toBeInTheDocument()
  })
})
