import type { AogDaysByAcYr, AogDaysByAcYrMth } from '@mik/contracts/stats'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { AogStatistics } from './AogStatistics'

const now = new Date()
const currentYear = now.getFullYear()
const currentMonth = now.getMonth() + 1

const monthlyRow: AogDaysByAcYrMth = {
  aircraftRegistration: 'OH-STL',
  yr: currentYear,
  mth: currentMonth,
  maintenanceDays: 2,
  unserviceableDays: 1,
  totalAogDays: 3,
}

const yearlyRow: AogDaysByAcYr = {
  aircraftRegistration: 'OH-STL',
  yr: currentYear,
  maintenanceDays: 2,
  unserviceableDays: 1,
  totalAogDays: 3,
}

const mockAogApi = () => {
  server.use(
    http.get(apiUrl('v1/stats/aog/aircraft/year/month'), () => HttpResponse.json([monthlyRow])),
    http.get(apiUrl('v1/stats/aog/aircraft/year'), () => HttpResponse.json([yearlyRow])),
  )
}

describe('AogStatistics', () => {
  it('the monthly chart info button opens the AOG explanation with the monthly title', async () => {
    mockAogApi()
    const { user } = renderWithProviders(<AogStatistics />)

    await user.click(await screen.findByRole('button', { name: 'AOG Days per Month' }))

    expect(
      screen.getByText(/How many days each aircraft was unavailable to fly/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Hold Item List/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('the YTD table info button opens the same explanation with the YTD title', async () => {
    mockAogApi()
    const { user } = renderWithProviders(<AogStatistics />)

    await user.click(
      await screen.findByRole('button', { name: 'AOG Days — Year to Date & Previous Years' }),
    )

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('AOG Days — Year to Date & Previous Years')).toBeInTheDocument()
    expect(within(dialog).getByText(/"total AOG days" figure/)).toBeInTheDocument()
  })
})
