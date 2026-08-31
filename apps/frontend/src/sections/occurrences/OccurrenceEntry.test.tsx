import { MIKPermissions } from '@mik/contracts/members'
import { OccurrenceStatus, type Occurrence } from '@mik/contracts/occurrences'
import type { OccurrencePrefill } from '../flightLog/safetyOccurrence'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { signInAs, signInWithPermissions } from '../../test/auth'
import { aMember, anAircraftListResponse, MEMBER_ID } from '../../test/fixtures'
import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { OccurrenceEntry } from './OccurrenceEntry'

/**
 * Safety occurrence reports (#1115 §11). This screen is the one place in the app
 * where the *reporter's identity* is the thing being protected: a report starts
 * visible only to the independent processor, gets anonymised into a copy, and
 * only then reaches the safety team. What is editable, and which handling
 * controls exist at all, is therefore driven by status × access × SMS role.
 */
const anAccess = (overrides: Partial<Occurrence['access'][number]> = {}) =>
  ({
    accessId: 1,
    memberId: MEMBER_ID,
    roleId: null,
    author: true,
    write: true,
    manage: true,
    ...overrides,
  }) as Occurrence['access'][number]

const anOccurrence = (overrides: Partial<Occurrence> = {}) =>
  ({
    id: 'occ-1',
    status: OccurrenceStatus.NEW,
    occurrenceDate: '2026-05-01T09:00:00.000Z',
    reportDate: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
    createdBy: MEMBER_ID,
    headline: 'Bird strike on approach',
    location: 'EFNU final',
    description: 'A gull struck the leading edge on short final.',
    categories: ['BIRD'],
    isWeatherRelevant: false,
    animalNumber: '1',
    animalSize: 'medium',
    animalSpecies: 'gull',
    aircraftRegistration: 'OH-STL',
    aircraftTechnicalFault: false,
    departureAirport: 'EFNU',
    arrivalAirport: 'EFNU',
    isDtoReport: false,
    linkedReportId: null,
    access: [anAccess()],
    comments: [],
    handling: {},
    attachments: [],
    ...overrides,
  }) as unknown as Occurrence

type Write = { method: string; path: string; body: unknown }

const occurrencesApi = (occurrence?: Occurrence) => {
  const state = { writes: [] as Write[] }
  const record = async (method: string, path: string, request?: Request) => {
    state.writes.push({
      method,
      path,
      body: request ? await request.json().catch(() => null) : null,
    })
  }

  server.use(
    http.get(apiUrl('v1/aircrafts'), () => HttpResponse.json(anAircraftListResponse())),
    http.get(apiUrl('v1/flight-logs/airfields'), () =>
      HttpResponse.json({
        airfields: ['EFNU', 'EFHK'].map((ident) => ({ ident, name: `${ident} airport` })),
      }),
    ),
    http.get(apiUrl('v1/occurrences/:id'), () =>
      occurrence ? HttpResponse.json(occurrence) : problemResponse(404, 'Not found'),
    ),
    http.post(apiUrl('v1/occurrences/:id/status/:status'), async ({ params, request }) => {
      await record('STATUS', String(params.status), request)
      return HttpResponse.json(anOccurrence({ id: 'occ-copy' }))
    }),
    http.post(apiUrl('v1/occurrences/:id/camo'), async ({ request }) => {
      await record('CAMO', '', request)
      return HttpResponse.json(anOccurrence())
    }),
    http.post(apiUrl('v1/occurrences/:id/comment'), async ({ request }) => {
      await record('COMMENT', '', request)
      return HttpResponse.json(anOccurrence())
    }),
    http.post(apiUrl('v1/occurrences'), async ({ request }) => {
      await record('POST', '', request)
      return HttpResponse.json(anOccurrence({ id: 'occ-new' }))
    }),
    http.patch(apiUrl('v1/occurrences/:id'), async ({ request, params }) => {
      await record('PATCH', String(params.id), request)
      return HttpResponse.json(anOccurrence())
    }),
  )

  return state
}

const renderNew = () =>
  renderWithProviders(<OccurrenceEntry />, {
    route: '/logs/occurrences/new',
    path: '/logs/occurrences/:reportId',
  })

