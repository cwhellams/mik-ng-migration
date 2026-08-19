import { FlightLogStatus } from '@mik/contracts/flight-log'
import type { Defect } from '@mik/contracts/defects'
import type { Remark } from '@mik/contracts/remarks'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  aFlightLog,
  aMemberListEntry,
  aMemberListResponse,
  AIRCRAFT_REGISTRATION,
} from '../../test/fixtures'
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

const anExistingRemark = (overrides: Partial<Remark> = {}): Remark => ({
  remarkId: 'remark-existing-1',
  flightId: 'fi_inst1',
  description: 'Oil stain noticed on the ramp, wiped off',
  createdAt: '2025-06-02T09:00:00.000Z',
  createdBy: 'Matti1',
  updatedAt: '2025-06-02T09:00:00.000Z',
  updatedBy: 'Matti1',
  ...overrides,
})

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

const classicFormApi = (
  existingDefects: Defect[] = [],
  existingRemarks: Remark[] = [],
  flightOverrides: Partial<ReturnType<typeof aFlightLog>> = {},
) => {
  const state = { patches: 0, defects: [] as unknown[] }

  server.use(
    // More specific path first: MSW tries handlers in order, and ':id' would
    // otherwise greedily match "overlap-check" as an id on any GET request.
    http.get(apiUrl('v1/flight-logs/overlap-check'), () => HttpResponse.json({ conflicts: [] })),
    http.get(apiUrl('v1/flight-logs/:id'), () =>
      HttpResponse.json(
        aFlightLog({ flightId: 'fi_inst1', status: FlightLogStatus.NEW, ...flightOverrides }),
      ),
    ),
    http.get(apiUrl('v1/useful-phone-numbers/flight-plan-centre'), () =>
      HttpResponse.json(null, { status: 404 }),
    ),
    http.get(apiUrl('v1/defects'), () => HttpResponse.json(existingDefects)),
    http.post(apiUrl('v1/defects'), async ({ request }) => {
      state.defects.push(await request.json())
      return HttpResponse.json({})
    }),
    http.get(apiUrl('v1/remarks'), ({ request }) => {
      const flightId = new URL(request.url).searchParams.get('flightId')
      return HttpResponse.json(existingRemarks.filter((r) => r.flightId === flightId))
    }),
    http.patch(apiUrl('v1/flight-logs/:id'), () => {
      state.patches += 1
      return HttpResponse.json(aFlightLog({ flightId: 'fi_inst1', status: FlightLogStatus.NEW }))
    }),
  )

  return state
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

  it('shows fleet manager contact details next to the defect-reporting note', async () => {
    classicFormApi()
    server.use(
      http.get(apiUrl('v1/members'), () =>
        HttpResponse.json(
          aMemberListResponse([
            aMemberListEntry({
              memberId: 'plane-captain-1',
              first: 'Pekka',
              last: 'Kalustovastaava',
              phoneNumber: '0409998888',
              roles: ['PLANE_CAPTAIN'],
            }),
          ]),
        ),
      ),
    )

    renderClassicForm()

    expect(await screen.findByText('Pekka Kalustovastaava')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '0409998888' })).toHaveAttribute(
      'href',
      'tel:0409998888',
    )
  })
})

describe('FlightLogEntry (classic form) already-logged remarks', () => {
  it('shows a remark already logged against this flight', async () => {
    classicFormApi([], [anExistingRemark()])

    renderClassicForm()

    expect(await screen.findByText('Oil stain noticed on the ramp, wiped off')).toBeInTheDocument()
  })

  it('still offers to report new remarks alongside existing ones', async () => {
    classicFormApi([], [anExistingRemark()])

    renderClassicForm()

    await screen.findByText('Oil stain noticed on the ramp, wiped off')
    expect(screen.getByRole('button', { name: /add remark/i })).toBeInTheDocument()
  })

  it("does not show another flight's remarks", async () => {
    classicFormApi([], [anExistingRemark({ flightId: 'some-other-flight' })])

    renderClassicForm()

    await screen.findByRole('button', { name: /add remark/i })
    expect(screen.queryByText('Oil stain noticed on the ramp, wiped off')).not.toBeInTheDocument()
  })
})

describe('FlightLogEntry (classic form) defect grounding confirmation', () => {
  it('asks for grounding confirmation before saving when a defect was reported', async () => {
    const state = classicFormApi()
    const { user } = renderClassicForm()

    await user.click(await screen.findByRole('button', { name: /add defect/i }))
    await user.type(screen.getByLabelText(/description/i), 'Oil stain on the ramp')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/will ground the aircraft/)).toBeInTheDocument()
    expect(state.patches).toBe(0)
  })

  it('saves once the grounding confirmation is accepted', async () => {
    const state = classicFormApi()
    const { user } = renderClassicForm()

    await user.click(await screen.findByRole('button', { name: /add defect/i }))
    await user.type(screen.getByLabelText(/description/i), 'Oil stain on the ramp')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm & Save' }))

    await waitFor(() => expect(state.patches).toBe(1))
  })

  it('does not save when the grounding confirmation is cancelled', async () => {
    const state = classicFormApi()
    const { user } = renderClassicForm()

    await user.click(await screen.findByRole('button', { name: /add defect/i }))
    await user.type(screen.getByLabelText(/description/i), 'Oil stain on the ramp')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(state.patches).toBe(0)
  })

  it('saves directly, with no confirmation, when no defect was reported', async () => {
    const state = classicFormApi()
    const { user } = renderClassicForm()

    await screen.findByRole('button', { name: /add defect/i })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.patches).toBe(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('FlightLogEntry (classic form) long taxi confirmation', () => {
  // 2025-06-02T09:00:00.000Z, 65 minutes before takeoff (the fixture's own default)
  const longTaxiOutOverrides = {
    offBlockTimeEpoch: '1748854800',
    takeoffTimeEpoch: '1748858700',
  }

  it('asks for confirmation before saving when taxi-out exceeds an hour', async () => {
    const state = classicFormApi([], [], longTaxiOutOverrides)
    const { user } = renderClassicForm()

    await screen.findByRole('button', { name: /add defect/i })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/65 minutes of taxi-out time/)).toBeInTheDocument()
    expect(state.patches).toBe(0)
  })

  it('saves once the long-taxi confirmation is accepted', async () => {
    const state = classicFormApi([], [], longTaxiOutOverrides)
    const { user } = renderClassicForm()

    await screen.findByRole('button', { name: /add defect/i })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm & Save' }))

    await waitFor(() => expect(state.patches).toBe(1))
  })

  it('does not save when the long-taxi confirmation is cancelled', async () => {
    const state = classicFormApi([], [], longTaxiOutOverrides)
    const { user } = renderClassicForm()

    await screen.findByRole('button', { name: /add defect/i })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(state.patches).toBe(0)
  })
})
