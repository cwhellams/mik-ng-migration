import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { LiquidLockReason } from '@mik/contracts/liquid'
import { aFuelRecord, anOilRecord, theFuelProviders } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import EditLiquidRecord from './EditLiquidRecord'

/**
 * Correcting a record inside its one-week edit window.
 *
 * Narrower than the reporting form (`LiquidReportForm.test.tsx`): the liquid
 * type, aircraft and oil source are fixed, so this only covers what can
 * actually change here — the figures, and the away-from-home provider, which
 * this form has to re-derive on its own rather than inherit from the record
 * (#1119 review finding B13: editing a fuel record's away airport 400'd every
 * time, because this form had no provider field at all).
 */

const render = (recordId = '11111111-1111-4111-8111-111111111111') =>
  renderWithProviders(<EditLiquidRecord />, {
    route: `/liquid/${recordId}/edit`,
    path: '/liquid/:recordId/edit',
  })

let patched: unknown[]

beforeEach(() => {
  patched = []
  server.use(
    http.get(apiUrl('v1/liquid/providers'), () => HttpResponse.json(theFuelProviders())),
    http.get(apiUrl('v1/flight-logs/airfields'), () =>
      HttpResponse.json({
        airfields: [
          { ident: 'EFNU', name: 'Nummela' },
          { ident: 'EEPU', name: 'Pärnu' },
          { ident: 'EFHK', name: 'Helsinki-Vantaa' },
        ],
      }),
    ),
    http.patch(apiUrl('v1/liquid/records/:recordId'), async ({ request, params }) => {
      const body = await request.json()
      patched.push(body)
      return HttpResponse.json(
        aFuelRecord({ recordId: String(params.recordId), ...(body as object) }),
      )
    }),
  )
})

describe('EditLiquidRecord — fuel at the home base', () => {
  beforeEach(() => {
    server.use(
      http.get(apiUrl('v1/liquid/records/:recordId'), () => HttpResponse.json(aFuelRecord())),
    )
  })

  it('never shows a provider field — EFNU derives it from the fuel type', async () => {
    render()
    await screen.findByLabelText(/Quantity/)
    expect(screen.queryByRole('combobox', { name: 'Provider' })).not.toBeInTheDocument()
  })

  it('sends only the field that actually changed', async () => {
    const { user } = render()
    const quantity = await screen.findByLabelText(/Quantity/)
    await user.clear(quantity)
    await user.type(quantity, '175')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(patched).toHaveLength(1))
    expect(patched[0]).toEqual({ quantityLitres: 175 })
  })
})

describe('EditLiquidRecord — fuel away from the home base', () => {
  beforeEach(() => {
    server.use(
      http.get(apiUrl('v1/liquid/records/:recordId'), () =>
        HttpResponse.json(aFuelRecord({ airport: 'EEPU', providerId: 4, totalCost: 100 })),
      ),
    )
  })

  it('shows the provider field, pre-filled with the record’s own provider', async () => {
    render()
    expect(await screen.findByRole('combobox', { name: 'Provider' })).toHaveTextContent('AirBP')
  })

  it('hides the provider field entirely once the airport moves back to the home base', async () => {
    const { user } = render()
    await screen.findByRole('combobox', { name: 'Provider' })

    await user.click(screen.getByRole('combobox', { name: 'Airport' }))
    await user.click(await screen.findByRole('option', { name: /EFNU/ }))

    expect(screen.queryByRole('combobox', { name: 'Provider' })).not.toBeInTheDocument()
  })

  it('drops the stale provider when the airport changes to another away airport, blocking save', async () => {
    // Regression (B13): a providerId carried over from the old airport is not
    // guaranteed to sell at the new one, and the server 400s on a stale value
    // — so a bare airport change must not silently resubmit the old choice.
    const { user } = render()
    await screen.findByRole('combobox', { name: 'Provider' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())

    await user.click(screen.getByRole('combobox', { name: 'Airport' }))
    await user.click(await screen.findByRole('option', { name: /EFHK/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled())
    expect(screen.getByRole('combobox', { name: 'Provider' })).not.toHaveTextContent('AirBP')
  })

  it('sends the newly picked provider, staying at the same away airport', async () => {
    const { user } = render()
    await screen.findByRole('combobox', { name: 'Provider' })

    await user.click(screen.getByRole('combobox', { name: 'Provider' }))
    await user.click(await screen.findByRole('option', { name: 'Kanair' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(patched).toHaveLength(1))
    expect(patched[0]).toEqual({ providerId: 5 })
  })
})

describe('EditLiquidRecord — oil', () => {
  beforeEach(() => {
    server.use(
      http.get(apiUrl('v1/liquid/records/:recordId'), () => HttpResponse.json(anOilRecord())),
    )
  })

  it('offers the remaining-in-canister figure instead of any fuel field', async () => {
    render()
    expect(await screen.findByLabelText(/Remaining in the canister/)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Provider' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Airport' })).not.toBeInTheDocument()
  })
})

describe('EditLiquidRecord — locked record', () => {
  it('disables every field and explains why, rather than failing silently on save', async () => {
    server.use(
      http.get(apiUrl('v1/liquid/records/:recordId'), () =>
        HttpResponse.json(
          aFuelRecord({
            lock: {
              canEdit: false,
              canDelete: false,
              reason: LiquidLockReason.EDIT_WINDOW_EXPIRED,
            },
          }),
        ),
      ),
    )

    render()
    expect(
      await screen.findByText(
        'This record is more than a week old. Ask a liquid administrator to change it.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Quantity/)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