const renderExisting = (id = 'occ-1') =>
  renderWithProviders(<OccurrenceEntry />, {
    route: `/logs/occurrences/${id}`,
    path: '/logs/occurrences/:reportId',
    sudo: true,
  })

describe('OccurrenceEntry new report', () => {
  it('opens an empty form titled as a new report', async () => {
    occurrencesApi()

    renderNew()

    expect(await screen.findByRole('heading', { name: 'New Report' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Headline/ })).toHaveValue('')
  })

  it('says attachments have to wait until the report is saved', async () => {
    occurrencesApi()

    renderNew()

    expect(
      await screen.findByText('Save the report first before adding attachments.'),
    ).toBeInTheDocument()
  })

  it('offers no handling, sharing or comments before the report exists', async () => {
    occurrencesApi()

    renderNew()
    await screen.findByRole('heading', { name: 'New Report' })

    expect(screen.queryByText('Safety Management System')).toBeNull()
    expect(screen.queryByText('Sharing')).toBeNull()
  })

  it('leaves the DTO flag off even for a training-programme pilot', async () => {
    occurrencesApi()
    signInAs(aMember({ isTrainingProgramPilot: true }))

    renderNew()

    // Worth pinning: the form intends to default this from the reporter's own
    // training status, but `defaultValues` is captured on the first render and
    // `me` only resolves after it, so the default is always false in practice.
    expect(await screen.findByRole('checkbox', { name: /Was this a DTO Flight/ })).not.toBeChecked()
  })

  it('posts a new report rather than patching', async () => {
    const state = occurrencesApi()

    const { user } = renderNew()
    await screen.findByRole('heading', { name: 'New Report' })

    await user.type(screen.getByRole('textbox', { name: /Headline/ }), 'Bird strike on approach')
    await user.type(screen.getByRole('textbox', { name: /Location/ }), 'EFNU final')
    await user.type(screen.getByRole('textbox', { name: /Description/ }), 'A gull struck.')
    await user.click(screen.getByRole('combobox', { name: /Categories/ }))
    await user.click(await screen.findByRole('option', { name: 'Birdstrike' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('group', { name: /Occurrence Date/ }))
    await user.keyboard('01052026 0900')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      body: { headline: 'Bird strike on approach', location: 'EFNU final', categories: ['BIRD'] },
    })
  })

  it('sends a blank aircraft and airports as null, not empty strings', async () => {
    const state = occurrencesApi()

    const { user } = renderNew()
    await screen.findByRole('heading', { name: 'New Report' })

    await user.type(screen.getByRole('textbox', { name: /Headline/ }), 'Bird strike on approach')
    await user.type(screen.getByRole('textbox', { name: /Location/ }), 'EFNU final')
    await user.type(screen.getByRole('textbox', { name: /Description/ }), 'A gull struck.')
    await user.click(screen.getByRole('combobox', { name: /Categories/ }))
    await user.click(await screen.findByRole('option', { name: 'Birdstrike' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('group', { name: /Occurrence Date/ }))
    await user.keyboard('01052026 0900')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({
      aircraftRegistration: null,
      departureAirport: null,
      arrivalAirport: null,
    })
  })
})

describe('OccurrenceEntry existing report', () => {
  it('pre-fills the report and titles it as an edit', async () => {
    occurrencesApi(anOccurrence())

    renderExisting()

    expect(await screen.findByRole('heading', { name: 'Edit Report' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Headline/ })).toHaveValue('Bird strike on approach')
    expect(screen.getByRole('textbox', { name: /Location/ })).toHaveValue('EFNU final')
  })

  it('reports a failed load', async () => {
    occurrencesApi()
    server.use(http.get(apiUrl('v1/occurrences/:id'), () => problemResponse(403, 'No access')))

    renderExisting()

    expect(await screen.findByText(/No access/)).toBeInTheDocument()
  })

  it('patches the report against its own id', async () => {
    const state = occurrencesApi(anOccurrence())

    const { user } = renderExisting()
    const headline = await screen.findByRole('textbox', { name: /Headline/ })

    await user.clear(headline)
    await user.type(headline, 'Bird strike on short final')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PATCH',
      path: 'occ-1',
      body: { headline: 'Bird strike on short final' },
    })
  })

  it('confirms a successful save', async () => {
    occurrencesApi(anOccurrence())

    const { user } = renderExisting()
    await screen.findByRole('textbox', { name: /Headline/ })

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved successfully')).toBeInTheDocument()
  })

  it('surfaces the API’s reason when a save is rejected', async () => {
    occurrencesApi(anOccurrence())
    server.use(
      http.patch(apiUrl('v1/occurrences/:id'), () => problemResponse(409, 'Report already closed')),
    )

    const { user } = renderExisting()
    await screen.findByRole('textbox', { name: /Headline/ })

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Report already closed')).toBeInTheDocument()
  })

  it('shows the aircraft technical-fault question only once an aircraft is named', async () => {
    occurrencesApi(anOccurrence({ aircraftRegistration: null }))

    renderExisting()
    await screen.findByRole('textbox', { name: /Headline/ })

    expect(screen.queryByRole('checkbox', { name: /technical condition/ })).toBeNull()
  })

  it('asks the technical-fault question when there is an aircraft', async () => {
    occurrencesApi(anOccurrence())

    renderExisting()

    expect(await screen.findByRole('checkbox', { name: /technical condition/ })).toBeInTheDocument()
  })
})

