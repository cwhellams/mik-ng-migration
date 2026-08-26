import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CreateOilCanisterRequest, OilCanister } from '@mik/contracts/liquid'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { anOilCanister } from '../../test/fixtures/liquid'
import OilInventoryAdmin from './OilInventoryAdmin'

/**
 * The oil-canister console: an add form plus an inventory table with inline
 * edits (remaining volume) and row actions (mark empty, delete). Covers the
 * listing, the required-field gate on Add, the create round-trip, the
 * mark-empty and delete actions, and a failed save surfacing the server's
 * detail rather than a generic message.
 */

const aircraftHandler = () =>
  http.get(apiUrl('v1/aircrafts'), () =>
    HttpResponse.json({ aircrafts: [{ registration: 'OH-IHQ' }, { registration: 'OH-STL' }] }),
  )

const oilCanisters = (canisters: OilCanister[] = [anOilCanister()]) => {
  const state = {
    canisters,
    creates: [] as CreateOilCanisterRequest[],
    patches: [] as { id: string; body: Record<string, unknown> }[],
    deletes: [] as string[],
  }

  server.use(
    aircraftHandler(),
    http.get(apiUrl('v1/liquid/oil-canisters'), () => HttpResponse.json(state.canisters)),
    http.post(apiUrl('v1/liquid/oil-canisters'), async ({ request }) => {
      const body = (await request.json()) as CreateOilCanisterRequest
      state.creates.push(body)
      const created = anOilCanister({ canisterId: 'new-canister', ...body })
      state.canisters = [...state.canisters, created]
      return HttpResponse.json(created)
    }),
    http.patch(apiUrl('v1/liquid/oil-canisters/:id'), async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      state.patches.push({ id: String(params.id), body })
      state.canisters = state.canisters.map((c) =>
        c.canisterId === params.id ? { ...c, ...body } : c,
      )
      return HttpResponse.json(state.canisters.find((c) => c.canisterId === params.id))
    }),
    http.delete(apiUrl('v1/liquid/oil-canisters/:id'), ({ params }) => {
      state.deletes.push(String(params.id))
      state.canisters = state.canisters.filter((c) => c.canisterId !== params.id)
      return HttpResponse.json({ ok: true })
    }),
  )

  return state
}

afterEach(() => vi.restoreAllMocks())

describe('OilInventoryAdmin listing', () => {
  it('lists a canister with its make, batch and state', async () => {
    oilCanisters()

    renderWithProviders(<OilInventoryAdmin />)

    expect(await screen.findByText('MIK A 26/1')).toBeInTheDocument()
    expect(screen.getByText('Aeroshell W100')).toBeInTheDocument()
    expect(screen.getByText('B-2026-01')).toBeInTheDocument()
    expect(screen.getByText('Sealed')).toBeInTheDocument()
  })

  it('shows "No QR code" for a canister with none assigned', async () => {
    oilCanisters()

    renderWithProviders(<OilInventoryAdmin />)

    expect(await screen.findByText('No QR code')).toBeInTheDocument()
  })

  it('renders an empty state when the inventory is empty', async () => {
    oilCanisters([])

    renderWithProviders(<OilInventoryAdmin />)

    expect(await screen.findByText('No canisters in inventory.')).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    server.use(
      aircraftHandler(),
      http.get(apiUrl('v1/liquid/oil-canisters'), () => problemResponse(500, 'Database down')),
    )

    renderWithProviders(<OilInventoryAdmin />)

    expect(await screen.findByText('Database down')).toBeInTheDocument()
  })
})

