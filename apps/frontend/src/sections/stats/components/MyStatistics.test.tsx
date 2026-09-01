import type { MyStatistics as MyStatisticsType } from '@mik/contracts/stats'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { MyStatistics } from './MyStatistics'

const myStats: MyStatisticsType = {
  totals: {
    flightCount: 3,
    totalFlightMins: 180,
    totalBlockMins: 210,
    totalLandings: 4,
    uniqueAirports: 2,
  },
  daily: [],
  monthly: [],
}

describe('MyStatistics', () => {
  it('shows an info button that explains the calculation, including the PIC-only caveat', async () => {
    server.use(http.get(apiUrl('v1/stats/my'), () => HttpResponse.json(myStats)))

    const { user } = renderWithProviders(<MyStatistics />)

    await user.click(await screen.findByRole('button', { name: 'My Statistics' }))

    expect(
      screen.getByText(/A personal summary of the flights you have flown as pilot-in-command/),
    ).toBeInTheDocument()
    expect(screen.getByText(/not flights that were billed to your account/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
