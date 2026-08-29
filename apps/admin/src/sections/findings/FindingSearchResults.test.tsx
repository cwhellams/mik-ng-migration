import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { aHit, aRelatedFinding, aSearchResponse } from './findingFixtures'
import { FINDINGS_PAGE_SIZE, FindingSearchResults } from './FindingSearchResults'

const searchUrl = apiUrl('v1/findings')
const relatedUrl = apiUrl('v1/findings/related')

const renderResults = (props: Partial<Parameters<typeof FindingSearchResults>[0]> = {}) =>
  renderWithProviders(
    <FindingSearchResults filters={{}} page={1} onPageChange={() => {}} {...props} />,
  )

describe('FindingSearchResults', () => {
  it('shows a defect and a remark in the same feed', async () => {
    server.use(
      http.get(searchUrl, () =>
        HttpResponse.json(
          aSearchResponse([
            aHit({ findingId: 'r-1', kind: 'REMARK', description: 'Cabin door seal whistles' }),
            aHit({
              findingId: 'd-1',
              kind: 'DEFECT',
              status: 'ACTIVE',
              description: 'Oil seepage around the cowling',
            }),
          ]),
        ),
      ),
    )

    renderResults()

    expect(await screen.findByText('Cabin door seal whistles')).toBeInTheDocument()
    expect(screen.getByText('Oil seepage around the cowling')).toBeInTheDocument()
    expect(screen.getByText('Remark')).toBeInTheDocument()
    expect(screen.getByText('Defect')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('names the aircraft and links the logbook entry to its flight', async () => {
    server.use(
      http.get(searchUrl, () =>
        HttpResponse.json(aSearchResponse([aHit({ ajlbSeqNo: 3, flightId: 'flt-42' })])),
      ),
    )

    renderResults()

    expect(await screen.findByText('OH-STL')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'book 3' })
    expect(link).toHaveAttribute('href', expect.stringContaining('/logs/flights/flt-42'))
  })

  it('links a defect with no flight of its own to its logbook page, highlighted', async () => {
    server.use(
      http.get(searchUrl, () =>
        HttpResponse.json(
          aSearchResponse([
            aHit({ findingId: 'd-7', kind: 'DEFECT', ajlbSeqNo: 3, flightId: null }),
          ]),
        ),
      ),
    )

    renderResults()

    expect(await screen.findByText('OH-STL')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'book 3' })
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('/logs/books/OH-STL/3?highlightDefect=d-7'),
    )
  })

  it('sends the filters and the page as query parameters', async () => {
    // The registry keeps the path free of the query string precisely so these
    // land in `params`, which is what useApi folds into the SWR cache key.
    const seen = vi.fn()
    server.use(
      http.get(searchUrl, ({ request }) => {
        seen(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json(aSearchResponse([]))
      }),
    )

    renderResults({
      filters: { aircraftRegistration: 'OH-STL', kind: 'DEFECT', q: 'fuel' },
      page: 2,
    })

    await waitFor(() =>
      expect(seen).toHaveBeenCalledWith({
        aircraftRegistration: 'OH-STL',
        kind: 'DEFECT',
        q: 'fuel',
        page: '2',
        pageSize: String(FINDINGS_PAGE_SIZE),
      }),
    )
  })

  it('says so when nothing matches', async () => {
    server.use(http.get(searchUrl, () => HttpResponse.json(aSearchResponse([]))))

    renderResults()

    expect(
      await screen.findByText('No defects or remarks match these filters.'),
    ).toBeInTheDocument()
  })

  it('offers the related reports only on a row that has some', async () => {
    server.use(
      http.get(searchUrl, () =>
        HttpResponse.json(
          aSearchResponse([
            aHit({ findingId: 'r-1', description: 'On its own', similarCount: 0 }),
            aHit({ findingId: 'r-2', description: 'Seen before', similarCount: 2 }),
          ]),
        ),
      ),
    )

    renderResults()

    expect(await screen.findByRole('button', { name: '2 similar reports' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '0 similar reports' })).not.toBeInTheDocument()
  })

  it('opens the earlier reports that resemble the row, on request', async () => {
    // The count comes with the search; the reports themselves are fetched only
    // when an admin asks for them (issue #1230, answer 4).
    let relatedRequests = 0
    server.use(
      http.get(searchUrl, () =>
        HttpResponse.json(aSearchResponse([aHit({ findingId: 'r-2', similarCount: 1 })])),
      ),
      http.get(relatedUrl, () => {
        relatedRequests += 1
        return HttpResponse.json({
          findings: [
            aRelatedFinding({ description: 'Fuel rising in the right tank', similarity: 0.42 }),
          ],
        })
      }),
    )

    const { user } = renderResults()

    const button = await screen.findByRole('button', { name: '1 similar report' })
    expect(relatedRequests).toBe(0)

    await user.click(button)

    expect(await screen.findByText('Fuel rising in the right tank')).toBeInTheDocument()
    expect(screen.getByText('42% match')).toBeInTheDocument()
  })

  it('asks for the related reports of the row that was clicked', async () => {
    const seen = vi.fn()
    server.use(
      http.get(searchUrl, () =>
        HttpResponse.json(
          aSearchResponse([
            aHit({ findingId: 'r-1', kind: 'REMARK', description: 'First', similarCount: 1 }),
            aHit({ findingId: 'd-9', kind: 'DEFECT', description: 'Second', similarCount: 1 }),
          ]),
        ),
      ),
      http.get(relatedUrl, ({ request }) => {
        seen(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json({ findings: [] })
      }),
    )

    const { user } = renderResults()

    const secondRow = (await screen.findByText('Second')).closest('.MuiGrid-container')!
    await user.click(within(secondRow as HTMLElement).getByRole('button'))

    await waitFor(() => expect(seen).toHaveBeenCalledWith({ kind: 'DEFECT', findingId: 'd-9' }))
  })

  it('says when a row that promised similar reports turns out to have none', async () => {
    server.use(
      http.get(searchUrl, () => HttpResponse.json(aSearchResponse([aHit({ similarCount: 1 })]))),
      http.get(relatedUrl, () => HttpResponse.json({ findings: [] })),
    )

    const { user } = renderResults()

    await user.click(await screen.findByRole('button', { name: '1 similar report' }))

    expect(
      await screen.findByText('Nothing else on this aircraft resembles this report.'),
    ).toBeInTheDocument()
  })

  it('pages only when there is more than one page', async () => {
    server.use(
      http.get(searchUrl, () =>
        HttpResponse.json(aSearchResponse([aHit()], { total: FINDINGS_PAGE_SIZE })),
      ),
    )

    renderResults()

    await screen.findByText('Fuel increasing in the right tank')
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
  })

  it('walks through the pages', async () => {
    const onPageChange = vi.fn()
    server.use(
      http.get(searchUrl, () =>
        HttpResponse.json(aSearchResponse([aHit()], { total: 60, page: 2 })),
      ),
    )

    const { user } = renderResults({ page: 2, onPageChange })

    expect(await screen.findByText('Page 2 of 3 · 60 findings')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenCalledWith(3)

    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('surfaces a refused search rather than an empty table', async () => {
    server.use(http.get(searchUrl, () => problemResponse(403, 'Forbidden')))

    renderResults()

    expect(await screen.findByText('No access')).toBeInTheDocument()
  })
})
