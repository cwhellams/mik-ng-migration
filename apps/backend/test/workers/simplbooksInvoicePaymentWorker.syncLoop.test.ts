/**
 * Tests for the invoice payment sweep loop.
 *
 * Separate from simplbooksInvoicePaymentWorker.test.ts because this file
 * module-mocks the invoicing queries, which cannot coexist with that file's
 * real-Postgres assertions. That suite covers the queries and the
 * single-invoice decision against a real database; this one covers the loop
 * around them — which invoices get looked up, and what happens when one fails.
 *
 * Every call passes `runImmediately` in place of the worker's Bottleneck, so
 * the suite doesn't pay the production 1-request-per-second budget for lookups
 * that never leave the process. The limiter itself isn't under test here.
 */

import 'dotenv/config'
import { jest } from '@jest/globals'

jest.unstable_mockModule('../../src/db/invoicing-queries.ts', () => ({
  getUnpaidInvoicesWithSimplbooksRef: jest.fn(),
  markInvoiceAsPaid: jest.fn(),
}))

const { getUnpaidInvoicesWithSimplbooksRef, markInvoiceAsPaid } =
  await import('../../src/db/invoicing-queries.ts')
const { syncInvoicePayments, runImmediately } =
  await import('../../src/workers/simplbooksInvoicePaymentWorker.ts')

const mockGetUnpaid = getUnpaidInvoicesWithSimplbooksRef as jest.MockedFunction<
  typeof getUnpaidInvoicesWithSimplbooksRef
>
const mockMarkPaid = markInvoiceAsPaid as jest.MockedFunction<typeof markInvoiceAsPaid>

const invoice = (id: string) => ({ id, pmt_ref: '99999', total_sum: '100.00' }) as never

const simplbooksInvoice = (paid: string) =>
  ({
    status: 200,
    duration: 0.05,
    data: {
      Invoice: { id: 1, client_id: 1, client_name: 'Test', paid, due: '2024-11-30' },
      Task: [],
    },
  }) as never

describe('syncInvoicePayments', () => {
  let getInvoiceFn: jest.Mock<(id: number) => Promise<never>>

  beforeEach(() => {
    jest.clearAllMocks()
    getInvoiceFn = jest.fn(async () => simplbooksInvoice(''))
  })

  it('does not call SimplBooks when there are no unpaid invoices', async () => {
    mockGetUnpaid.mockResolvedValue([])

    await syncInvoicePayments(getInvoiceFn as never, runImmediately)

    expect(getInvoiceFn).not.toHaveBeenCalled()
    expect(mockMarkPaid).not.toHaveBeenCalled()
  })

  it('marks an invoice paid using the date SimplBooks reports', async () => {
    mockGetUnpaid.mockResolvedValue([invoice('3004')])
    getInvoiceFn.mockResolvedValue(simplbooksInvoice('2024-11-27'))

    await syncInvoicePayments(getInvoiceFn as never, runImmediately)

    // Looked up by the invoice's own id, not by pmt_ref.
    expect(getInvoiceFn).toHaveBeenCalledWith(3004)
    expect(mockMarkPaid).toHaveBeenCalledWith('3004', '2024-11-27')
  })

  it.each([
    ['an empty paid date', ''],
    ['the zero date SimplBooks uses for unpaid', '0000-00-00'],
  ])('leaves the invoice alone for %s', async (_label, paid) => {
    mockGetUnpaid.mockResolvedValue([invoice('3004')])
    getInvoiceFn.mockResolvedValue(simplbooksInvoice(paid))

    await syncInvoicePayments(getInvoiceFn as never, runImmediately)

    expect(mockMarkPaid).not.toHaveBeenCalled()
  })

  it('skips an invoice whose id is not a number, without calling SimplBooks', async () => {
    mockGetUnpaid.mockResolvedValue([invoice('not-a-number')])

    await syncInvoicePayments(getInvoiceFn as never, runImmediately)

    expect(getInvoiceFn).not.toHaveBeenCalled()
    expect(mockMarkPaid).not.toHaveBeenCalled()
  })

  it('keeps checking the remaining invoices after one fails', async () => {
    mockGetUnpaid.mockResolvedValue([invoice('3004'), invoice('3005')])
    getInvoiceFn
      .mockRejectedValueOnce(new Error('SimplBooks 500') as never)
      .mockResolvedValueOnce(simplbooksInvoice('2024-11-27'))

    await syncInvoicePayments(getInvoiceFn as never, runImmediately)

    expect(getInvoiceFn).toHaveBeenCalledTimes(2)
    expect(mockMarkPaid).toHaveBeenCalledWith('3005', '2024-11-27')
  })

  it('swallows a failure of the unpaid-invoice query rather than killing the cron tick', async () => {
    mockGetUnpaid.mockRejectedValue(new Error('database is on fire'))

    await expect(
      syncInvoicePayments(getInvoiceFn as never, runImmediately),
    ).resolves.toBeUndefined()

    expect(getInvoiceFn).not.toHaveBeenCalled()
  })
})
