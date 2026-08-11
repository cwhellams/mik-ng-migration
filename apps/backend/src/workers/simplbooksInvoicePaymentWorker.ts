import 'dotenv/config'

import Bottleneck from 'bottleneck'
import { getUnpaidInvoicesWithSimplbooksRef, markInvoiceAsPaid } from '../db/invoicing-queries.ts'
import { getInvoice } from '../services/simplbooks/simplbooksApiClient.ts'
import logger from '../lib/logger.ts'
import type { Invoice } from '../routes/invoicing/models.ts'
import type { InvoiceResponse } from '../services/simplbooks/models.ts'
import { defineWorker, type CronWorkerDeps } from './defineWorker.ts'

// Rate limiter to ensure max 1 request per second to Simplbooks API
const limiter = new Bottleneck({
  minTime: 1000, // Minimum 1000ms (1 second) between requests
  maxConcurrent: 1, // Only 1 concurrent request at a time
})

/**
 * How a single SimplBooks lookup is queued. In production this is the
 * `Bottleneck` above; tests pass `runImmediately` so a suite that stubs
 * `getInvoiceFn` doesn't also pay a second of real wall clock per invoice.
 */
export type ScheduleFn = <T>(task: () => Promise<T>) => Promise<T>

const rateLimited: ScheduleFn = (task) => limiter.schedule(task)

/** A `ScheduleFn` that bypasses the rate limiter. For tests only. */
export const runImmediately: ScheduleFn = (task) => task()

export interface SimplbooksInvoicePaymentWorkerDeps extends CronWorkerDeps {
  getInvoice?: (id: number) => Promise<InvoiceResponse>
}

/**
 * Start the Simplbooks invoice payment sync worker
 * Runs daily at 4am to check unpaid invoices and sync their payment status
 */
export const startSimplbooksInvoicePaymentWorker = defineWorker<SimplbooksInvoicePaymentWorkerDeps>(
  {
    name: 'Simplbooks Invoice Payment Worker',
    envPrefix: 'SIMPLBOOKS_INVOICE_PAYMENT_WORKER',
    // '0 4 * * *' = At 4:00 AM every day
    schedule: '0 4 * * *',
    scheduleDescription: 'daily at 04:00',
    runOnStartup: true,
    run: ({ getInvoice: getInvoiceFn = getInvoice }) => syncInvoicePayments(getInvoiceFn),
  },
)

/**
 * Sync payment status for all unpaid invoices with Simplbooks.
 *
 * Exported so tests can drive the real loop rather than re-implementing it —
 * `getInvoiceFn` and `schedule` are parameters precisely so a test can pass a
 * stub and skip the rate limiter.
 */
export async function syncInvoicePayments(
  getInvoiceFn: (id: number) => Promise<InvoiceResponse>,
  schedule: ScheduleFn = rateLimited,
): Promise<void> {
  try {
    logger.info('Fetching unpaid invoices from database')
    const unpaidInvoices = await getUnpaidInvoicesWithSimplbooksRef()

    if (unpaidInvoices.length === 0) {
      logger.info('No unpaid invoices found with Simplbooks reference')
      return
    }

    logger.info(`Found ${unpaidInvoices.length} unpaid invoices to check`)

    let checkedCount = 0
    let paidCount = 0
    let errorCount = 0

    // Process each invoice with rate limiting
    for (const invoice of unpaidInvoices) {
      try {
        const wasPaid = await checkAndUpdateInvoicePayment(invoice, getInvoiceFn, schedule)
        checkedCount++
        if (wasPaid) {
          paidCount++
        }
      } catch (error) {
        errorCount++
        logger.error(
          `Error checking invoice ${invoice.id} (Simplbooks ref: ${invoice.pmt_ref}):`,
          error,
        )
      }
    }

    logger.info(
      `Invoice payment sync completed: ${checkedCount} checked, ${paidCount} marked as paid, ${errorCount} errors`,
    )
  } catch (error) {
    logger.error('Error during invoice payment sync:', error)
  }
}

/**
 * Check a single invoice's payment status and update if paid
 *
 * Exported alongside `syncInvoicePayments` so a DB-backed test can exercise the
 * real paid-date logic against one invoice, without sweeping every unpaid row
 * in a database shared with other suites.
 *
 * @returns true if invoice was marked as paid, false otherwise
 */
export async function checkAndUpdateInvoicePayment(
  invoice: Invoice,
  getInvoiceFn: (id: number) => Promise<InvoiceResponse>,
  schedule: ScheduleFn = rateLimited,
): Promise<boolean> {
  // Defaults to the rate limiter, so we don't exceed 1 request per second
  return schedule(async (): Promise<boolean> => {
    try {
      const simplbooksInvoiceId = Number.parseInt(invoice.id, 10)

      if (Number.isNaN(simplbooksInvoiceId)) {
        // `id` is the SimplBooks invoice id; `pmt_ref` is the bank payment
        // reference printed on the invoice, which is a different number.
        logger.warn(`Invalid Simplbooks invoice ID for invoice ${invoice.id}`)
        return false
      }

      logger.info(
        `Checking payment status for invoice ${invoice.id} (Simplbooks ID: ${simplbooksInvoiceId})`,
      )

      const simplbooksInvoice = await getInvoiceFn(simplbooksInvoiceId)

      if (!simplbooksInvoice?.data?.Invoice) {
        logger.warn(`No invoice data returned from Simplbooks for invoice ${simplbooksInvoiceId}`)
        return false
      }

      const paidDate = simplbooksInvoice.data.Invoice.paid

      // Check if invoice is paid (paid field is not empty and not '0000-00-00')
      if (paidDate && paidDate !== '' && paidDate !== '0000-00-00') {
        logger.info(
          `Invoice ${invoice.id} is marked as paid in Simplbooks (paid date: ${paidDate})`,
        )

        await markInvoiceAsPaid(invoice.id, paidDate)

        logger.info(`Successfully marked invoice ${invoice.id} as paid in database`)
        return true
      } else {
        logger.debug(`Invoice ${invoice.id} is still unpaid in Simplbooks`)
        return false
      }
    } catch (error) {
      logger.error(`Error processing invoice ${invoice.id}:`, error)
      throw error
    }
  })
}
