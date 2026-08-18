import { FlightLogStatus, type FlightLog } from '@mik/contracts/flight-log'
import type { Defect } from '@mik/contracts/defects'
import type { Remark } from '@mik/contracts/remarks'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  aFlightLog,
  aMemberListEntry,
  aMemberListResponse,
  anAircraftListResponse,
  AIRCRAFT_REGISTRATION,
} from '../../../test/fixtures'
import { apiUrl, problemResponse } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { FlightLogEntryWizard } from './FlightLogEntryWizard'

/**
 * The mobile flight log wizard (#1115 §11). Twelve steps, each gated on its own
 * fields, over a form that autosaves to localStorage so an iOS Safari-killed tab
 * can resume. The tests here concentrate on the parts that lose a pilot's work
 * if they go wrong: step gating, the draft lifecycle, and the save itself.
 */
const DRAFT_KEY_PREFIX = 'wizardDraft:flightLog:'

type Write = { method: string; body: unknown }

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

const wizardApi = (existingDefects: Defect[] = [], existingRemarks: Remark[] = []) => {
  const state = { writes: [] as Write[], defects: [] as unknown[], remarks: [] as unknown[] }

  server.use(
    http.get(apiUrl('v1/aircrafts'), () => HttpResponse.json(anAircraftListResponse())),
    http.get(apiUrl('v1/members'), () => HttpResponse.json(aMemberListResponse())),
    http.get(apiUrl('v1/flight-logs/overlap-check'), () => HttpResponse.json({ conflicts: [] })),
    http.get(apiUrl('v1/flight-logs'), () => HttpResponse.json({ flightLogs: [] })),
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
    http.post(apiUrl('v1/remarks'), async ({ request }) => {
      state.remarks.push(await request.json())
      return HttpResponse.json({})
    }),
    http.post(apiUrl('v1/flight-logs'), async ({ request }) => {
      state.writes.push({ method: 'POST', body: await request.json() })
      return HttpResponse.json(aFlightLog({ flightId: 'fl-new' }))
    }),
    http.patch(apiUrl('v1/flight-logs/:id'), async ({ request }) => {
      state.writes.push({ method: 'PATCH', body: await request.json() })
      return HttpResponse.json(aFlightLog())
    }),
  )

  return state
}

const anEditableLog = (overrides: Partial<FlightLog> = {}) =>
  aFlightLog({ status: FlightLogStatus.NEW, ...overrides })

const renderWizard = (props: Partial<Parameters<typeof FlightLogEntryWizard>[0]> = {}) =>
  renderWithProviders(<FlightLogEntryWizard onSwitchToClassicForm={() => {}} {...props} />, {
    route: '/logs/new',
  })

/** Writes a draft straight into storage under this tab's own key. */
const seedDraft = (logicalKey: string, value: unknown, savedAt = Date.now()) => {
  const tabId = sessionStorage.getItem('wizardDraft:tabId')
  localStorage.setItem(
    `${DRAFT_KEY_PREFIX}${logicalKey}:${tabId}`,
    JSON.stringify({ savedAt, value }),
  )
}

const draftKeysFor = (logicalKey: string) => {
  // The harness installs a plain in-memory Storage, so its entries are not own
  // properties of the object — they have to be walked through the Storage API.
  const prefix = `${DRAFT_KEY_PREFIX}${logicalKey}:`
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  return keys
}

