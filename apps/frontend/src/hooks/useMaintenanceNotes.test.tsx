import type { MaintenanceNote } from '@mik/contracts/maintenance-notes'
import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { AIRCRAFT_REGISTRATION } from '../test/fixtures'
import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderHookWithProviders } from '../test/renderWithProviders'
import { useMaintenanceNotes } from './useMaintenanceNotes'

const aNote = (overrides: Partial<MaintenanceNote> = {}) =>
  ({
    noteId: '0195c1a0-0000-4000-8000-000000000010',
    aircraftRegistration: AIRCRAFT_REGISTRATION,
    note: 'Oil topped up 0.5 l',
    ...overrides,
  }) as MaintenanceNote

const listNotes = (notes: MaintenanceNote[] = [aNote()]) => {
  const searches: string[] = []
  server.use(
    http.get(apiUrl('v1/maintenance-notes'), ({ request }) => {
      searches.push(new URL(request.url).search)
      return HttpResponse.json(notes)
    }),
  )
  return searches
}

describe('useMaintenanceNotes', () => {
  it('does not fetch without an aircraft registration', async () => {
    const searches = listNotes()

    const { result } = renderHookWithProviders(() => useMaintenanceNotes())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(searches).toHaveLength(0)
  })

  it('fetches every note for an aircraft when no page is given', async () => {
    const searches = listNotes()

    const { result } = renderHookWithProviders(() => useMaintenanceNotes(AIRCRAFT_REGISTRATION))

    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(searches).toEqual([`?aircraftRegistration=${AIRCRAFT_REGISTRATION}`])
  })

  it('scopes to a single logbook page when a sequence number is given', async () => {
    const searches = listNotes()

    const { result } = renderHookWithProviders(() => useMaintenanceNotes(AIRCRAFT_REGISTRATION, 4))

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(searches).toEqual([`?aircraftRegistration=${AIRCRAFT_REGISTRATION}&ajlbSeqNo=4`])
  })

  it('surfaces a failure as a problem', async () => {
    server.use(http.get(apiUrl('v1/maintenance-notes'), () => problemResponse(500, 'Broken')))

    const { result } = renderHookWithProviders(() => useMaintenanceNotes(AIRCRAFT_REGISTRATION))

    await waitFor(() => expect(result.current.error).toEqual({ status: 500, detail: 'Broken' }))
  })
})
