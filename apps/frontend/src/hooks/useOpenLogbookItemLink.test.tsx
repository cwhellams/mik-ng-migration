import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AIRCRAFT_REGISTRATION } from '../test/fixtures'
import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import { useOpenLogbookItemLink } from './useOpenLogbookItemLink'

/**
 * The hook navigates, so it is exercised through a route tree: click the opener,
 * then read back where the router landed.
 */
const Opener = ({ highlightParam = 'defect' }: { highlightParam?: string }) => {
  const open = useOpenLogbookItemLink(AIRCRAFT_REGISTRATION, highlightParam)
  return (
    <button onClick={() => open({ ajlbSeqNo: 4, flightMins: 285_000 }, 'defect-7')}>open</button>
  )
}

const Landing = () => {
  const { pathname, search } = useLocation()
  return <span>landed {pathname + search}</span>
}

const renderOpener = (highlightParam?: string) =>
  renderWithProviders(
    <Routes>
      <Route path='/' element={<Opener highlightParam={highlightParam} />} />
      <Route path='/logs/books/:registration/:seq' element={<Landing />} />
    </Routes>,
  )

describe('useOpenLogbookItemLink', () => {
  it('navigates to the page that actually contains the item', async () => {
    server.use(
      http.get(apiUrl('v1/flight-logs/page-for-mins'), () => HttpResponse.json({ page: 12 })),
    )

    const { user } = renderOpener()
    await user.click(screen.getByRole('button', { name: 'open' }))

    expect(await screen.findByText(/^landed/)).toHaveTextContent(
      `landed /logs/books/${AIRCRAFT_REGISTRATION}/4?page=12&defect=defect-7`,
    )
  })

  it('asks the API for the page using the aircraft, book and flight minutes', async () => {
    const searches: string[] = []
    server.use(
      http.get(apiUrl('v1/flight-logs/page-for-mins'), ({ request }) => {
        searches.push(new URL(request.url).search)
        return HttpResponse.json({ page: 12 })
      }),
    )

    const { user } = renderOpener()
    await user.click(screen.getByRole('button', { name: 'open' }))

    await screen.findByText(/^landed/)
    expect(searches).toEqual([
      `?aircraftRegistration=${AIRCRAFT_REGISTRATION}&ajlbSeqNo=4&flightMins=285000`,
    ])
  })

  it('omits the page and lands on the default one when the API cannot place the item', async () => {
    server.use(
      http.get(apiUrl('v1/flight-logs/page-for-mins'), () =>
        HttpResponse.json({ page: undefined }),
      ),
    )

    const { user } = renderOpener()
    await user.click(screen.getByRole('button', { name: 'open' }))

    expect(await screen.findByText(/^landed/)).toHaveTextContent(
      `landed /logs/books/${AIRCRAFT_REGISTRATION}/4?defect=defect-7`,
    )
  })

  it('still navigates when the page lookup fails outright', async () => {
    server.use(http.get(apiUrl('v1/flight-logs/page-for-mins'), () => problemResponse(500, 'Down')))

    const { user } = renderOpener()
    await user.click(screen.getByRole('button', { name: 'open' }))

    // A failed lookup must not strand the user — it falls back to the last page.
    expect(await screen.findByText(/^landed/)).toHaveTextContent(
      `landed /logs/books/${AIRCRAFT_REGISTRATION}/4?defect=defect-7`,
    )
  })

  it('uses the highlight parameter it was created with', async () => {
    server.use(
      http.get(apiUrl('v1/flight-logs/page-for-mins'), () => HttpResponse.json({ page: 3 })),
    )

    const { user } = renderOpener('note')
    await user.click(screen.getByRole('button', { name: 'open' }))

    expect(await screen.findByText(/^landed/)).toHaveTextContent(
      `landed /logs/books/${AIRCRAFT_REGISTRATION}/4?page=3&note=defect-7`,
    )
  })
})