describe('FlightLogEntryWizard step gating', () => {
  it('opens on the first step, with Next held back until an aircraft is picked', async () => {
    wizardApi()

    renderWizard()

    expect(await screen.findByText('Aircraft & flight type')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('lets the pilot move on once the aircraft and flight type are both chosen', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Aircraft & flight type')

    await user.click(await screen.findByRole('button', { name: 'OH-STL' }))
    // A flight type is pre-selected, so picking the aircraft is enough.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Crew')).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 12')).toBeInTheDocument()
  })

  it('offers no Back on the first step', async () => {
    wizardApi()

    renderWizard()
    await screen.findByText('Aircraft & flight type')

    expect(screen.queryByRole('button', { name: /back/i })).toBeNull()
  })

  it('goes back to the previous step, keeping what was entered', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Aircraft & flight type')

    await user.click(await screen.findByRole('button', { name: 'OH-STL' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Crew')

    await user.click(screen.getByRole('button', { name: /back/i }))

    expect(await screen.findByText('Aircraft & flight type')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OH-STL' })).toHaveClass('MuiButton-contained')
  })

  it('opens straight on the step it was told to', async () => {
    wizardApi()

    renderWizard({ flightId: 'fi_inst1', initialData: anEditableLog(), initialStep: 'review' })

    expect(await screen.findByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Step 12 of 12')).toBeInTheDocument()
  })
})

describe('FlightLogEntryWizard drafts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('autosaves the entry as it is filled in', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Aircraft & flight type')

    await user.click(await screen.findByRole('button', { name: 'OH-STL' }))

    // The first snapshot is written on mount, so wait for the *content* rather
    // than for the key to appear.
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(draftKeysFor('new')[0])!)
      expect(stored.value.values.aircraftRegistration).toBe('OH-STL')
    })
  })

  it('says so when an unfinished entry is resumed', async () => {
    wizardApi()
    seedDraft('new', {
      values: { aircraftRegistration: 'OH-STL' },
      stepIndex: 1,
      flightDateIso: new Date().toISOString(),
      nightOrIfr: null,
      refueled: null,
      oilAdded: null,
      reportedDefects: [],
    })

    renderWizard()

    expect(await screen.findByText('Resumed your unfinished entry.')).toBeInTheDocument()
    // Resumed onto the step it was left on, not back at the beginning.
    expect(screen.getByText('Step 2 of 12')).toBeInTheDocument()
  })

  it('shows no banner when there was nothing to resume', async () => {
    wizardApi()

    renderWizard()
    await screen.findByText('Aircraft & flight type')

    expect(screen.queryByText('Resumed your unfinished entry.')).toBeNull()
  })

  it('throws away a draft older than the entry’s last server-side change', async () => {
    wizardApi()
    const log = anEditableLog({ updatedAt: new Date('2027-01-02T00:00:00Z').toISOString() })
    seedDraft(
      'fi_inst1',
      {
        values: { aircraftRegistration: 'OH-XYZ' },
        stepIndex: 0,
        flightDateIso: new Date().toISOString(),
        nightOrIfr: null,
        refueled: null,
        oilAdded: null,
        reportedDefects: [],
      },
      Date.parse('2027-01-01T00:00:00Z'),
    )

    renderWizard({ flightId: 'fi_inst1', initialData: log })

    // Replaying it would silently revert whatever the later edit changed.
    expect(await screen.findByText('Aircraft & flight type')).toBeInTheDocument()
    expect(screen.queryByText('Resumed your unfinished entry.')).toBeNull()
  })

  it('keeps a draft saved after the entry’s last server-side change', async () => {
    wizardApi()
    const log = anEditableLog({ updatedAt: new Date('2027-01-01T00:00:00Z').toISOString() })
    seedDraft(
      'fi_inst1',
      {
        values: { aircraftRegistration: 'OH-STL' },
        stepIndex: 0,
        flightDateIso: new Date().toISOString(),
        nightOrIfr: null,
        refueled: null,
        oilAdded: null,
        reportedDefects: [],
      },
      Date.parse('2027-01-02T00:00:00Z'),
    )

    renderWizard({ flightId: 'fi_inst1', initialData: log })

    expect(await screen.findByText('Resumed your unfinished entry.')).toBeInTheDocument()
  })

  it('lets the resumed draft be thrown away from the banner', async () => {
    wizardApi()
    seedDraft('new', {
      values: { aircraftRegistration: 'OH-STL' },
      stepIndex: 0,
      flightDateIso: new Date().toISOString(),
      nightOrIfr: null,
      refueled: null,
      oilAdded: null,
      reportedDefects: [],
    })

    const { user } = renderWizard()
    const banner = (await screen.findByText('Resumed your unfinished entry.')).closest<HTMLElement>(
      '.MuiAlert-root',
    )!

    await user.click(within(banner).getByRole('button', { name: 'Discard' }))

    await waitFor(() => expect(draftKeysFor('new')).toHaveLength(0))
  })

  it('offers only Discard on the resumed banner, with no way to dismiss it', async () => {
    wizardApi()
    seedDraft('new', {
      values: { aircraftRegistration: 'OH-STL' },
      stepIndex: 0,
      flightDateIso: new Date().toISOString(),
      nightOrIfr: null,
      refueled: null,
      oilAdded: null,
      reportedDefects: [],
    })

    renderWizard()
    const banner = (await screen.findByText('Resumed your unfinished entry.')).closest<HTMLElement>(
      '.MuiAlert-root',
    )!

    // Worth pinning: the alert passes both `action` and `onClose`, and MUI drops
    // its built-in close button whenever an `action` is given — so the banner's
    // own dismiss handler is unreachable and the banner stays until Discard.
    expect(within(banner).getAllByRole('button')).toHaveLength(1)
    expect(within(banner).getByRole('button')).toHaveAccessibleName('Discard')
  })
})

