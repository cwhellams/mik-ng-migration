import 'dotenv/config'

import cron from 'node-cron'
import Bottleneck from 'bottleneck'
import { getUnpaidInvoicesWithSimplbooksRef, markInvoiceAsPaid } from '../db/invoicing-queries.ts'
import { getInvoice } from '../services/simplbooks/simplbooksApiClient.ts'
import logger from '../lib/logger.ts'
import type { AcctsInvoice } from '../db/schema.d.ts'
import type { InvoiceResponse } from '../services/simplbooks/models.ts'

// Rate limiter to ensure max 1 request per second to Simplbooks API
const limiter = new Bottleneck({
  minTime: 1000, // Minimum 1000ms (1 second) between requests
  maxConcurrent: 1, // Only 1 concurrent request at a time
})

let scheduledTask: cron.ScheduledTask | null = null

export interface SimplbooksInvoicePaymentWorkerDeps {
  getInvoice?: (id: number) => Promise<InvoiceResponse>
  cronSchedule?: typeof cron.schedule
}

/**
 * Start the Simplbooks invoice payment sync worker
 * Runs daily at 4am to check unpaid invoices and sync their payment status
 */
export function startSimplbooksInvoicePaymentWorker(deps: SimplbooksInvoicePaymentWorkerDeps = {}) {
  const { getInvoice: getInvoiceFn = getInvoice, cronSchedule = cron.schedule } = deps
  const shouldRun = process.env.SIMPLBOOKS_INVOICE_PAYMENT_WORKER_ENABLED === 'true'

  if (!shouldRun) {
    logger.warn('Simplbooks Invoice Payment Worker is disabled')
    return {
      stop: () => {
        logger.info('Simplbooks Invoice Payment Worker is not running')
      },
    }
  }

  logger.info('Starting Simplbooks Invoice Payment Worker - scheduled for 4am daily')

  // Schedule task to run daily at 4:00 AM
  // Cron format: minute hour day month weekday
  // '0 4 * * *' = At 4:00 AM every day
  scheduledTask = cronSchedule('0 4 * * *', async () => {
    logger.info('Simplbooks Invoice Payment Worker: Starting scheduled run')
    await syncInvoicePayments(getInvoiceFn)
  })

  // Run immediately on startup for testing (optional - remove if not needed)
  if (process.env.SIMPLBOOKS_INVOICE_PAYMENT_WORKER_RUN_ON_STARTUP === 'true') {
    logger.info('Running invoice payment sync immediately on startup')
    syncInvoicePayments(getInvoiceFn).catch(error => {
      logger.error('Error during startup invoice payment sync:', error)
    })
  }

  return {
    stop: () => {
      logger.info('Stopping Simplbooks Invoice Payment Worker')
      if (scheduledTask) {
        scheduledTask.stop()
        scheduledTask = null
      }
    },
  }
}

/**
 * Sync payment status for all unpaid invoices with Simplbooks
 */
async function syncInvoicePayments(
  getInvoiceFn: (id: number) => Promise<InvoiceResponse>,
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
        const wasPaid = await checkAndUpdateInvoicePayment(invoice, getInvoiceFn)
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
 * @returns true if invoice was marked as paid, false otherwise
 */
async function checkAndUpdateInvoicePayment(
  invoice: AcctsInvoice,
  getInvoiceFn: (id: number) => Promise<InvoiceResponse>,
): Promise<boolean> {
  // Use rate limiter to ensure we don't exceed 1 request per second
  return limiter.schedule(async (): Promise<boolean> => {
    try {
      const simplbooksInvoiceId = Number.parseInt(invoice.id.toString(), 10)

      if (Number.isNaN(simplbooksInvoiceId)) {
        logger.warn(`Invalid Simplbooks invoice ID for invoice ${invoice.id}: ${invoice.pmt_ref}`)
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

        await markInvoiceAsPaid(invoice.id.toString(), paidDate)

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
