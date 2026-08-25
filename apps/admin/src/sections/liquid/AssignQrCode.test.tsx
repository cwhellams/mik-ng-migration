import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { QrTargetType } from '@mik/contracts/liquid'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { aQrCode } from '../../test/fixtures/liquid'
import { AssignQrCode } from './AssignQrCode'

/**
 * The permanent-assignment screen: a QR sticker is physically on the object,
 * so this is a one-way write with no edit or undo affordance. Tests cover the
 * default (canister) target list, switching to fuel stations, the disabled
 * state until a target is picked, a failed assignment, and the terminal
 * success state.
 */

const targets = {
  oilCanisters: [{ targetId: 'canister-1', label: 'MIK A 26/1' }],
  fuelStations: [{ targetId: 'station-1', label: 'EFNU Polttoainemyynti' }],
}

const setupTargets = (overrides: Partial<typeof targets> = {}) => {
  server.use(
    http.get(apiUrl('v1/liquid/qr/targets'), () => HttpResponse.json({ ...targets, ...overrides })),
  )
}

afterEach(() => vi.restoreAllMocks())

describe('AssignQrCode', () => {
  it('shows the code and defaults to assigning an oil canister', async () => {
    setupTargets()

    const { user } = renderWithProviders(<AssignQrCode qr={aQrCode()} />)

    expect(await screen.findByText('MIK-L-7F3KM')).toBeInTheDocument()
    await user.click(await screen.findByLabelText('Target'))
    expect(await screen.findByRole('option', { name: 'MIK A 26/1' })).toBeInTheDocument()
  })

  it('reports a failed target load instead of a form', async () => {
    server.use(http.get(apiUrl('v1/liquid/qr/targets'), () => problemResponse(500, 'DB down')))

    renderWithProviders(<AssignQrCode qr={aQrCode()} />)

    expect(await screen.findByText('DB down')).toBeInTheDocument()
  })

  it('shows an info banner when there is nothing to assign to', async () => {
    setupTargets({ oilCanisters: [] })

    renderWithProviders(<AssignQrCode qr={aQrCode()} />)

    expect(
      await screen.findByText('Every canister in stock already has a code.'),
    ).toBeInTheDocument()
  })

  it('will not submit before a target is chosen', async () => {
    setupTargets()

    renderWithProviders(<AssignQrCode qr={aQrCode()} />)
    await screen.findByText('MIK-L-7F3KM')

    expect(screen.getByRole('button', { name: 'Assign permanently' })).toBeDisabled()
  })

  it('switches option lists when the target type changes', async () => {
    setupTargets()

    const { user } = renderWithProviders(<AssignQrCode qr={aQrCode()} />)
    await screen.findByText('MIK-L-7F3KM')

    await user.click(screen.getByLabelText('Assign to'))
    await user.click(await screen.findByRole('option', { name: 'Fuel station' }))

    await user.click(await screen.findByLabelText('Target'))
    expect(await screen.findByRole('option', { name: 'EFNU Polttoainemyynti' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'MIK A 26/1' })).toBeNull()
  })

  it('assigns the selected canister and reports success', async () => {
    setupTargets()
    let posted: unknown
    server.use(
      http.post(apiUrl('v1/liquid/qr/:code/assign'), async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json(
          aQrCode({ targetType: QrTargetType.OIL_CANISTER, targetLabel: 'MIK A 26/1' }),
        )
      }),
    )
    const onAssigned = vi.fn()

    const { user } = renderWithProviders(<AssignQrCode qr={aQrCode()} onAssigned={onAssigned} />)
    await user.click(await screen.findByLabelText('Target'))
    await user.click(await screen.findByRole('option', { name: 'MIK A 26/1' }))
    await user.click(screen.getByRole('button', { name: 'Assign permanently' }))

    await waitFor(() =>
      expect(screen.getByText('MIK-L-7F3KM now points at MIK A 26/1.')).toBeInTheDocument(),
    )
    expect(posted).toEqual({ targetType: QrTargetType.OIL_CANISTER, targetId: 'canister-1' })
    expect(onAssigned).toHaveBeenCalledOnce()
    // Permanent once assigned: the form is gone, nothing left to change.
    expect(screen.queryByRole('button', { name: 'Assign permanently' })).toBeNull()
  })

  it('shows the server error and lets the admin try again', async () => {
    setupTargets()
    server.use(
      http.post(apiUrl('v1/liquid/qr/:code/assign'), () =>
        problemResponse(409, 'Already assigned'),
      ),
    )

    const { user } = renderWithProviders(<AssignQrCode qr={aQrCode()} />)
    await user.click(await screen.findByLabelText('Target'))
    await user.click(await screen.findByRole('option', { name: 'MIK A 26/1' }))
    await user.click(screen.getByRole('button', { name: 'Assign permanently' }))

    expect(await screen.findByText('Already assigned')).toBeInTheDocument()
    // Still on the form — nothing was assigned.
    expect(screen.getByRole('button', { name: 'Assign permanently' })).toBeInTheDocument()
  })
})
