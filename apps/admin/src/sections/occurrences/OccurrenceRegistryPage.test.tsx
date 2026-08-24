import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import OccurrenceRegistryPage from './OccurrenceRegistryPage'

/** Query strings the count endpoint was asked for, oldest first. */
let countQueries: URLSearchParams[]
/** `download` attribute of every synthetic anchor the page clicked. */
let downloads: string[]

const stubCount = (count: number) => {
  server.use(
    http.get(apiUrl('v1/occurrences/export/count'), ({ request }) => {
      countQueries.push(new URL(request.url).searchParams)
      return HttpResponse.json({ count })
    }),
  )
}

const stubExport = (
  filename = 'occurrence-register_2026-01-01_2026-12-31.pdf',
): URLSearchParams[] => {
  const queries: URLSearchParams[] = []
  server.use(
    http.get(apiUrl('v1/occurrences/export'), ({ request }) => {
      queries.push(new URL(request.url).searchParams)
      return new HttpResponse(new Blob(['%PDF-1.4']), {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${filename}"`,
        },
      })
    }),
  )
  return queries
}

const lastCountQuery = async (): Promise<URLSearchParams> => {
  await waitFor(() => expect(countQueries.length).toBeGreaterThan(0), { timeout: 3000 })
  return countQueries[countQueries.length - 1]
}

beforeEach(() => {
  countQueries = []
  downloads = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('OccurrenceRegistryPage', () => {
  // The register exists for the annual activity report, so opening it on
  // "everything ever reported" would make every use start with two date edits.
  it('opens on the current calendar year, in club local time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-20T09:00:00.000Z'))
    stubCount(3)

    renderWithProviders(<OccurrenceRegistryPage />)

    const query = await lastCountQuery()
    // Helsinki is UTC+2 at both ends of the year.
    expect(query.get('fromDate')).toEqual('2025-12-31T22:00:00.000Z')
    expect(query.get('toDate')).toEqual('2026-12-31T21:59:59.999Z')
    expect(query.get('dtoOnly')).toBeNull()
  })

  it('reports how many occurrences the period covers', async () => {
    stubCount(3)
    renderWithProviders(<OccurrenceRegistryPage />)

    expect(await screen.findByText('3 occurrence reports in this period')).toBeInTheDocument()
  })

  it('refuses to print an empty register', async () => {
    stubCount(0)
    renderWithProviders(<OccurrenceRegistryPage />)

    expect(await screen.findByText('No occurrence reports in this period')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate PDF' })).toBeDisabled()
  })

  it('says so when the count cannot be fetched', async () => {
    server.use(
      http.get(apiUrl('v1/occurrences/export/count'), () => problemResponse(403, 'Forbidden')),
    )
    renderWithProviders(<OccurrenceRegistryPage />)

    expect(
      await screen.findByText('Could not count the reports in this period.'),
    ).toBeInTheDocument()
  })

  // "DTO only" or "everything" — the two choices the issue asks for. The absence
  // of the flag is what means "everything", so it must not be sent as false.
  it('narrows the register to DTO reports when that scope is chosen', async () => {
    stubCount(2)
    const { user } = renderWithProviders(<OccurrenceRegistryPage />)

    await user.click(screen.getByRole('radio', { name: 'DTO training reports only' }))

    await waitFor(async () => expect((await lastCountQuery()).get('dtoOnly')).toEqual('true'), {
      timeout: 3000,
    })

    await user.click(screen.getByRole('radio', { name: 'All occurrence reports' }))

    await waitFor(async () => expect((await lastCountQuery()).get('dtoOnly')).toBeNull(), {
      timeout: 3000,
    })
  })

  it('downloads the PDF under the filename the server chose', async () => {
    stubCount(3)
    const exportQueries = stubExport('occurrence-register_2026-01-01_2026-12-31_dto.pdf')
    const { user } = renderWithProviders(<OccurrenceRegistryPage />)

    await user.click(await screen.findByRole('button', { name: 'Generate PDF' }))

    await waitFor(() =>
      expect(downloads).toEqual(['occurrence-register_2026-01-01_2026-12-31_dto.pdf']),
    )
    // The download is filtered by exactly what the preview counted.
    expect(exportQueries[0].get('fromDate')).toEqual((await lastCountQuery()).get('fromDate'))
  })

  it('surfaces a failed download instead of silently doing nothing', async () => {
    stubCount(3)
    server.use(http.get(apiUrl('v1/occurrences/export'), () => problemResponse(500, 'Boom')))
    const { user } = renderWithProviders(<OccurrenceRegistryPage />)

    await user.click(await screen.findByRole('button', { name: 'Generate PDF' }))

    expect(
      await screen.findByText('Generating the register failed. Please try again.'),
    ).toBeInTheDocument()
    expect(downloads).toEqual([])
  })
})
