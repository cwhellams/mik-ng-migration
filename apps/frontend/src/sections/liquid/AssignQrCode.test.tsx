import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { QrTargetType } from '@mik/contracts/liquid'

import { anAssignedQrCode, aQrCode } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { AssignQrCode } from './AssignQrCode'

/**
 * Pointing a printed QR code at something, for good.
 *
 * The behaviour that matters is the warning and the one-way door: the sticker is
 * physically on the object, so a code that is assigned can never be pointed
 * anywhere else. The screen has to say so *before* the click, because there is no
 * undo — only printing a new code.
 */

const assigned: unknown[] = []

beforeEach(() => {
  assigned.length = 0
  server.use(
    http.get(apiUrl('v1/liquid/qr/targets'), () =>
      HttpResponse.json({
        oilCanisters: [
          { targetId: '44444444-4444-4444-8444-444444444444', label: 'MIK A 26/1 · OH-IHQ' },
        ],
        fuelStations: [
          { targetId: '88888888-8888-4888-8888-888888888888', label: 'EFNU Jet A-1 · Lokki' },
        ],
      }),
    ),
    http.post(apiUrl('v1/liquid/qr/:code/assign'), async ({ request, params }) => {
      assigned.push({ code: params.code, body: await request.json() })
      return HttpResponse.json(anAssignedQrCode())
    }),
  )
})

describe('AssignQrCode', () => {
  it('warns that the binding cannot be undone', async () => {
    renderWithProviders(<AssignQrCode qr={aQrCode()} />)

    expect(
      await screen.findByText(
        'This cannot be undone. The sticker is on the object, so a code can never be pointed at anything else.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the code being assigned, so the admin can check it against the sticker', async () => {
    renderWithProviders(<AssignQrCode qr={aQrCode({ code: 'MIK-L-7F3KM' })} />)
    expect(await screen.findByText('MIK-L-7F3KM')).toBeInTheDocument()
  })

  it('will not assign until a target is chosen', async () => {
    renderWithProviders(<AssignQrCode qr={aQrCode()} />)
    expect(await screen.findByRole('button', { name: /Assign permanently/ })).toBeDisabled()
  })

  it('assigns to an oil canister', async () => {
    const onAssigned = vi.fn()
    const { user } = renderWithProviders(
      <AssignQrCode qr={aQrCode({ code: 'MIK-L-7F3KM' })} onAssigned={onAssigned} />,
    )

    await user.click(await screen.findByRole('combobox', { name: 'Target' }))
    await user.click(await screen.findByRole('option', { name: /MIK A 26\/1/ }))
    await user.click(screen.getByRole('button', { name: /Assign permanently/ }))

    await waitFor(() => expect(assigned).toHaveLength(1))
    expect(assigned[0]).toEqual({
      code: 'MIK-L-7F3KM',
      body: {
        targetType: QrTargetType.OIL_CANISTER,
        targetId: '44444444-4444-4444-8444-444444444444',
      },
    })
    expect(onAssigned).toHaveBeenCalled()
  })

  it('assigns to a fuel station, and offers the pumps rather than the canisters', async () => {
    const { user } = renderWithProviders(<AssignQrCode qr={aQrCode()} />)

    await user.click(await screen.findByRole('combobox', { name: 'Assign to' }))
    await user.click(await screen.findByRole('option', { name: 'Fuel station' }))
    await user.click(screen.getByRole('combobox', { name: 'Target' }))

    expect(await screen.findByRole('option', { name: /EFNU Jet A-1/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /MIK A 26\/1/ })).not.toBeInTheDocument()
  })

  it('clears the selection when the target type changes', async () => {
    // The old choice belongs to the other list, so carrying it over would let a
    // canister id be submitted as a fuel station.
    const { user } = renderWithProviders(<AssignQrCode qr={aQrCode()} />)

    await user.click(await screen.findByRole('combobox', { name: 'Target' }))
    await user.click(await screen.findByRole('option', { name: /MIK A 26\/1/ }))
    expect(screen.getByRole('button', { name: /Assign permanently/ })).toBeEnabled()

    await user.click(screen.getByRole('combobox', { name: 'Assign to' }))
    await user.click(await screen.findByRole('option', { name: 'Fuel station' }))

    expect(screen.getByRole('button', { name: /Assign permanently/ })).toBeDisabled()
  })

  it('confirms what the code now points at', async () => {
    const { user } = renderWithProviders(<AssignQrCode qr={aQrCode({ code: 'MIK-L-7F3KM' })} />)

    await user.click(await screen.findByRole('combobox', { name: 'Target' }))
    await user.click(await screen.findByRole('option', { name: /MIK A 26\/1/ }))
    await user.click(screen.getByRole('button', { name: /Assign permanently/ }))

    expect(await screen.findByText('MIK-L-7F3KM now points at MIK A 26/1.')).toBeInTheDocument()
    // And the form is gone: there is nothing left to do to this code, ever.
    expect(screen.queryByRole('button', { name: /Assign permanently/ })).not.toBeInTheDocument()
  })

  it('surfaces the server’s refusal rather than appearing to succeed', async () => {
    server.use(
      http.post(apiUrl('v1/liquid/qr/:code/assign'), () =>
        HttpResponse.json(
          { status: 409, detail: 'MIK-L-7F3KM is already assigned to MIK A 26/1.' },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    )

    const { user } = renderWithProviders(<AssignQrCode qr={aQrCode()} />)
    await user.click(await screen.findByRole('combobox', { name: 'Target' }))
    await user.click(await screen.findByRole('option', { name: /MIK A 26\/1/ }))
    await user.click(screen.getByRole('button', { name: /Assign permanently/ }))

    expect(
      await screen.findByText('MIK-L-7F3KM is already assigned to MIK A 26/1.'),
    ).toBeInTheDocument()
  })

  it('says so when every canister already has a code', async () => {
    server.use(
      http.get(apiUrl('v1/liquid/qr/targets'), () =>
        HttpResponse.json({ oilCanisters: [], fuelStations: [] }),
      ),
    )
    renderWithProviders(<AssignQrCode qr={aQrCode()} />)

    expect(
      await screen.findByText('Every canister in stock already has a code.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Assign permanently/ })).toBeDisabled()
  })
})
