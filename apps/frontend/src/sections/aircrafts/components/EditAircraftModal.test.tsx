import { Severity, type Aircraft } from '@mik/contracts/aircrafts'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { anAircraft, AIRCRAFT_REGISTRATION } from '../../../test/fixtures'
import { apiUrl, problemResponse } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { EditAircraftModal, type AircraftEditMode } from './EditAircraftModal'

/**
 * A large hand-rolled form (no react-hook-form) that changes shape by `mode`,
 * and one of the places #1115 §9.5 wants converged onto a schema resolver.
 * These tests pin what each mode edits and what it sends.
 */
const aircraftApi = () => {
  const writes: { method: string; path: string; body: unknown }[] = []

  server.use(
    http.get(apiUrl('v1/aircrafts/fuel-types'), () =>
      HttpResponse.json({
        fuelTypes: [
          { name: '100LL', sortOrder: 1 },
          { name: 'JETA-1', sortOrder: 2 },
        ],
      }),
    ),
    http.post(apiUrl('v1/aircrafts'), async ({ request }) => {
      writes.push({ method: 'POST', path: '', body: await request.json() })
      return HttpResponse.json(anAircraft())
    }),
    http.patch(apiUrl('v1/aircrafts/:registration'), async ({ request, params }) => {
      writes.push({
        method: 'PATCH',
        path: String(params.registration),
        body: await request.json(),
      })
      return HttpResponse.json(anAircraft())
    }),
  )

  return writes
}

const renderModal = (mode: AircraftEditMode, aircraft?: Aircraft) => {
  const onClose = vi.fn()
  const rendered = renderWithProviders(
    <EditAircraftModal mode={mode} aircraft={aircraft} onClose={onClose} />,
  )
  return { ...rendered, onClose }
}

const save = (user: ReturnType<typeof renderWithProviders>['user']) =>
  user.click(screen.getByRole('button', { name: /Save/ }))

describe('EditAircraftModal details mode', () => {
  it('loads the aircraft into the form', async () => {
    aircraftApi()

    renderModal('details', anAircraft())

    expect(await screen.findByRole('textbox', { name: /Registration/ })).toHaveValue(
      AIRCRAFT_REGISTRATION,
    )
    expect(screen.getByRole('textbox', { name: /Display Name/ })).toHaveValue('Diamond DA40')
    expect(screen.getByRole('textbox', { name: /Manufacturer/ })).toHaveValue('Diamond Aircraft')
  })

  it('titles itself for editing rather than adding', async () => {
    aircraftApi()

    renderModal('details', anAircraft())

    expect(await screen.findByText('Edit Aircraft Details')).toBeInTheDocument()
  })

  it('patches the existing aircraft by registration', async () => {
    const writes = aircraftApi()

    const { user } = renderModal('details', anAircraft())

    const displayName = await screen.findByRole('textbox', { name: /Display Name/ })
    await user.clear(displayName)
    await user.type(displayName, 'DA40 NG')
    await save(user)

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      path: AIRCRAFT_REGISTRATION,
      body: { displayName: 'DA40 NG' },
    })
  })

  it('closes once the change is saved', async () => {
    aircraftApi()

    const { user, onClose } = renderModal('details', anAircraft())

    await screen.findByRole('textbox', { name: /Registration/ })
    await save(user)

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('reports a rejected save and stays open', async () => {
    aircraftApi()
    server.use(
      http.patch(apiUrl('v1/aircrafts/:registration'), () =>
        problemResponse(409, 'Registration already in use'),
      ),
    )

    const { user, onClose } = renderModal('details', anAircraft())

    await screen.findByRole('textbox', { name: /Registration/ })
    await save(user)

    expect(await screen.findByText('Registration already in use')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('EditAircraftModal new mode', () => {
  it('starts from a registration prefix rather than an empty field', async () => {
    aircraftApi()

    renderModal('new')

    expect(await screen.findByRole('textbox', { name: /Registration/ })).toHaveValue('OH-')
  })

  it('titles itself for adding', async () => {
    aircraftApi()

    renderModal('new')

    expect(await screen.findByText('Add New Aircraft')).toBeInTheDocument()
  })

  it('sends nothing while required details are missing', async () => {
    // The dialog's paper is the form element, so the browser's own `required`
    // checks block submission before the app's handler runs.
    const writes = aircraftApi()

    const { user } = renderModal('new')

    await screen.findByRole('textbox', { name: /Registration/ })
    await save(user)

    await waitFor(() => expect(writes).toHaveLength(0))
  })

  it.todo(
    // A complete new-aircraft submission needs every one of the form's many
    // required fields, including selects; the details/PATCH path above covers
    // the same save logic and is the common case.
    //
    // Blocked on the form rather than on test effort — this is one of the three
    // that layer native `required` over hand-rolled checks, so it comes with the
    // react-hook-form + zodResolver conversion in #1115 §9, item 5. (#1116
    // phase 7 was dropped.)
    'posts a complete new aircraft',
  )
})

describe('EditAircraftModal maintenance mode', () => {
  it('shows the maintenance fields and not the details ones', async () => {
    aircraftApi()

    renderModal('maintenance', anAircraft())

    expect(await screen.findByText('Maintenance')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Display Name/ })).toBeNull()
  })

  it('patches the maintenance cycle', async () => {
    const writes = aircraftApi()

    const { user } = renderModal('maintenance', anAircraft())

    const cycle = await screen.findByRole('spinbutton', {
      name: /Maintenance Cycle|maintenanceCycle/i,
    })
    await user.clear(cycle)
    await user.type(cycle, '200')
    await save(user)

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toMatchObject({ maintenance: { maintenanceCycle: 200 } })
  })
})

describe('EditAircraftModal notes mode', () => {
  it('shows the notes editor alone', async () => {
    aircraftApi()

    renderModal('notes', anAircraft())

    expect(await screen.findByText('Edit Notes and Alerts')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Display Name/ })).toBeNull()
  })

  it('keeps an existing note', async () => {
    aircraftApi()

    renderModal(
      'notes',
      anAircraft({ notes: [{ text: 'Waiting for annual', severity: Severity.warning }] }),
    )

    expect(await screen.findByDisplayValue('Waiting for annual')).toBeInTheDocument()
  })
})

describe('EditAircraftModal dismissal', () => {
  it('closes without saving on cancel', async () => {
    const writes = aircraftApi()

    const { user, onClose } = renderModal('details', anAircraft())

    await screen.findByRole('textbox', { name: /Registration/ })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(writes).toHaveLength(0)
  })
})
