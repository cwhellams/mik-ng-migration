import type { ReservationEfficiencyByYr, SchoolFlightEfficiencyByYr } from '@mik/contracts/stats'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { ReservationEfficiency } from './ReservationEfficiency'

const allFlightsRow: ReservationEfficiencyByYr = {
  yr: new Date().getFullYear(),
  totalFlightMins: 600,
  totalReservedMins: 800,
  efficiencyPct: 75,
}

const schoolFlightsRow: SchoolFlightEfficiencyByYr = {
  yr: new Date().getFullYear(),
  totalBlockMins: 500,
  totalReservedMins: 700,
  efficiencyPct: 71.43,
}

const mockEfficiencyApi = () => {
  server.use(
    http.get(apiUrl('v1/stats/reservation-efficiency/year'), () =>
      HttpResponse.json([allFlightsRow]),
    ),
    http.get(apiUrl('v1/stats/school-flight-efficiency/year'), () =>
      HttpResponse.json([schoolFlightsRow]),
    ),
  )
}

describe('ReservationEfficiency', () => {
  it('the info button explains the "All Flights" figure by default', async () => {
    mockEfficiencyApi()
    const { user } = renderWithProviders(<ReservationEfficiency />)

    await user.click(screen.getByRole('button', { name: 'Reservation Efficiency — All Flights' }))

    expect(
      screen.getByText(/How much of the time members reserve an aircraft for actually gets flown/),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/deliberately uses block time \(gate-to-gate\)/),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))
  })

  it('switches to the School Flights explanation when the toggle is switched', async () => {
    mockEfficiencyApi()
    const { user } = renderWithProviders(<ReservationEfficiency />)

    await user.click(screen.getByRole('button', { name: 'School Flights' }))

    await user.click(
      await screen.findByRole('button', { name: 'Reservation Efficiency — School Flights' }),
    )

    expect(screen.getByText(/deliberately uses block time \(gate-to-gate\)/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reservation Efficiency — All Flights' }),
    ).not.toBeInTheDocument()
  })
})
