import type { AirfieldEfficiencyByYr } from '@mik/contracts/stats'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { AirfieldEfficiency } from './AirfieldEfficiency'

const aRow = (overrides: Partial<AirfieldEfficiencyByYr> = {}): AirfieldEfficiencyByYr => ({
  yr: 2026,
  efnuEfnuMins: 600,
  inboundOutboundMins: 300,
  awayMins: 100,
  totalFlightMins: 1000,
  totalReservedMins: 1200,
  efficiencyPct: 83.33,
  ...overrides,
})

describe('AirfieldEfficiency', () => {
  it('shows an info button that explains the EFNU split and the shared efficiency caveats', async () => {
    server.use(
      http.get(apiUrl('v1/stats/airfield-efficiency/year'), () => HttpResponse.json([aRow()])),
    )

    const { user } = renderWithProviders(<AirfieldEfficiency />)

    await user.click(await screen.findByRole('button', { name: 'Airfield Efficiency' }))

    expect(
      screen.getByText(/flights entirely at EFNU, flights that only touch EFNU on one end/),
    ).toBeInTheDocument()
    expect(screen.getByText(/the figure can exceed 100%/)).toBeInTheDocument()
    expect(screen.getByText(/shows 0%, not "no data"/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