describe('OccurrenceEntry editability', () => {
  it('lets an author with write access edit a NEW report', async () => {
    occurrencesApi(anOccurrence({ status: OccurrenceStatus.NEW }))

    renderExisting()

    expect(await screen.findByRole('textbox', { name: /Headline/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('locks a report that has moved past anonymising', async () => {
    occurrencesApi(anOccurrence({ status: OccurrenceStatus.ANONYMIZED }))

    renderExisting()

    expect(await screen.findByRole('textbox', { name: /Headline/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('locks a report the member may read but not write', async () => {
    occurrencesApi(
      anOccurrence({ access: [anAccess({ author: false, write: false, manage: false })] }),
    )

    renderExisting()

    expect(await screen.findByRole('textbox', { name: /Headline/ })).toBeDisabled()
  })

  it('leaves a closed report read-only', async () => {
    occurrencesApi(anOccurrence({ status: OccurrenceStatus.CLOSED }))

    renderExisting()

    expect(await screen.findByRole('textbox', { name: /Headline/ })).toBeDisabled()
  })
})

describe('OccurrenceEntry safety-management handling', () => {
  const renderAsProcessor = () => {
    signInWithPermissions(MIKPermissions.SMS_PROCESSOR)
    return renderExisting()
  }

  const renderAsManager = () => {
    signInWithPermissions(MIKPermissions.SMS_MANAGER)
    return renderExisting()
  }

  it('offers the processor the receive-and-copy step on a new report', async () => {
    occurrencesApi(anOccurrence({ status: OccurrenceStatus.NEW }))

    renderAsProcessor()

    expect(
      await screen.findByRole('button', {
        name: 'Mark Received and Create Copy for Anonymization',
      }),
    ).toBeInTheDocument()
  })

  it('posts the status change to the report’s own status endpoint', async () => {
    const state = occurrencesApi(anOccurrence({ status: OccurrenceStatus.NEW }))

    const { user } = renderAsProcessor()
    await user.click(
      await screen.findByRole('button', {
        name: 'Mark Received and Create Copy for Anonymization',
      }),
    )

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'STATUS', path: 'RECEIVED' })
  })

  it('warns that publishing an anonymised report revokes the processor’s own access', async () => {
    occurrencesApi(anOccurrence({ status: OccurrenceStatus.ANONYMIZING }))

    const { user } = renderAsProcessor()
    await user.click(await screen.findByRole('button', { name: 'Publish Anonymized Report' }))

    expect(
      await screen.findByText(/Your own access as Independent Reviewer will be revoked/),
    ).toBeInTheDocument()
  })

  it('publishes only once the processor confirms', async () => {
    const state = occurrencesApi(anOccurrence({ status: OccurrenceStatus.ANONYMIZING }))

    const { user } = renderAsProcessor()
    await user.click(await screen.findByRole('button', { name: 'Publish Anonymized Report' }))
    const dialog = await screen.findByRole('dialog')
    expect(state.writes).toHaveLength(0)

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'STATUS', path: 'ANONYMIZED' })
  })

  it('offers to send an aircraft-fault report to CAMO once anonymised', async () => {
    occurrencesApi(
      anOccurrence({ status: OccurrenceStatus.ANONYMIZED, aircraftTechnicalFault: true }),
    )

    renderAsManager()

    expect(await screen.findByRole('button', { name: 'Send to CAMO' })).toBeInTheDocument()
  })

  it('offers no CAMO hand-off when the report is not about a technical fault', async () => {
    occurrencesApi(
      anOccurrence({ status: OccurrenceStatus.ANONYMIZED, aircraftTechnicalFault: false }),
    )

    renderAsManager()
    await screen.findByText('Safety Management System')

    expect(screen.queryByRole('button', { name: 'Send to CAMO' })).toBeNull()
  })

  it('offers no CAMO hand-off once CAMO already has access', async () => {
    occurrencesApi(
      anOccurrence({
        status: OccurrenceStatus.ANONYMIZED,
        aircraftTechnicalFault: true,
        access: [anAccess(), anAccess({ accessId: 2, memberId: null, roleId: 'CAMO' })],
      }),
    )

    renderAsManager()
    await screen.findByText('Safety Management System')

    expect(screen.queryByRole('button', { name: 'Send to CAMO' })).toBeNull()
  })

  it('posts to the CAMO endpoint once confirmed', async () => {
    const state = occurrencesApi(
      anOccurrence({ status: OccurrenceStatus.ANONYMIZED, aircraftTechnicalFault: true }),
    )

    const { user } = renderAsManager()
    await user.click(await screen.findByRole('button', { name: 'Send to CAMO' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].method).toBe('CAMO')
  })

  it('reports a refused status change', async () => {
    occurrencesApi(anOccurrence({ status: OccurrenceStatus.NEW }))
    server.use(
      http.post(apiUrl('v1/occurrences/:id/status/:status'), () =>
        problemResponse(409, 'Already received'),
      ),
    )

    const { user } = renderAsProcessor()
    await user.click(
      await screen.findByRole('button', {
        name: 'Mark Received and Create Copy for Anonymization',
      }),
    )

    expect(await screen.findByText('Already received')).toBeInTheDocument()
  })
})

describe('OccurrenceEntry comments', () => {
  it('withholds comments while the report is still NEW', async () => {
    occurrencesApi(anOccurrence({ status: OccurrenceStatus.NEW }))

    renderExisting()
    await screen.findByRole('textbox', { name: /Headline/ })

    expect(screen.queryByRole('button', { name: 'Add Comment' })).toBeNull()
  })

  it('offers comments once the report has moved on', async () => {
    occurrencesApi(anOccurrence({ status: OccurrenceStatus.ANONYMIZING }))

    renderExisting()

    expect(await screen.findByRole('button', { name: 'Add Comment' })).toBeInTheDocument()
  })
})

/**
 * The receiving half of the flight log's "was safety affected?" prompt (#1225).
 * Nothing is written server-side by answering yes — the flight's data is handed over
 * in the router's own state, and the report exists only once the pilot submits it.
 * What is persisted is the *draft*, in localStorage, so a reload on the apron doesn't
 * throw away a half-written report.
 */
const DRAFT_KEY_PREFIX = 'wizardDraft:occurrence:new'

const aPrefill = (overrides: Partial<OccurrencePrefill> = {}): OccurrencePrefill => ({
  sourceFlightId: 'fl-1',
  occurrenceDate: '2026-05-01T09:00:00.000Z',
  aircraftRegistration: 'OH-STL',
  departureAirport: 'EFNU',
  arrivalAirport: 'EFHK',
  description: 'Engine ran rough on climb',
  ...overrides,
})

const renderFromFlight = (prefill: OccurrencePrefill = aPrefill()) =>
  renderWithProviders(<OccurrenceEntry />, {
    route: '/logs/occurrences/new',
    routeState: { occurrencePrefill: prefill },
    path: '/logs/occurrences/:reportId',
  })

/** Writes a draft straight into storage under this tab's own key. */
const seedDraft = (value: unknown, savedAt = Date.now()) => {
  const tabId = sessionStorage.getItem('wizardDraft:tabId')
  localStorage.setItem(`${DRAFT_KEY_PREFIX}:${tabId}`, JSON.stringify({ savedAt, value }))
}

const draftValues = () => {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(`${DRAFT_KEY_PREFIX}:`)) {
      return JSON.parse(localStorage.getItem(key)!).value as {
        values: Record<string, unknown>
        sourceFlightId: string | null
      }
    }
  }
  return undefined
}

describe('OccurrenceEntry prefilled from a flight log', () => {
  it('carries the flight’s account over as the description', async () => {
    occurrencesApi()

    renderFromFlight()

    expect(await screen.findByRole('textbox', { name: /Description/ })).toHaveValue(
      'Engine ran rough on climb',
    )
  })

  it('carries the aircraft and both airports over', async () => {
    occurrencesApi()

    renderFromFlight()

    expect(await screen.findByRole('combobox', { name: /Aircraft/ })).toHaveTextContent('OH-STL')
    // The airfield autocomplete renders its resolved label, not the bare ident.
    expect(screen.getByRole('combobox', { name: /Departure Airport/ })).toHaveValue(
      'EFNU: EFNU airport',
    )
    expect(screen.getByRole('combobox', { name: /Arrival Airport/ })).toHaveValue(
      'EFHK: EFHK airport',
    )
  })

  it('dates the occurrence from the flight', async () => {
    occurrencesApi()

    renderFromFlight()

    expect(await screen.findByRole('group', { name: /Occurrence Date/ })).toHaveTextContent(
      '01.05.2026 09:00',
    )
  })

  it('leaves the pilot to write the headline and location themselves', async () => {
    occurrencesApi()

    renderFromFlight()

    // Prefilling these from the flight would assert something the flight log never
    // said — where along the route it happened, and what it was.
    expect(await screen.findByRole('textbox', { name: /Headline/ })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: /Location/ })).toHaveValue('')
  })

  it('files the prefilled report through the normal create endpoint', async () => {
    const state = occurrencesApi()

    const { user } = renderFromFlight()
    await screen.findByRole('heading', { name: 'New Report' })

    await user.type(screen.getByRole('textbox', { name: /Headline/ }), 'Rough running on climb')
    await user.type(screen.getByRole('textbox', { name: /Location/ }), 'EFNU circuit')
    await user.click(screen.getByRole('combobox', { name: /Categories/ }))
    await user.click(
      await screen.findByRole('option', { name: 'Powerplant failure or malfunction' }),
    )
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      body: {
        headline: 'Rough running on climb',
        description: 'Engine ran rough on climb',
        aircraftRegistration: 'OH-STL',
        departureAirport: 'EFNU',
        arrivalAirport: 'EFHK',
        occurrenceDate: '2026-05-01T09:00:00.000Z',
      },
    })
  })

  it('goes back to the list, not to a query string built out of the prefill', async () => {
    occurrencesApi()

    const { user } = renderFromFlight()
    await screen.findByRole('heading', { name: 'New Report' })

    // The list page puts its own filters in location.state as a plain search
    // string; a prefill object pasted in there would read '[object Object]'.
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('[object Object]')).toBeNull()
  })
})

