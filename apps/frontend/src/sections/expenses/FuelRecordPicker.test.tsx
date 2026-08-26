import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LiquidRecordWithLock } from '@mik/contracts/liquid'

import { aFuelRecord, aFuelTax, aPaidFuelRecord } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { FuelRecordPicker } from './FuelRecordPicker'

/**
 * Picking the fuel records a claim is made of.
 *
 * The claim form used to ask the member to retype litres, airport and cost — and
 * the claim was the figure the club paid against, so the two could disagree. This
 * screen has no cost fields at all, and the tests below are about what it offers
 * rather than what it collects.
 */

const stubRecords = (records: LiquidRecordWithLock[], taxes = [aFuelTax()]) => {
  server.use(
    http.get(apiUrl('v1/liquid/records'), () =>
      HttpResponse.json({ records, total: records.length }),
    ),
    http.get(apiUrl('v1/liquid/fuel-tax'), () => HttpResponse.json(taxes)),
  )
}

beforeEach(() => {
  stubRecords([])
})

const rowFor = (text: string) => screen.getByText(text).closest('tr')!

describe('FuelRecordPicker', () => {
  it('lists a fuelling the member paid for, with what it cost', async () => {
    stubRecords([aPaidFuelRecord({ totalCost: 400, quantityLitres: 200 })])
    renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={vi.fn()} />)

    const row = rowFor(await screen.findByText('EFHK').then((el) => el.textContent!))
    expect(within(row).getByText('200 l')).toBeInTheDocument()
    expect(within(row).getByText('400,00 EUR')).toBeInTheDocument()
    expect(within(row).getByText('2,00 €/l')).toBeInTheDocument()
  })

  it('leaves out an EFNU fuelling with no cost — there is nothing to reimburse', async () => {
    // The club is invoiced directly there, so it can never be claimed.
    stubRecords([aFuelRecord({ totalCost: null }), aPaidFuelRecord()])
    renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={vi.fn()} />)

    expect(await screen.findByText('EFHK')).toBeInTheDocument()
    expect(screen.queryByText('EFNU')).not.toBeInTheDocument()
  })

  it('selects a fuelling by ticking it', async () => {
    const onChange = vi.fn()
    stubRecords([aPaidFuelRecord()])
    const { user } = renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={onChange} />)

    await screen.findByText('EFHK')
    await user.click(screen.getByRole('checkbox'))

    expect(onChange).toHaveBeenCalledWith([aPaidFuelRecord().recordId])
  })

  it('deselects one that was already ticked', async () => {
    const onChange = vi.fn()
    const record = aPaidFuelRecord()
    stubRecords([record])
    const { user } = renderWithProviders(
      <FuelRecordPicker selectedIds={[record.recordId]} onChange={onChange} />,
    )

    await screen.findByText('EFHK')
    await user.click(screen.getByRole('checkbox'))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('shows a record already on another claim, but will not let it be picked', async () => {
    // "Clearly show whether a fuel record is already linked to a claim." Hiding
    // it would leave a member hunting for a fuelling they know they reported.
    stubRecords([aPaidFuelRecord({ expenseClaimId: '77777777-7777-4777-8777-777777777777' })])
    renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={vi.fn()} />)

    await screen.findByText('EFHK')
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.getByRole('link', { name: /Already claimed/ })).toHaveAttribute(
      'href',
      '/expenses/77777777-7777-4777-8777-777777777777',
    )
  })

  it('lets the claim being edited pick its own records', async () => {
    const claimId = '77777777-7777-4777-8777-777777777777'
    stubRecords([aPaidFuelRecord({ expenseClaimId: claimId })])
    renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={vi.fn()} claimId={claimId} />)

    await screen.findByText('EFHK')
    expect(screen.getByRole('checkbox')).toBeEnabled()
    expect(screen.queryByText(/Already claimed/)).not.toBeInTheDocument()
  })

  it('warns what the fuel tax will add, so the approved figure is no surprise', async () => {
    stubRecords(
      [
        aPaidFuelRecord({
          recordedAt: '2026-05-01T10:00:00.000Z',
          taxIncludedAbroad: false,
          fuelType: 'JET A-1',
        }),
      ],
      [aFuelTax({ taxYear: 2026, fuelType: 'JET A-1', rateEurPerLitre: 0.25 })],
    )
    renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={vi.fn()} />)

    expect(await screen.findByText('+ €0.2500/l fuel tax')).toBeInTheDocument()
  })

  it('adds nothing to a fuelling that already includes tax', async () => {
    stubRecords(
      [aPaidFuelRecord({ recordedAt: '2026-05-01T10:00:00.000Z', taxIncludedAbroad: true })],
      [aFuelTax({ taxYear: 2026, fuelType: 'JET A-1', rateEurPerLitre: 0.25 })],
    )
    renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={vi.fn()} />)

    await screen.findByText('EFHK')
    expect(screen.queryByText(/fuel tax/)).not.toBeInTheDocument()
    expect(screen.getByText('Tax included')).toBeInTheDocument()
  })

  it('adds nothing when no rate is configured for that year', async () => {
    stubRecords([aPaidFuelRecord({ recordedAt: '2029-05-01T10:00:00.000Z' })], [aFuelTax()])
    renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={vi.fn()} />)

    await screen.findByText('EFHK')
    expect(screen.queryByText(/fuel tax/)).not.toBeInTheDocument()
  })

  it('totals the selection in EUR, converting a foreign purchase', async () => {
    const record = aPaidFuelRecord({ totalCost: 4000, ccy: 'SEK', fxRate: 0.09 })
    stubRecords([record])
    renderWithProviders(<FuelRecordPicker selectedIds={[record.recordId]} onChange={vi.fn()} />)

    expect(await screen.findByText(/1 fuelling\(s\) selected, €360\.00/)).toBeInTheDocument()
  })

  it('sends the member to report a fuelling when there is nothing to pick', async () => {
    stubRecords([])
    renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={vi.fn()} />)

    expect(
      await screen.findByText(
        'You have no fuel records with a cost to claim. Report a fuelling you paid for first.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Report a fuelling/ })).toHaveAttribute(
      'href',
      '/liquid/new',
    )
  })

  it('marks a fuelling that already has a receipt, so it will be added to the claim automatically', async () => {
    stubRecords([aPaidFuelRecord({ attachmentCount: 1 })])
    renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={vi.fn()} />)

    await screen.findByText('EFHK')
    expect(
      screen.getByRole('img', { name: /added to this claim automatically/ }),
    ).toBeInTheDocument()
  })

  it('shows no receipt indicator for a fuelling with no attachment', async () => {
    stubRecords([aPaidFuelRecord({ attachmentCount: 0 })])
    renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={vi.fn()} />)

    await screen.findByText('EFHK')
    expect(
      screen.queryByRole('img', { name: /added to this claim automatically/ }),
    ).not.toBeInTheDocument()
  })

  it('collects no cost of its own — the record is the only source', async () => {
    stubRecords([aPaidFuelRecord()])
    renderWithProviders(<FuelRecordPicker selectedIds={[]} onChange={vi.fn()} />)

    await screen.findByText('EFHK')
    // Not an absence of features: a cost field here is exactly what #1119
    // removed, because a typed figure could disagree with the one reported at
    // the pump.
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(0))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
