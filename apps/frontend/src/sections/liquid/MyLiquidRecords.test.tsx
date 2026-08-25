import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { LiquidLockReason, LiquidType, type LiquidRecordWithLock } from '@mik/contracts/liquid'

import { aFuelRecord, anOilRecord, aPaidFuelRecord } from '../../test/fixtures'
import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import MyLiquidRecords from './MyLiquidRecords'

/**
 * The member's own liquid records.
 *
 * The behaviour worth asserting here is the lock: whether the row offers edit
 * and delete, and — when it does not — whether it says why. "This is on an
 * expense claim" and "this is more than a week old" are very different things to
 * a member looking at a figure they think is wrong, and the row is where they
 * find out which one applies.
 */

const stubRecords = (records: LiquidRecordWithLock[]) => {
  server.use(
    http.get(apiUrl('v1/liquid/records'), () =>
      HttpResponse.json({ records, total: records.length }),
    ),
  )
}

const stubClaimable = (count = 0, totalCostEur = 0, oldestRecordedAt: string | null = null) => {
  server.use(
    http.get(apiUrl('v1/liquid/records/claimable'), () =>
      HttpResponse.json({ count, totalCostEur, oldestRecordedAt }),
    ),
  )
}

beforeEach(() => {
  stubClaimable()
})

describe('MyLiquidRecords', () => {
  it('lists a fuelling with what it cost per litre', async () => {
    stubRecords([aPaidFuelRecord({ totalCost: 400, quantityLitres: 200 })])
    renderWithProviders(<MyLiquidRecords />)

    expect(await screen.findByText(/JET A-1 · EFHK · AirBP/)).toBeInTheDocument()
    // Two decimals minimum, four maximum — €400 over 200 l is an exact 2,00.
    expect(screen.getByText('2,00 €/l')).toBeInTheDocument()
  })

  it('shows an em dash rather than a price for an EFNU fuelling with no cost', async () => {
    // The club is invoiced directly there, so there is genuinely no litre price
    // — and a 0 would read as free fuel.
    stubRecords([aFuelRecord({ totalCost: null })])
    renderWithProviders(<MyLiquidRecords />)

    await screen.findByText(/JET A-1 · EFNU/)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('offers edit and delete on a record the member still owns', async () => {
    stubRecords([aFuelRecord({ lock: { canEdit: true, canDelete: true } })])
    renderWithProviders(<MyLiquidRecords />)

    await screen.findByText(/JET A-1 · EFNU/)
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it.each([
    [LiquidLockReason.LINKED_TO_EXPENSE_CLAIM, 'attached to an expense claim'],
    [LiquidLockReason.EDIT_WINDOW_EXPIRED, 'more than a week old'],
    [LiquidLockReason.LINKED_TO_VALIDATED_FLIGHT_LOG, 'has been validated'],
  ])('replaces the controls with a locked marker for %s', async (reason, explanation) => {
    stubRecords([aFuelRecord({ lock: { canEdit: false, canDelete: false, reason } })])
    const { user } = renderWithProviders(<MyLiquidRecords />)

    await screen.findByText(/JET A-1 · EFNU/)
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

    // And the reason is reachable, so the member is not left guessing.
    await user.hover(screen.getByText('Locked'))
    expect(await screen.findByText(new RegExp(explanation))).toBeInTheDocument()
  })

  it('marks a claimed record and links to the claim', async () => {
    // "Clearly show whether a fuel record is already linked to a claim."
    stubRecords([
      aPaidFuelRecord({
        expenseClaimId: '77777777-7777-4777-8777-777777777777',
        lock: {
          canEdit: false,
          canDelete: false,
          reason: LiquidLockReason.LINKED_TO_EXPENSE_CLAIM,
        },
      }),
    ])
    renderWithProviders(<MyLiquidRecords />)

    const claimLink = await screen.findByRole('link', { name: /On a claim/ })
    expect(claimLink).toHaveAttribute('href', '/expenses/77777777-7777-4777-8777-777777777777')
  })

  it('links a record to the flight it belongs to', async () => {
    stubRecords([aFuelRecord({ flightLogId: 'mikify' })])
    renderWithProviders(<MyLiquidRecords />)

    expect(await screen.findByRole('link', { name: /mikify/ })).toHaveAttribute(
      'href',
      '/logs/flights/mikify',
    )
  })

  it('says so plainly when the member has reported nothing', async () => {
    stubRecords([])
    renderWithProviders(<MyLiquidRecords />)

    expect(
      await screen.findByText('You have not reported any fuel or oil yet.'),
    ).toBeInTheDocument()
  })

  it('filters to one liquid, and asks the server for it', async () => {
    const requested: string[] = []
    server.use(
      http.get(apiUrl('v1/liquid/records'), ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('liquidType') ?? '')
        return HttpResponse.json({ records: [anOilRecord()], total: 1 })
      }),
    )

    const { user } = renderWithProviders(<MyLiquidRecords />)
    await screen.findByRole('button', { name: 'Oil' })
    await user.click(screen.getByRole('button', { name: 'Oil' }))

    // Filtering server-side rather than in the browser, because the list is
    // paged — a client-side filter would hide rows from a page it never fetched.
    await waitFor(() => expect(requested).toContain(LiquidType.OIL))
  })

  it('prompts the member to claim fuel they paid for themselves', async () => {
    // The dashboard widget's twin: EFNU fuelling is invoiced to the club and
    // carries no cost, so it can never appear here.
    stubRecords([aPaidFuelRecord()])
    stubClaimable(2, 640, '2026-05-01T10:00:00.000Z')
    renderWithProviders(<MyLiquidRecords />)

    expect(
      await screen.findByText(/2 fuel record\(s\) you paid for yourself, worth €640/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Create an expense claim/ })).toHaveAttribute(
      'href',
      '/expenses/new',
    )
  })

  it('shows no claim prompt when there is nothing to claim', async () => {
    stubRecords([aFuelRecord()])
    stubClaimable(0)
    renderWithProviders(<MyLiquidRecords />)

    await screen.findByText(/JET A-1 · EFNU/)
    expect(screen.queryByText(/you paid for yourself/)).not.toBeInTheDocument()
  })

  it('deletes a record and refreshes the list', async () => {
    const deleted: string[] = []
    let remaining = [aFuelRecord()]
    server.use(
      http.get(apiUrl('v1/liquid/records'), () =>
        HttpResponse.json({ records: remaining, total: remaining.length }),
      ),
      http.delete(apiUrl('v1/liquid/records/:recordId'), ({ params }) => {
        deleted.push(String(params.recordId))
        remaining = []
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { user } = renderWithProviders(<MyLiquidRecords />)
    await screen.findByText(/JET A-1 · EFNU/)
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // The confirmation is deliberate: a soft delete is reversible only by an
    // admin, so it is not a click-through.
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleted).toEqual([aFuelRecord().recordId]))
    await waitFor(() =>
      expect(screen.getByText('You have not reported any fuel or oil yet.')).toBeInTheDocument(),
    )
  })

  it('surfaces a server error instead of an empty table', async () => {
    server.use(http.get(apiUrl('v1/liquid/records'), () => problemResponse(403, 'Forbidden')))
    renderWithProviders(<MyLiquidRecords />)

    expect(await screen.findByText('No access')).toBeInTheDocument()
  })
})