describe('OilInventoryAdmin creating', () => {
  it('disables Add canister until every required field is filled', async () => {
    oilCanisters()

    renderWithProviders(<OilInventoryAdmin />)
    await screen.findByText('MIK A 26/1')

    expect(screen.getByRole('button', { name: 'Add canister' })).toBeDisabled()
  })

  it('creates a canister once every required field is filled', async () => {
    const state = oilCanisters()

    const { user } = renderWithProviders(<OilInventoryAdmin />)
    await screen.findByText('MIK A 26/1')

    await user.type(screen.getByLabelText(/^Make/), 'Phillips 66')
    await user.type(screen.getByLabelText(/^Model \/ viscosity/), 'XC 20W-50')
    await user.type(screen.getByLabelText(/Club canister ID/), 'MIK B 26/2')
    await user.type(screen.getByLabelText(/^Batch number/), 'B-2026-02')
    await user.click(screen.getByLabelText(/^Aircraft/))
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))
    await user.click(screen.getByRole('button', { name: 'Add canister' }))

    await waitFor(() => expect(state.creates).toHaveLength(1))
    expect(state.creates[0]).toMatchObject({
      make: 'Phillips 66',
      modelViscosity: 'XC 20W-50',
      clubCanisterRef: 'MIK B 26/2',
      batchNumber: 'B-2026-02',
      aircraftRegistration: 'OH-STL',
    })
  })

  it('clears the form after a successful create', async () => {
    oilCanisters()

    const { user } = renderWithProviders(<OilInventoryAdmin />)
    await screen.findByText('MIK A 26/1')

    await user.type(screen.getByLabelText(/^Make/), 'Phillips 66')
    await user.type(screen.getByLabelText(/^Model \/ viscosity/), 'XC 20W-50')
    await user.type(screen.getByLabelText(/Club canister ID/), 'MIK B 26/2')
    await user.type(screen.getByLabelText(/^Batch number/), 'B-2026-02')
    await user.click(screen.getByLabelText(/^Aircraft/))
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))
    await user.click(screen.getByRole('button', { name: 'Add canister' }))

    await waitFor(() => expect(screen.getByLabelText(/^Make/)).toHaveValue(''))
  })

  it('shows the server error on a failed create', async () => {
    oilCanisters()
    server.use(
      http.post(apiUrl('v1/liquid/oil-canisters'), () => problemResponse(409, 'Ref already used')),
    )

    const { user } = renderWithProviders(<OilInventoryAdmin />)
    await screen.findByText('MIK A 26/1')

    await user.type(screen.getByLabelText(/^Make/), 'Phillips 66')
    await user.type(screen.getByLabelText(/^Model \/ viscosity/), 'XC 20W-50')
    await user.type(screen.getByLabelText(/Club canister ID/), 'MIK B 26/2')
    await user.type(screen.getByLabelText(/^Batch number/), 'B-2026-02')
    await user.click(screen.getByLabelText(/^Aircraft/))
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))
    await user.click(screen.getByRole('button', { name: 'Add canister' }))

    expect(await screen.findByText('Ref already used')).toBeInTheDocument()
  })
})

describe('OilInventoryAdmin row actions', () => {
  it('marks a canister empty', async () => {
    const state = oilCanisters()

    const { user } = renderWithProviders(<OilInventoryAdmin />)
    await screen.findByText('MIK A 26/1')
    await user.click(screen.getByRole('button', { name: 'The canister is now empty' }))

    await waitFor(() =>
      expect(state.patches).toEqual([
        { id: state.canisters[0].canisterId, body: { isEmpty: true } },
      ]),
    )
  })

  it('asks for confirmation before deleting, and does nothing when declined', async () => {
    const state = oilCanisters()
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)

    const { user } = renderWithProviders(<OilInventoryAdmin />)
    await screen.findByText('MIK A 26/1')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(confirm).toHaveBeenCalled()
    expect(state.deletes).toHaveLength(0)
  })

  it('deletes the canister once confirmed', async () => {
    const state = oilCanisters()
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { user } = renderWithProviders(<OilInventoryAdmin />)
    await screen.findByText('MIK A 26/1')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(state.deletes).toEqual(['44444444-4444-4444-8444-444444444444']))
    await waitFor(() => expect(screen.queryByText('MIK A 26/1')).toBeNull())
  })

  it('shows the conflict detail when a canister with reported oil cannot be deleted', async () => {
    oilCanisters()
    server.use(
      http.delete(apiUrl('v1/liquid/oil-canisters/:id'), () =>
        problemResponse(409, 'Oil has been reported against this canister'),
      ),
    )
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { user } = renderWithProviders(<OilInventoryAdmin />)
    await screen.findByText('MIK A 26/1')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByText('Oil has been reported against this canister'),
    ).toBeInTheDocument()
  })

  it('saves the remaining-litres field only when the value actually changed', async () => {
    const state = oilCanisters()

    const { user } = renderWithProviders(<OilInventoryAdmin />)
    const field = await screen.findByLabelText('MIK A 26/1')

    // Focus and blur without changing anything.
    await user.click(field)
    await user.tab()
    expect(state.patches).toHaveLength(0)

    await user.clear(field)
    await user.type(field, '0.75')
    await user.tab()

    await waitFor(() =>
      expect(state.patches).toEqual([
        { id: state.canisters[0].canisterId, body: { remainingLitres: 0.75 } },
      ]),
    )
  })

  it('toggles empty canisters into view', async () => {
    const emptyCanister = anOilCanister({ isEmpty: true, clubCanisterRef: 'MIK A 26/2' })
    server.use(
      aircraftHandler(),
      http.get(apiUrl('v1/liquid/oil-canisters'), ({ request }) => {
        const includeEmpty = new URL(request.url).searchParams.get('includeEmpty') === 'true'
        return HttpResponse.json(includeEmpty ? [emptyCanister] : [])
      }),
    )

    const { user } = renderWithProviders(<OilInventoryAdmin />)
    await screen.findByText('No canisters in inventory.')

    await user.click(screen.getByLabelText('Show empty canisters'))

    expect(await screen.findByText('MIK A 26/2')).toBeInTheDocument()
  })
})
