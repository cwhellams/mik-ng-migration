import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { aHit, aSearchResponse } from './findingFixtures'
import FindingsPage from './FindingsPage'

/**
 * The page itself: the filter bar it owns and the two tabs it switches
 * between. What each tab renders is covered by that tab's own suite.
 */

const searchUrl = apiUrl('v1/findings')
const trendingUrl = apiUrl('v1/findings/trending')

/** The last query the search endpoint was called with. */
const searchCalls = vi.fn()
const trendingCalls = vi.fn()

const lastSearch = () => searchCalls.mock.calls.at(-1)?.[0] as Record<string, string>

beforeEach(() => {
  searchCalls.mockClear()
  trendingCalls.mockClear()

  server.use(
    http.get(apiUrl('v1/aircrafts'), () =>
      HttpResponse.json({ aircrafts: [{ registration: 'OH-STL' }, { registration: 'OH-IHQ' }] }),
    ),
    http.get(searchUrl, ({ request }) => {
      searchCalls(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json(aSearchResponse([aHit({ description: 'A remark' })]))
    }),
    http.get(trendingUrl, ({ request }) => {
      trendingCalls(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json({ clusters: [] })
    }),
  )
})

describe('FindingsPage', () => {
  it('opens on the search tab with no filters applied', async () => {
    renderWithProviders(<FindingsPage />)

    expect(await screen.findByText('A remark')).toBeInTheDocument()
    expect(lastSearch()).toEqual({ page: '1', pageSize: '25' })
  })

  it('filters by aircraft, offering the fleet from the aircraft list', async () => {
    const { user } = renderWithProviders(<FindingsPage />)

    await screen.findByText('A remark')
    await user.click(screen.getByRole('combobox', { name: 'Aircraft' }))
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'OH-IHQ' }),
    )

    await waitFor(() => expect(lastSearch().aircraftRegistration).toBe('OH-IHQ'))
  })

  it('filters by kind', async () => {
    const { user } = renderWithProviders(<FindingsPage />)

    await screen.findByText('A remark')
    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Defect' }),
    )

    await waitFor(() => expect(lastSearch().kind).toBe('DEFECT'))
  })

  it('searches the descriptions, trimmed', async () => {
    const { user } = renderWithProviders(<FindingsPage />)

    await screen.findByText('A remark')
    await user.type(screen.getByRole('textbox', { name: 'Search the descriptions' }), '  fuel  ')

    await waitFor(() => expect(lastSearch().q).toBe('fuel'))
  })

  it('leaves the free-text filter out entirely when it is blank', async () => {
    // An empty `q` would reach the contract's `.min(1)` and 400 the search.
    const { user } = renderWithProviders(<FindingsPage />)

    await screen.findByText('A remark')
    await user.type(screen.getByRole('textbox', { name: 'Search the descriptions' }), 'x')
    await waitFor(() => expect(lastSearch().q).toBe('x'))

    await user.clear(screen.getByRole('textbox', { name: 'Search the descriptions' }))

    await waitFor(() => expect(lastSearch()).not.toHaveProperty('q'))
  })

  it('goes back to the first page when a filter changes', async () => {
    // Page 4 of a fleet-wide search is an empty table once the search narrows
    // to one aircraft, and an empty table reads as "no results".
    server.use(
      http.get(searchUrl, ({ request }) => {
        searchCalls(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json(
          aSearchResponse([aHit({ description: 'A remark' })], { total: 80 }),
        )
      }),
    )

    const { user } = renderWithProviders(<FindingsPage />)

    await screen.findByText('A remark')
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(lastSearch().page).toBe('2'))

    await user.click(screen.getByRole('combobox', { name: 'Aircraft' }))
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'OH-STL' }),
    )

    await waitFor(() => expect(lastSearch().page).toBe('1'))
  })

  it('switches to the patterns tab, carrying the aircraft filter over', async () => {
    const { user } = renderWithProviders(<FindingsPage />)

    await screen.findByText('A remark')
    await user.click(screen.getByRole('combobox', { name: 'Aircraft' }))
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'OH-STL' }),
    )
    await user.click(screen.getByRole('tab', { name: 'Patterns' }))

    expect(
      await screen.findByText('Nothing has been reported twice in this period.'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(trendingCalls).toHaveBeenCalledWith({ aircraftRegistration: 'OH-STL' }),
    )
  })

  it('disables the filters the patterns tab does not use', async () => {
    // Trending groups defects and remarks together and does not take a text
    // fragment, so leaving either enabled would offer a filter that changes
    // nothing on screen.
    const { user } = renderWithProviders(<FindingsPage />)

    await screen.findByText('A remark')
    await user.click(screen.getByRole('tab', { name: 'Patterns' }))

    expect(screen.getByRole('textbox', { name: 'Search the descriptions' })).toBeDisabled()
    expect(screen.getByLabelText('Type')).toHaveAttribute('aria-disabled', 'true')
  })
})
