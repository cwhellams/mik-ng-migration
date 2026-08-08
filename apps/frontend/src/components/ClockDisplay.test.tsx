import type { TimeResponse } from '@backend/routes/time/api'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import ClockDisplay from './ClockDisplay'

/** Answers /v1/time as though the server were `skewMs` ahead of the local clock. */
const serverAhead = (skewMs = 0) =>
  server.use(
    http.get(apiUrl('v1/time'), () => {
      const epochMs = Date.now() + skewMs
      return HttpResponse.json<TimeResponse>({
        utcIso: new Date(epochMs).toISOString(),
        epochMs,
      })
    }),
  )

describe('ClockDisplay', () => {
  it('shows placeholders until the server clock is known', () => {
    serverAhead()

    renderWithProviders(<ClockDisplay />)

    expect(screen.getAllByText('--:--').length).toBeGreaterThan(0)
  })

  it('shows a UTC time once synced', async () => {
    serverAhead()

    renderWithProviders(<ClockDisplay />)

    await waitFor(() => expect(screen.queryByText('--:--')).toBeNull())
    expect(screen.getByText('UTC')).toBeInTheDocument()
  })

  it('shows the Helsinki offset alongside UTC', async () => {
    serverAhead()

    renderWithProviders(<ClockDisplay />)

    // The suite pins TZ=Europe/Helsinki, so local and Helsinki agree and the
    // component labels the second row with the offset.
    await waitFor(() => expect(screen.queryByText('--:--')).toBeNull())
    expect(screen.getByText(/^UTC\+[23]$/)).toBeInTheDocument()
  })

  it('labels the row as Helsinki when the device is already in that zone', async () => {
    serverAhead()

    renderWithProviders(<ClockDisplay />)

    expect(await screen.findByText('Helsinki')).toBeInTheDocument()
  })

  it('raises no warning when the device clock agrees with the server', async () => {
    serverAhead(0)

    renderWithProviders(<ClockDisplay />)

    await waitFor(() => expect(screen.queryByText('--:--')).toBeNull())
    expect(
      screen
        .queryAllByTestId('icon')
        .some((icon) => icon.dataset.icon === 'mdi:clock-alert-outline'),
    ).toBe(false)
  })

  it('warns when the device clock is well behind the server', async () => {
    serverAhead(10 * 60_000)

    renderWithProviders(<ClockDisplay />)

    await waitFor(() =>
      expect(
        screen
          .queryAllByTestId('icon')
          .some((icon) => icon.dataset.icon === 'mdi:clock-alert-outline'),
      ).toBe(true),
    )
  })

  it('stays on placeholders when the time endpoint fails', async () => {
    server.use(http.get(apiUrl('v1/time'), () => problemResponse(503, 'Unavailable')))

    renderWithProviders(<ClockDisplay />)

    await waitFor(() => expect(screen.getAllByText('--:--').length).toBeGreaterThan(0))
  })

  it('ticks the selected timezone with a check mark', async () => {
    serverAhead()

    renderWithProviders(<ClockDisplay />, { timezone: 'utc' })

    await waitFor(() => expect(screen.queryByText('--:--')).toBeNull())
    expect(screen.queryAllByTestId('icon').some((icon) => icon.dataset.icon === 'mdi:check')).toBe(
      true,
    )
  })
})
