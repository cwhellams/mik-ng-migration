import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { INSTRUCTOR_MEMBER_ID } from '@mik/ui/test/fixtures/cast'
import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { FlightLogExportDialog } from './FlightLogExportDialog'

/** Query strings the dialog asked the count endpoint for, in request order. */
let countQueries: string[]
/** Query strings the dialog asked the download endpoint for. */
let exportQueries: string[]

const memberFilter = { memberId: INSTRUCTOR_MEMBER_ID, label: 'Jukka Nieminen' }

beforeEach(() => {
  countQueries = []
  exportQueries = []
  server.use(
    http.get(apiUrl('v1/flight-logs/export/count'), ({ request }) => {
      countQueries.push(new URL(request.url).search)
      return HttpResponse.json({ count: 7 })
    }),
    http.get(apiUrl('v1/flight-logs/export'), ({ request }) => {
      exportQueries.push(new URL(request.url).search)
      return HttpResponse.text('date,aircraft\n')
    }),
  )
})

/** The debounce is 500ms, so every assertion about a request has to outlast it. */
const untilRequested = (queries: string[]) =>
  waitFor(() => expect(queries.length).toBeGreaterThan(0), { timeout: 3000 })

/**
 * #1249: the dialog sent only the date range and the aircraft, so an admin looking at one
 * member's filtered log and pressing Export got the whole club's flights back — the same
 * "whose flights am I looking at?" confusion the list heading now answers.
 */
describe('FlightLogExportDialog member scope', () => {
  it('carries the member filter into the count request', async () => {
    renderWithProviders(
      <FlightLogExportDialog open onClose={vi.fn()} memberFilter={memberFilter} />,
    )

    await untilRequested(countQueries)
    expect(countQueries[0]).toContain(`onBoardMemberId=${memberFilter.memberId}`)
  })

  it('says on the dialog whose flights are being exported', async () => {
    renderWithProviders(
      <FlightLogExportDialog open onClose={vi.fn()} memberFilter={memberFilter} />,
    )

    expect(
      await screen.findByText('Exporting the flights of Jukka Nieminen only.'),
    ).toBeInTheDocument()
  })

  it('carries it into the download too, not just the preview count', async () => {
    // The count and the file are two separate requests; scoping only the first would show
    // an honest number and then hand over a file that does not match it.
    // Assigned onto the real URL rather than stubbed over it: jsdom implements neither
    // method, and replacing the whole global breaks the `new URL(...)` the MSW handlers
    // above parse each request with.
    Object.assign(URL, { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const { user } = renderWithProviders(
      <FlightLogExportDialog open onClose={vi.fn()} memberFilter={memberFilter} />,
    )

    await untilRequested(countQueries)
    await user.click(screen.getByRole('button', { name: 'Export' }))

    await untilRequested(exportQueries)
    expect(exportQueries[0]).toContain(`onBoardMemberId=${memberFilter.memberId}`)
  })

  it('asks for nobody in particular on an unfiltered list', async () => {
    renderWithProviders(<FlightLogExportDialog open onClose={vi.fn()} />)

    await untilRequested(countQueries)
    expect(countQueries[0]).not.toContain('onBoardMemberId')
    expect(screen.queryByText(/Exporting the flights of/)).not.toBeInTheDocument()
  })
})
