import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LiquidRecordListResponse, LiquidRecordWithLock } from '@mik/contracts/liquid'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { aFuelRecord, aPaidFuelRecord, anOilRecord } from '../../test/fixtures/liquid'
import LiquidRecordsAdmin from './LiquidRecordsAdmin'

/**
 * The liquid admin's view of every member's records — the one screen that can
 * see past the member's one-week edit window and soft-deleted rows. Covers the
 * list, empty and error states, the delete affordance (which is per-row from
 * `lock.canDelete`, not a blanket admin power), and that a claim-linked row has
 * no delete control at all.
 */

const aircraftHandler = () =>
  http.get(apiUrl('v1/aircrafts'), () => HttpResponse.json({ aircrafts: [] }))

const liquidRecords = (records: LiquidRecordWithLock[] = [aPaidFuelRecord()], total?: number) => {
  const state = {
    records,
    deletes: [] as string[],
  }

  server.use(
    aircraftHandler(),
    http.get(apiUrl('v1/liquid/records'), () =>
      HttpResponse.json({
        records: state.records,
        total: total ?? state.records.length,
      } satisfies LiquidRecordListResponse),
    ),
    http.delete(apiUrl('v1/liquid/records/:id'), ({ params }) => {
      state.deletes.push(String(params.id))
      state.records = state.records.filter((r) => r.recordId !== params.id)
      return HttpResponse.json({ ok: true })
    }),
  )

  return state
}

afterEach(() => vi.restoreAllMocks())

describe('LiquidRecordsAdmin listing', () => {
  it('lists a record with its member, aircraft and cost', async () => {
    liquidRecords([aPaidFuelRecord()])

    renderWithProviders(<LiquidRecordsAdmin />)

    expect(await screen.findByText('Matti1')).toBeInTheDocument()
    expect(screen.getByText('OH-STL')).toBeInTheDocument()
    expect(screen.getByText('JET A-1 · EFHK · AirBP · 200 l · 400,00 EUR')).toBeInTheDocument()
  })

  it('shows an em dash for a fuelling with no cost', async () => {
    liquidRecords([aFuelRecord()])

    renderWithProviders(<LiquidRecordsAdmin />)

    await screen.findByText('OH-STL')
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders an empty state when nothing matches', async () => {
    liquidRecords([], 0)

    renderWithProviders(<LiquidRecordsAdmin />)

    expect(await screen.findByText('No records match.')).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    server.use(
      aircraftHandler(),
      http.get(apiUrl('v1/liquid/records'), () => problemResponse(500, 'Database down')),
    )

    renderWithProviders(<LiquidRecordsAdmin />)

    expect(await screen.findByText('Database down')).toBeInTheDocument()
  })

  it('marks a soft-deleted row and shows who deleted it', async () => {
    liquidRecords([aFuelRecord({ deletedAt: '2026-01-02T00:00:00.000Z', deletedBy: 'k1mnimda' })])

    renderWithProviders(<LiquidRecordsAdmin />)

    expect(await screen.findByText('Deleted by k1mnimda')).toBeInTheDocument()
  })

  it('shows a claim-linked chip and no delete control for a locked record', async () => {
    liquidRecords([
      aPaidFuelRecord({ expenseClaimId: 'claim-1', lock: { canEdit: false, canDelete: false } }),
    ])

    renderWithProviders(<LiquidRecordsAdmin />)

    await screen.findByText('On a claim')
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('links a flight-validated record to the member app', async () => {
    liquidRecords([aFuelRecord({ flightLogId: 'MIK00042' })])

    renderWithProviders(<LiquidRecordsAdmin />)

    const link = await screen.findByText('MIK00042')
    expect(link.closest('a')).toHaveAttribute(
      'href',
      expect.stringContaining('/logs/flights/MIK00042'),
    )
  })

  it('describes an oil record by canister rather than airport', async () => {
    liquidRecords([anOilRecord()])

    renderWithProviders(<LiquidRecordsAdmin />)

    expect(await screen.findByText('MIK A 26/1 · Aeroshell · W100 · 0,5 l')).toBeInTheDocument()
  })
})

describe('LiquidRecordsAdmin deleting', () => {
  it('asks for confirmation before deleting', async () => {
    const state = liquidRecords([aFuelRecord()])
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)

    const { user } = renderWithProviders(<LiquidRecordsAdmin />)
    await screen.findByText('OH-STL')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(confirm).toHaveBeenCalled()
    expect(state.deletes).toHaveLength(0)
  })

  it('deletes the record and refreshes the list once confirmed', async () => {
    const state = liquidRecords([aFuelRecord()])
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { user } = renderWithProviders(<LiquidRecordsAdmin />)
    await screen.findByText('OH-STL')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(state.deletes).toEqual(['11111111-1111-4111-8111-111111111111']))
    await waitFor(() => expect(screen.queryByText('OH-STL')).toBeNull())
    expect(screen.getByText('No records match.')).toBeInTheDocument()
  })
})

describe('LiquidRecordsAdmin filtering', () => {
  it('re-fetches with the member id filter', async () => {
    liquidRecords([aFuelRecord()])
    let lastMemberFilter: string | null = null
    server.use(
      aircraftHandler(),
      http.get(apiUrl('v1/liquid/records'), ({ request }) => {
        lastMemberFilter = new URL(request.url).searchParams.get('memberId')
        return HttpResponse.json({ records: [], total: 0 })
      }),
    )

    const { user } = renderWithProviders(<LiquidRecordsAdmin />)
    await user.type(screen.getByLabelText('Member'), 'Matti1')

    await waitFor(() => expect(lastMemberFilter).toBe('Matti1'))
  })
})
