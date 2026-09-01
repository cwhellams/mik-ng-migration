import type { TotalFuelUpliftByAcYrMth, TotalOilUpliftByAcYrMth } from '@mik/contracts/stats'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import OilFuelUplift from './OilFuelUplift'

const anOilRow = (overrides: Partial<TotalOilUpliftByAcYrMth> = {}): TotalOilUpliftByAcYrMth => ({
  aircraftRegistration: 'OH-STL',
  yr: 2026,
  mth: 1,
  totalOilUplift: 2,
  ...overrides,
})

const aFuelRow = (overrides: Partial<TotalFuelUpliftByAcYrMth> = {}): TotalFuelUpliftByAcYrMth => ({
  aircraftRegistration: 'OH-STL',
  yr: 2026,
  mth: 1,
  totalFuelUplift: 80,
  ...overrides,
})

describe('OilFuelUplift', () => {
  it('shows separate info buttons for oil and fuel that each explain the calculation', async () => {
    server.use(
      http.get(apiUrl('v1/stats/oil-uplift/year/month'), () => HttpResponse.json([anOilRow()])),
      http.get(apiUrl('v1/stats/fuel-uplift/year/month'), () => HttpResponse.json([aFuelRow()])),
    )

    const { user } = renderWithProviders(<OilFuelUplift />)

    await user.click(await screen.findByRole('button', { name: 'Oil Uplift' }))
    expect(
      within(screen.getByRole('dialog')).getByText(
        /The total oil or fuel recorded as added \("uplifted"\) to each aircraft/,
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(await screen.findByRole('button', { name: 'Fuel Uplift' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows the no-data message for a series with no uplift recorded', async () => {
    server.use(
      http.get(apiUrl('v1/stats/oil-uplift/year/month'), () => HttpResponse.json([])),
      http.get(apiUrl('v1/stats/fuel-uplift/year/month'), () => HttpResponse.json([aFuelRow()])),
    )

    renderWithProviders(<OilFuelUplift />)

    expect(await screen.findByText('No uplift recorded in the last 12 months.')).toBeInTheDocument()
  })
})
