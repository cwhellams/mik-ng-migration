import type { Defect } from '@backend/routes/defects/models'
import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { AIRCRAFT_REGISTRATION } from '../test/fixtures'
import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderHookWithProviders } from '../test/renderWithProviders'
import { useDefects } from './useDefects'

const aDefect = (overrides: Partial<Defect> = {}) =>
  ({
    defectId: '0195c1a0-0000-4000-8000-000000000001',
    aircraftRegistration: AIRCRAFT_REGISTRATION,
    description: 'Nose wheel shimmy',
    status: 'ACTIVE',
    ...overrides,
  }) as Defect

/** Captures the query string each request carried. */
const listDefects = (defects: Defect[] = [aDefect()]) => {
  const searches: string[] = []
  server.use(
    http.get(apiUrl('v1/defects'), ({ request }) => {
      searches.push(new URL(request.url).search)
      return HttpResponse.json(defects)
    }),
  )
  return searches
}

describe('useDefects', () => {
  it('does not fetch without an aircraft registration', async () => {
    const searches = listDefects()

    const { result } = renderHookWithProviders(() => useDefects())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(searches).toHaveLength(0)
    expect(result.current.data).toBeUndefined()
  })

  it('does not fetch for an empty registration either', async () => {
    const searches = listDefects()

    const { result } = renderHookWithProviders(() => useDefects(''))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(searches).toHaveLength(0)
  })

  it('fetches every defect for an aircraft when no page is given', async () => {
    const searches = listDefects()

    const { result } = renderHookWithProviders(() => useDefects(AIRCRAFT_REGISTRATION))

    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(searches).toEqual([`?aircraftRegistration=${AIRCRAFT_REGISTRATION}`])
  })

  it('scopes to a single logbook page when a sequence number is given', async () => {
    const searches = listDefects()

    const { result } = renderHookWithProviders(() => useDefects(AIRCRAFT_REGISTRATION, 4))

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(searches).toEqual([`?aircraftRegistration=${AIRCRAFT_REGISTRATION}&ajlbSeqNo=4`])
  })

  it('returns the defect list unwrapped', async () => {
    listDefects([aDefect(), aDefect({ defectId: 'second', description: 'Landing light out' })])

    const { result } = renderHookWithProviders(() => useDefects(AIRCRAFT_REGISTRATION))

    await waitFor(() => expect(result.current.data).toHaveLength(2))
    expect(result.current.data?.[1].description).toBe('Landing light out')
  })

  it('surfaces a failure as a problem rather than throwing', async () => {
    server.use(http.get(apiUrl('v1/defects'), () => problemResponse(403, 'Forbidden')))

    const { result } = renderHookWithProviders(() => useDefects(AIRCRAFT_REGISTRATION))

    await waitFor(() => expect(result.current.error).toEqual({ status: 403, detail: 'Forbidden' }))
  })
})
