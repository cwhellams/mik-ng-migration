import type { TotalFlightTimeByAcYrMth } from '@mik/contracts/stats'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { YearOnYearReport } from './YearOnYearReport'

const aRow = (overrides: Partial<TotalFlightTimeByAcYrMth> = {}): TotalFlightTimeByAcYrMth => ({
  aircraftRegistration: 'OH-STL',
  flightType: 'PRIVATE',
  yr: 2026,
  mth: 1,
  totalFlightMins: 60,
  totalNfMins: 0,
  totalIfrMins: 0,
  ...overrides,
})

describe('YearOnYearReport', () => {
  it('shows an info button that explains the calculation behind the flight-time figures', async () => {
    server.use(
      http.get(apiUrl('v1/stats/flight-time/aircraft/year/month'), () =>
        HttpResponse.json([aRow()]),
      ),
    )

    const { user } = renderWithProviders(<YearOnYearReport />)

    await user.click(await screen.findByRole('button', { name: 'Year on Year Flight Time' }))

    expect(screen.getByText(/The total flight time logged for each aircraft/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
