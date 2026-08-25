import { FlightLogStatus, FlightLogUpsertSchema } from '@mik/contracts/flight-log'
import type { Defect } from '@mik/contracts/defects'
import type { Remark } from '@mik/contracts/remarks'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  aFlightLog,
  aFuelRecord,
  aMemberListEntry,
  aMemberListResponse,
  anAircraftListResponse,
  AIRCRAFT_REGISTRATION,
} from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import FlightLogEntry from './FlightLogEntry'

/**
 * Tests for the FlightLogEntry component, specifically the transfer of wizard
 * draft values to the classic form when switching via "Use full form instead".
 * Fixes #1227 - Wizard and full form should share entered values.
 */

const WIZARD_DRAFT_KEY_PREFIX = 'wizardDraft:'

/** Writes a wizard draft straight into storage under this tab's own key, matching
 * the shape FlightLogEntryWizard itself writes (values plus the wizard-only bits). */
const seedWizardDraft = (
  logicalKey: string,
  values: Record<string, unknown>,
  savedAt = Date.now(),
) => {
  const tabId = sessionStorage.getItem('wizardDraft:tabId')
  const draftKey = `${WIZARD_DRAFT_KEY_PREFIX}${logicalKey}:${tabId}`
  const draft = {
    values,
    stepIndex: 3,
    flightDateIso: new Date().toISOString(),
    nightOrIfr: null,
    refueled: null,
    oilAdded: null,
    reportedDefects: [],
  }
  localStorage.setItem(draftKey, JSON.stringify({ savedAt, value: draft }))
}

/** Checks if a wizard draft exists in storage. */
const hasDraft = (logicalKey: string): boolean => {
  const tabId = sessionStorage.getItem('wizardDraft:tabId')
  const draftKey = `${WIZARD_DRAFT_KEY_PREFIX}${logicalKey}:${tabId}`
  return localStorage.getItem(draftKey) !== null
}

/** matchMedia stub answering every query with `matches`, matching the shape the
 * jsdom test harness expects. */
const stubMatchMedia = (matches: boolean) =>
  ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
    addListener: () => {},
    removeListener: () => {},
  })) as typeof window.matchMedia

