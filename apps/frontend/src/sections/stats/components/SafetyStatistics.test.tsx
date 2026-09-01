import type { OccurrencesPerHundredHrsByAcYr } from '@mik/contracts/stats'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { SafetyStatistics } from './SafetyStatistics'

const now = new Date().getFullYear()

const row: OccurrencesPerHundredHrsByAcYr = {
  aircraftRegistration: 'OH-STL',
  yr: now,
  occurrenceCount: 2,
  totalFlightMins: 6000,
  occurrencesPer100h: 2,
}

const mockSafetyApi = () => {
  server.use(
    http.get(apiUrl('v1/stats/safety/occurrences-per-100h/aircraft/year'), () =>
      HttpResponse.json([row]),
    ),
  )
}

describe('SafetyStatistics', () => {
  it('the chart info button opens the safety explanation with the chart title', async () => {
    mockSafetyApi()
    const { user } = renderWithProviders(<SafetyStatistics />)

    await user.click(
      await screen.findByRole('button', { name: 'Occurrences per 100 Flight Hours' }),
    )

    expect(screen.getByText(/A safety occurrence rate per aircraft, per year/)).toBeInTheDocument()
    expect(screen.getByText(/no rate is shown at all/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('the table info button opens the same explanation with the table title', async () => {
    mockSafetyApi()
    const { user } = renderWithProviders(<SafetyStatistics />)

    await user.click(
      await screen.findByRole('button', { name: 'Safety Performance — Per Aircraft, Per Year' }),
    )

    expect(
      within(screen.getByRole('dialog')).getByText('Safety Performance — Per Aircraft, Per Year'),
    ).toBeInTheDocument()
  })
})
