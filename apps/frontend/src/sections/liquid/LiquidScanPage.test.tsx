import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { LiquidType, OilSource, QrResolveStatus } from '@mik/contracts/liquid'

import { anAircraft, anOilCanister, aQrCode, theFuelProviders } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import LiquidScanPage from './LiquidScanPage'

/**
 * Where a scanned QR code lands.
 *
 * There is no in-app scanner on purpose — the codes are plain URLs opened by the
 * phone's own camera — so the whole behaviour of this page is "render what the
 * server resolved". That includes the permission split: only the server knows
 * whether the scanner may assign an unused code, so what the page shows for an
 * unassigned one is not a decision it makes.
 */

const render = (code = 'MIK-L-7F3KM') =>
  renderWithProviders(<LiquidScanPage />, {
    route: `/liquid/scan/${code}`,
    path: '/liquid/scan/:code',
  })

const stubResolve = (body: object, status = 200) => {
  server.use(
    http.get(apiUrl('v1/liquid/qr/:code/resolve'), () =>
      HttpResponse.json(body, {
        status,
        headers: status >= 400 ? { 'content-type': 'application/problem+json' } : undefined,
      }),
    ),
  )
}

beforeEach(() => {
  // The reporting form the page renders on a successful scan needs these.
  server.use(
    http.get(apiUrl('v1/aircrafts'), () => HttpResponse.json({ aircrafts: [anAircraft()] })),
    http.get(apiUrl('v1/liquid/providers'), () => HttpResponse.json(theFuelProviders())),
    http.get(apiUrl('v1/flight-logs/airfields'), () =>
      HttpResponse.json({ airfields: [{ ident: 'EFNU', name: 'Nummela' }] }),
    ),
    http.get(apiUrl('v1/liquid/oil-canisters'), () => HttpResponse.json([anOilCanister()])),
    http.get(apiUrl('v1/liquid/qr/targets'), () =>
      HttpResponse.json({ oilCanisters: [], fuelStations: [] }),
    ),
  )
})

describe('LiquidScanPage', () => {
  it('opens the reporting form prefilled from a pump sticker', async () => {
    stubResolve({
      status: QrResolveStatus.ASSIGNED,
      code: 'MIK-L-7F3KM',
      prefill: {
        liquidType: LiquidType.FUEL,
        airport: 'EFNU',
        fuelType: 'JET A-1',
        label: 'EFNU · JET A-1',
      },
    })
    render()

    expect(await screen.findByText('Scanned: EFNU · JET A-1')).toBeInTheDocument()
    expect(screen.getByLabelText('Airport')).toHaveValue('EFNU')
  })

  it('opens the oil form prefilled from a canister sticker', async () => {
    stubResolve({
      status: QrResolveStatus.ASSIGNED,
      code: 'MIK-L-7F3KM',
      prefill: {
        liquidType: LiquidType.OIL,
        aircraftRegistration: 'OH-IHQ',
        oilSource: OilSource.CANISTER,
        oilCanisterId: anOilCanister().canisterId,
        oilCanisterRef: 'MIK A 26/1',
        label: 'OH-IHQ · MIK A 26/1',
      },
    })
    render()

    expect(await screen.findByText('Scanned: OH-IHQ · MIK A 26/1')).toBeInTheDocument()
    expect(await screen.findByRole('combobox', { name: 'Canister' })).toBeInTheDocument()
  })

  it('offers the assignment flow to a liquid admin scanning a blank code', async () => {
    stubResolve({
      status: QrResolveStatus.UNASSIGNED_ASSIGNABLE,
      code: 'MIK-L-7F3KM',
      qr: aQrCode(),
    })
    render()

    expect(await screen.findByText('Assign a QR code')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This cannot be undone. The sticker is on the object, so a code can never be pointed at anything else.',
      ),
    ).toBeInTheDocument()
  })

  it('offers an ordinary member no way to assign a blank code', async () => {
    // "Non-admin users cannot assign unassigned QR codes." The page shows what
    // the server sent, and for a member the server sends no assignment payload.
    stubResolve({ status: QrResolveStatus.UNASSIGNED, code: 'MIK-L-7F3KM' })
    render()

    expect(await screen.findByText('Code not in use yet')).toBeInTheDocument()
    expect(
      screen.getByText('QR code MIK-L-7F3KM has not been assigned to anything yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Assign permanently/ })).not.toBeInTheDocument()
  })

  it('still lets a member report the uplift by hand', async () => {
    // The fuel went in whether or not the sticker was set up.
    stubResolve({ status: QrResolveStatus.UNASSIGNED, code: 'MIK-L-7F3KM' })
    render()

    expect(await screen.findByRole('link', { name: /Report fuel or oil anyway/ })).toHaveAttribute(
      'href',
      '/liquid/new',
    )
  })

  it('reports a code the club never issued', async () => {
    stubResolve({ status: 404, detail: 'That QR code was not issued by the club.' }, 404)
    render('MIK-L-NOPE1')

    expect(await screen.findByText('That QR code was not issued by the club.')).toBeInTheDocument()
  })

  it('reports a sticker whose target has been removed', async () => {
    // A dangling sticker: the binding is permanent, so it cannot be repointed.
    stubResolve(
      {
        status: 410,
        detail: 'This code points at something that no longer exists. Tell a liquid administrator.',
      },
      410,
    )
    render()

    expect(await screen.findByText(/points at something that no longer exists/)).toBeInTheDocument()
  })
})
