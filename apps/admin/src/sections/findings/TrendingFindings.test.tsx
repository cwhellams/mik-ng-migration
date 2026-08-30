import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { aCluster, aFinding, aRelatedFinding } from './findingFixtures'
import { TrendingFindings } from './TrendingFindings'

const trendingUrl = apiUrl('v1/findings/trending')

describe('TrendingFindings', () => {
  it('shows a repeated report as one pattern, with every report in it', async () => {
    // The issue's own example: two remarks about fuel increasing in the right
    // tank, worded differently, on the same aircraft.
    server.use(
      http.get(trendingUrl, () =>
        HttpResponse.json({
          clusters: [
            aCluster({
              latest: aFinding({
                findingId: 'r-2',
                description: 'Right tank fuel quantity increasing',
              }),
              others: [
                aRelatedFinding({
                  findingId: 'r-1',
                  description: 'Fuel appears to be increasing in the right tank',
                }),
              ],
              size: 2,
            }),
          ],
        }),
      ),
    )

    renderWithProviders(<TrendingFindings filters={{}} />)

    expect(await screen.findByText('Right tank fuel quantity increasing')).toBeInTheDocument()
    expect(screen.getByText('Fuel appears to be increasing in the right tank')).toBeInTheDocument()
    expect(screen.getByText('OH-STL')).toBeInTheDocument()
    expect(screen.getByText('2 reports')).toBeInTheDocument()
  })

  it('shows a pattern that spans both kinds', async () => {
    server.use(
      http.get(trendingUrl, () =>
        HttpResponse.json({
          clusters: [
            aCluster({
              latest: aFinding({
                kind: 'DEFECT',
                status: 'ACTIVE',
                description: 'Nose wheel shimmy, now severe',
              }),
              others: [aRelatedFinding({ kind: 'REMARK', description: 'Nose wheel shimmy, mild' })],
            }),
          ],
        }),
      ),
    )

    renderWithProviders(<TrendingFindings filters={{}} />)

    expect(await screen.findByText('Defect')).toBeInTheDocument()
    expect(screen.getByText('Remark')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('says so when nothing has been reported twice', async () => {
    server.use(http.get(trendingUrl, () => HttpResponse.json({ clusters: [] })))

    renderWithProviders(<TrendingFindings filters={{}} />)

    expect(
      await screen.findByText('Nothing has been reported twice in this period.'),
    ).toBeInTheDocument()
  })

  it('passes the aircraft and date window through', async () => {
    const seen = vi.fn()
    server.use(
      http.get(trendingUrl, ({ request }) => {
        seen(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json({ clusters: [] })
      }),
    )

    renderWithProviders(
      <TrendingFindings
        filters={{ aircraftRegistration: 'OH-STL', fromDate: '2026-01-01', toDate: '2026-08-01' }}
      />,
    )

    await waitFor(() =>
      expect(seen).toHaveBeenCalledWith({
        aircraftRegistration: 'OH-STL',
        fromDate: '2026-01-01',
        toDate: '2026-08-01',
      }),
    )
  })

  it('sends no date at all when none is set, so the endpoint applies its own window', async () => {
    // The 12-month default lives in the query module. Sending a copy of it
    // from here would make two places to change it.
    const seen = vi.fn()
    server.use(
      http.get(trendingUrl, ({ request }) => {
        seen(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json({ clusters: [] })
      }),
    )

    renderWithProviders(<TrendingFindings filters={{}} />)

    await waitFor(() => expect(seen).toHaveBeenCalledWith({}))
  })

  it('surfaces a refused request rather than an empty list', async () => {
    server.use(http.get(trendingUrl, () => problemResponse(403, 'Forbidden')))

    renderWithProviders(<TrendingFindings filters={{}} />)

    expect(await screen.findByText('No access')).toBeInTheDocument()
  })
})