describe('FlightLogEntryWizard discarding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('asks before throwing the entry away', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Aircraft & flight type')

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(
      await screen.findByText('Discard this entry? Nothing has been saved.'),
    ).toBeInTheDocument()
  })

  it('keeps the entry when the pilot backs out', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Aircraft & flight type')
    await user.click(await screen.findByRole('button', { name: 'OH-STL' }))
    await waitFor(() => expect(draftKeysFor('new')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Close' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(draftKeysFor('new')).toHaveLength(1)
  })

  it('clears the saved draft once discarding is confirmed', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Aircraft & flight type')
    await user.click(await screen.findByRole('button', { name: 'OH-STL' }))
    await waitFor(() => expect(draftKeysFor('new')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Close' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))

    await waitFor(() => expect(draftKeysFor('new')).toHaveLength(0))
  })

  it('closes the editor rather than navigating when editing an existing entry', async () => {
    wizardApi()
    const onClose = vi.fn()

    const { user } = renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'review',
      onClose,
    })
    await screen.findByText('Review')

    await user.click(screen.getByRole('button', { name: 'Close' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})

describe('FlightLogEntryWizard saving', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const renderOnReview = (overrides: Partial<FlightLog> = {}) =>
    renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(overrides),
      initialStep: 'review',
      onClose: () => {},
    })

  it('patches an existing entry rather than creating a second one', async () => {
    const state = wizardApi()

    const { user } = renderOnReview()
    await screen.findByText('Review')

    await user.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].method).toBe('PATCH')
  })

  it('sends the entry it was seeded with', async () => {
    const state = wizardApi()

    const { user } = renderOnReview()
    await screen.findByText('Review')

    await user.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({
      aircraftRegistration: 'OH-STL',
      departureAirport: 'EFNU',
      arrivalAirport: 'EFNU',
    })
  })

  it('closes the editor and clears the draft once saved', async () => {
    wizardApi()
    const onClose = vi.fn()

    const { user } = renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'review',
      onClose,
    })
    await screen.findByText('Review')

    await user.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(draftKeysFor('fi_inst1')).toHaveLength(0)
  })

  it('keeps the entry on screen when the save is rejected', async () => {
    wizardApi()
    server.use(
      http.patch(apiUrl('v1/flight-logs/:id'), () => problemResponse(409, 'Hobbs went backwards')),
    )
    const onClose = vi.fn()

    const { user } = renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'review',
      onClose,
    })
    await screen.findByText('Review')

    await user.click(screen.getByRole('button', { name: 'Accept' }))

    expect(await screen.findByText(/Hobbs went backwards/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers to report defects on an entry not yet validated', async () => {
    wizardApi()

    renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'notes',
      onClose: () => {},
    })

    expect(await screen.findByText('Notes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /defect/i })).toBeInTheDocument()
  })

  it('shows fleet manager contact details next to the defect-reporting note', async () => {
    wizardApi()
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

    renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'notes',
      onClose: () => {},
    })

    expect(await screen.findByText('Pekka Kalustovastaava')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '0409998888' })).toHaveAttribute(
      'href',
      'tel:0409998888',
    )
  })

  it('shows a defect already reported against this flight, alongside the ability to add new ones', async () => {
    wizardApi([anExistingDefect()])

    renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'notes',
      onClose: () => {},
    })

    expect(await screen.findByText('Landing light flickers')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add defect/i })).toBeInTheDocument()
  })

  it("does not show another flight's defects", async () => {
    wizardApi([anExistingDefect({ flightId: 'some-other-flight' })])

    renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'notes',
      onClose: () => {},
    })

    await screen.findByText('Notes')
    expect(screen.queryByText('Landing light flickers')).not.toBeInTheDocument()
  })

  it('offers to report remarks on an entry not yet validated', async () => {
    wizardApi()

    renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'notes',
      onClose: () => {},
    })

    expect(await screen.findByText('Notes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add remark/i })).toBeInTheDocument()
  })

  it('shows a remark already logged against this flight, alongside the ability to add new ones', async () => {
    wizardApi([], [anExistingRemark()])

    renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'notes',
      onClose: () => {},
    })

    expect(await screen.findByText('Oil stain noticed on the ramp, wiped off')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add remark/i })).toBeInTheDocument()
  })

  it("does not show another flight's remarks", async () => {
    wizardApi([], [anExistingRemark({ flightId: 'some-other-flight' })])

    renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'notes',
      onClose: () => {},
    })

    await screen.findByText('Notes')
    expect(screen.queryByText('Oil stain noticed on the ramp, wiped off')).not.toBeInTheDocument()
  })

  it('withholds remark reporting once the entry has been validated', async () => {
    wizardApi()

    renderWizard({
      flightId: 'fi_inst1',
      initialData: aFlightLog({ status: FlightLogStatus.VALIDATED }),
      initialStep: 'notes',
      onClose: () => {},
    })

    await screen.findByText('Notes')
    expect(screen.queryByRole('button', { name: /add remark/i })).toBeNull()
  })

  it('withholds defect reporting once the entry has been validated', async () => {
    wizardApi()

    renderWizard({
      flightId: 'fi_inst1',
      initialData: aFlightLog({ status: FlightLogStatus.VALIDATED }),
      initialStep: 'notes',
      onClose: () => {},
    })

    await screen.findByText('Notes')
    expect(screen.queryByRole('button', { name: /defect/i })).toBeNull()
  })
})