describe('OccurrenceEntry drafts', () => {
  it('autosaves the report as it is written', async () => {
    occurrencesApi()

    const { user } = renderNew()
    await screen.findByRole('heading', { name: 'New Report' })

    await user.type(screen.getByRole('textbox', { name: /Headline/ }), 'Rough running')

    await waitFor(() => expect(draftValues()?.values.headline).toBe('Rough running'))
  })

  it('remembers which flight the draft came from', async () => {
    occurrencesApi()

    renderFromFlight()
    await screen.findByRole('heading', { name: 'New Report' })

    await waitFor(() => expect(draftValues()?.sourceFlightId).toBe('fl-1'))
  })

  it('resumes an unfinished report, and says so', async () => {
    occurrencesApi()
    seedDraft({ values: { headline: 'Half-written report' }, sourceFlightId: null })

    renderNew()

    expect(await screen.findByRole('textbox', { name: /Headline/ })).toHaveValue(
      'Half-written report',
    )
    expect(screen.getByText('Resumed your unfinished report.')).toBeInTheDocument()
  })

  it('shows no banner when there was nothing to resume', async () => {
    occurrencesApi()

    renderNew()
    await screen.findByRole('heading', { name: 'New Report' })

    expect(screen.queryByText('Resumed your unfinished report.')).toBeNull()
  })

  it('keeps the pilot’s own edits to this flight’s prefill', async () => {
    occurrencesApi()
    seedDraft({
      values: { headline: 'Rough running', description: 'Engine ran rough, then settled' },
      sourceFlightId: 'fl-1',
    })

    renderFromFlight()

    expect(await screen.findByRole('textbox', { name: /Headline/ })).toHaveValue('Rough running')
    expect(screen.getByRole('textbox', { name: /Description/ })).toHaveValue(
      'Engine ran rough, then settled',
    )
  })

  it('does not let an older flight’s draft overwrite the flight just handed over', async () => {
    occurrencesApi()
    seedDraft({
      values: { headline: 'A different flight entirely', description: 'Bird strike' },
      sourceFlightId: 'fl-earlier',
    })

    renderFromFlight()

    expect(await screen.findByRole('textbox', { name: /Description/ })).toHaveValue(
      'Engine ran rough on climb',
    )
    expect(screen.getByRole('textbox', { name: /Headline/ })).toHaveValue('')
    expect(screen.queryByText('Resumed your unfinished report.')).toBeNull()
  })

  it('lets the resumed draft be thrown away, back to an empty form', async () => {
    occurrencesApi()
    seedDraft({ values: { headline: 'Half-written report' }, sourceFlightId: null })

    const { user } = renderNew()
    await screen.findByRole('textbox', { name: /Headline/ })

    await user.click(screen.getByRole('button', { name: 'Start fresh' }))

    expect(screen.getByRole('textbox', { name: /Headline/ })).toHaveValue('')
    expect(screen.queryByText('Resumed your unfinished report.')).toBeNull()
  })

  it('throws away a draft that came from a flight back to that flight’s own data', async () => {
    occurrencesApi()
    seedDraft({
      values: { headline: 'Rough running', description: 'Edited' },
      sourceFlightId: 'fl-1',
    })

    const { user } = renderFromFlight()
    await screen.findByRole('textbox', { name: /Headline/ })

    await user.click(screen.getByRole('button', { name: 'Start fresh' }))

    expect(screen.getByRole('textbox', { name: /Headline/ })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: /Description/ })).toHaveValue(
      'Engine ran rough on climb',
    )
  })

  it('clears the draft once the report is filed', async () => {
    occurrencesApi()

    const { user } = renderFromFlight()
    await screen.findByRole('heading', { name: 'New Report' })

    await user.type(screen.getByRole('textbox', { name: /Headline/ }), 'Rough running on climb')
    await user.type(screen.getByRole('textbox', { name: /Location/ }), 'EFNU circuit')
    await user.click(screen.getByRole('combobox', { name: /Categories/ }))
    await user.click(
      await screen.findByRole('option', { name: 'Powerplant failure or malfunction' }),
    )
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(draftValues()).toBeUndefined())
  })

  it('keeps no draft for a report that already exists', async () => {
    occurrencesApi(anOccurrence())

    const { user } = renderExisting()
    const headline = await screen.findByRole('textbox', { name: /Headline/ })

    await user.clear(headline)
    await user.type(headline, 'Bird strike on short final')

    expect(draftValues()).toBeUndefined()
  })

  it('leaves another tab’s abandoned draft alone when an existing report is opened', async () => {
    // The draft gate adopts a lone orphan silently, with no banner (#1303 review). Run
    // on every mount it would mean that merely *viewing* someone's existing report
    // claimed a half-written new one left behind elsewhere -- and handed it to the next
    // new report started in this tab, which would then open pre-filled with an
    // unrelated incident. Only the create flow gets to resolve drafts.
    occurrencesApi(anOccurrence())
    const savedAt = Date.now()
    localStorage.setItem(
      `${DRAFT_KEY_PREFIX}:some-other-tab`,
      JSON.stringify({ savedAt, value: { values: { headline: 'Theirs' }, sourceFlightId: null } }),
    )

    renderExisting()
    await screen.findByRole('textbox', { name: /Headline/ })

    // Untouched, and specifically not copied into this tab's own slot.
    const ownKey = `${DRAFT_KEY_PREFIX}:${sessionStorage.getItem('wizardDraft:tabId')}`
    expect(localStorage.getItem(ownKey)).toBeNull()
    expect(localStorage.getItem(`${DRAFT_KEY_PREFIX}:some-other-tab`)).toBe(
      JSON.stringify({ savedAt, value: { values: { headline: 'Theirs' }, sourceFlightId: null } }),
    )
  })
})