const wizardToClassicApi = () => {
  server.use(
    http.get(apiUrl('v1/aircrafts'), () => HttpResponse.json(anAircraftListResponse())),
    http.get(apiUrl('v1/members'), () => HttpResponse.json(aMemberListResponse())),
    http.get(apiUrl('v1/flight-logs/overlap-check'), () => HttpResponse.json({ conflicts: [] })),
    http.get(apiUrl('v1/useful-phone-numbers/flight-plan-centre'), () =>
      HttpResponse.json(null, { status: 404 }),
    ),
    http.get(apiUrl('v1/defects'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/remarks'), () => HttpResponse.json([])),
  )
}

describe('FlightLogEntry wizard-to-classic-form draft transfer', () => {
  // Captured per-test (not once at describe-body time) so it reflects whatever the
  // module-level override below has set matchMedia to by the time tests actually
  // run -- restoring an earlier, stale value here would leave the classic-form-only
  // suites further down this file without the `isSmUp: true` override they need.
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    originalMatchMedia = window.matchMedia
    // Show the mobile wizard for a new entry (isSmUp false), unlike the file-wide
    // override below that the classic-form-only suites need.
    window.matchMedia = stubMatchMedia(false)
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('prefills the classic form from the wizard draft when switching via "Use full form instead", and clears the draft', async () => {
    wizardToClassicApi()
    seedWizardDraft('flightLog:new', {
      aircraftRegistration: AIRCRAFT_REGISTRATION,
      personalRemarks: 'Test flight from wizard',
    })

    const { user } = renderWithProviders(<FlightLogEntry />, {
      route: '/logs/new',
      path: '/logs/:flightId',
    })

    // Wizard is shown first, pre-populated from the same draft it reads on mount.
    const switchButton = await screen.findByRole('button', { name: 'Use full form instead' })
    await user.click(switchButton)

    // Switching renders the classic form with the draft's values merged into its
    // own defaultValues.
    expect(await screen.findByLabelText(/personal remarks/i)).toHaveValue('Test flight from wizard')
    expect(document.getElementById('mui-component-select-aircraftRegistration')).toHaveTextContent(
      AIRCRAFT_REGISTRATION,
    )

    // The draft was consumed, so it must not still be sitting in storage for
    // some future mount to pick back up.
    await waitFor(() => expect(hasDraft('flightLog:new')).toBe(false))
  })

  it('enables Save once a linked fuel record and "no oil added" resolve the previously-blocked fields', async () => {
    // Regression test: picking a pending record (or ticking "none added") does
    // not itself change fuelUpliftLitres/oilUpliftLitres away from the null they
    // already had, so RHF's own onChange-triggered validation never re-ran for
    // them and the stale "required" error from before the field was resolved
    // used to sit in formState.errors forever, keeping Save disabled.
    wizardToClassicApi()
    const posted: unknown[] = []
    server.use(
      http.post(apiUrl('v1/flight-logs'), async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(aFlightLog({ flightId: 'fl-new' }))
      }),
      http.get(apiUrl('v1/liquid/records/linkable'), () =>
        HttpResponse.json({ records: [aFuelRecord({ recordId: 'rec-fuel-1' })] }),
      ),
      http.post(apiUrl('v1/liquid/records/:recordId/link'), () =>
        HttpResponse.json(aFuelRecord({ recordId: 'rec-fuel-1' })),
      ),
      http.get(apiUrl('v1/flight-logs/airfields'), () => HttpResponse.json({ airfields: [] })),
      http.get(apiUrl('v1/dto/members/:memberId/syllabus'), () => HttpResponse.json(null)),
    )

    // A complete, otherwise-valid entry -- only fuel/oil are left unresolved.
    const validValues = FlightLogUpsertSchema.strip().parse(
      aFlightLog({ status: FlightLogStatus.NEW }),
    )
    seedWizardDraft('flightLog:new', {
      ...validValues,
      fuelUpliftLitres: null,
      oilUpliftLitres: null,
    })

    const { user } = renderWithProviders(<FlightLogEntry />, {
      route: '/logs/new',
      path: '/logs/:flightId',
    })

    await user.click(await screen.findByRole('button', { name: 'Use full form instead' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled())

    // Fuel's control renders before oil's.
    await user.click(screen.getAllByRole('button', { name: 'Link an existing record' })[0]!)
    await user.click(await screen.findByRole('button', { name: 'Link' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('checkbox', { name: 'No oil added' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(posted).toHaveLength(1))
  })

  it('does not read the draft when the classic form loads directly (not via a wizard switch)', async () => {
    wizardToClassicApi()
    seedWizardDraft('flightLog:new', {
      aircraftRegistration: AIRCRAFT_REGISTRATION,
      personalRemarks: 'Should not appear in direct classic form load',
    })
    // Large viewport: FlightLogEntry renders the classic form directly, with
    // forceClassicForm left at its default (false).
    window.matchMedia = stubMatchMedia(true)

    renderWithProviders(<FlightLogEntry />, {
      route: '/logs/new',
      path: '/logs/:flightId',
    })

    expect(await screen.findByLabelText(/personal remarks/i)).toHaveValue('')
    // Never read, so still sitting in storage afterwards.
    expect(hasDraft('flightLog:new')).toBe(true)
  })
})

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

// The defect description is typed three characters at a time on purpose. This form runs
// react-hook-form in `onChange` mode behind a resolver that validates the whole schema, so
// every keystroke costs a full re-render plus a full validation pass: the 21-character
// string these tests used to type accounted for ~6.5s of each one's ~7s runtime, and under
// CI's two-worker contention that pushed all three over the shared 20s testTimeout
// (reproduced on main, e.g. run 32305258268). Nothing here asserts on the text itself --
// only that a defect was reported -- so the shortest non-empty value does the same job.
describe('FlightLogEntry (classic form) defect grounding confirmation', () => {
  it('asks for grounding confirmation before saving when a defect was reported', async () => {
    const state = classicFormApi()
    const { user } = renderClassicForm()

    await user.click(await screen.findByRole('button', { name: /add defect/i }))
    await user.type(screen.getByLabelText(/description/i), 'Oil')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/will ground the aircraft/)).toBeInTheDocument()
    expect(state.patches).toBe(0)
  })

  it('saves once the grounding confirmation is accepted', async () => {
    const state = classicFormApi()
    const { user } = renderClassicForm()

    await user.click(await screen.findByRole('button', { name: /add defect/i }))
    await user.type(screen.getByLabelText(/description/i), 'Oil')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm & Save' }))

    await waitFor(() => expect(state.patches).toBe(1))
  })

  it('does not save when the grounding confirmation is cancelled', async () => {
    const state = classicFormApi()
    const { user } = renderClassicForm()

    await user.click(await screen.findByRole('button', { name: /add defect/i }))
    await user.type(screen.getByLabelText(/description/i), 'Oil')
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