describe('FlightLogEntryWizard defect grounding confirmation', () => {
  const addDefectAndReachReview = async (
    user: ReturnType<typeof renderWizard>['user'],
  ): Promise<void> => {
    await screen.findByText('Notes')
    await user.click(screen.getByRole('button', { name: /add defect/i }))
    await user.type(screen.getByLabelText(/description/i), 'Oil stain on the ramp')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Review')
    await user.click(screen.getByRole('button', { name: 'Accept' }))
  }

  it('asks for grounding confirmation before saving when a defect was reported', async () => {
    const state = wizardApi()

    const { user } = renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'notes',
      onClose: () => {},
    })

    await addDefectAndReachReview(user)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/will ground the aircraft/)).toBeInTheDocument()
    expect(state.writes).toHaveLength(0)
  })

  it('saves once the grounding confirmation is accepted', async () => {
    const state = wizardApi()

    const { user } = renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'notes',
      onClose: () => {},
    })

    await addDefectAndReachReview(user)

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm & Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
  })

  it('does not save when the grounding confirmation is cancelled', async () => {
    const state = wizardApi()

    const { user } = renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'notes',
      onClose: () => {},
    })

    await addDefectAndReachReview(user)

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(state.writes).toHaveLength(0)
  })

  it('saves directly, with no confirmation, when no defect was reported', async () => {
    const state = wizardApi()

    const { user } = renderWizard({
      flightId: 'fi_inst1',
      initialData: anEditableLog(),
      initialStep: 'review',
      onClose: () => {},
    })
    await screen.findByText('Review')

    await user.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
