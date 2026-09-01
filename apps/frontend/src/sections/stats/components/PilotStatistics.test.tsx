import type { PilotStatistics as PilotStatisticsType } from '@mik/contracts/stats'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { PilotStatistics } from './PilotStatistics'

const pilotStats: PilotStatisticsType = {
  uniquePicCount: 5,
  hoursHistogram: [{ binFrom: 0, binTo: 2, pilotCount: 3 }],
  airportsHistogram: [{ binFrom: 0, binTo: 2, pilotCount: 2 }],
}

describe('PilotStatistics', () => {
  it('shows an info button that explains the calculation, including the bin-size caveat', async () => {
    server.use(http.get(apiUrl('v1/stats/pilots'), () => HttpResponse.json(pilotStats)))

    const { user } = renderWithProviders(<PilotStatistics />)

    await user.click(await screen.findByRole('button', { name: 'Pilot Statistics' }))

    expect(
      screen.getByText(/How flight hours and visited airports are distributed/),
    ).toBeInTheDocument()
    expect(screen.getByText(/fixed 2-hour bands/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
