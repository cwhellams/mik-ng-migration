import type { CommercialFlightTimeByAcYrMth } from '@mik/contracts/stats'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import CommercialFlightTime from './CommercialFlightTime'

const aRow = (
  overrides: Partial<CommercialFlightTimeByAcYrMth> = {},
): CommercialFlightTimeByAcYrMth => ({
  aircraftRegistration: 'OH-STL',
  yr: 2026,
  mth: 1,
  totalCommercialFlightMins: 120,
  ...overrides,
})

describe('CommercialFlightTime', () => {
  it('shows an info button that explains the calculation', async () => {
    server.use(
      http.get(apiUrl('v1/stats/commercial/flight-time/aircraft/year/month'), () =>
        HttpResponse.json([aRow()]),
      ),
    )

    const { user } = renderWithProviders(<CommercialFlightTime />)

    await user.click(await screen.findByRole('button', { name: 'Commercial Flight Time' }))

    expect(
      screen.getByText(/Flight time logged as commercial \(as opposed to private\) flying/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
