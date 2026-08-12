import 'dotenv/config'

import {
  getOverdueInvoicesWithoutReminder,
  markOverdueEmailSent,
  getOverdueFlightInvoicesForMember,
  getMembersWithSuspendedReservations,
  getOverdueFlightInvoicesPastDays,
} from '../db/invoicing-queries.ts'
import {
  getMemberById,
  suspendMemberReservations,
  restoreMemberReservations,
} from '../db/member-queries.ts'
import { cancelAllFutureBookingsForMember } from '../db/booking-queries.ts'
import { sendEmail } from '../lib/sendGmail.ts'
import { createClientNote } from '../services/simplbooks/simplbooksApiClient.ts'
import logger from '../lib/logger.ts'
import type { Invoice } from '@mik/contracts/invoicing'
import { renderEmail } from '../templates/renderEmail.ts'
import { defineWorker, type CronWorkerDeps } from './defineWorker.ts'

const WORKER_NAME = 'Overdue Invoice Worker'

export interface OverdueInvoiceWorkerDeps extends CronWorkerDeps {
  sendEmailFn?: typeof sendEmail
  /** Injectable so the isolation between the two sweeps can be tested. */
  processOverdueInvoicesFn?: typeof processOverdueInvoices
  processSuspendedMembersFn?: typeof processSuspendedMembers
}

/**
 * Send a reservation suspension notification email to a member
 */
async function sendReservationSuspendedEmail(
  memberId: string,
  overdueInvoices: Array<{ total_sum: string | null; currency: string | null }>,
  cancelledBookingsCount: number,
  sendEmailFn: typeof sendEmail,
): Promise<void> {
  try {
    const member = await getMemberById(memberId)
    if (!member) {
      logger.warn(`Member not found for suspension email: ${memberId}`)
      return
    }

    // Calculate total amount from all overdue flight invoices
    const totalAmount = overdueInvoices.reduce((sum, inv) => {
      return sum + Number(inv.total_sum ?? 0)
    }, 0)

    logger.info(
      `Sending suspension notification email to ${member.email} (${member.lang}) - ${cancelledBookingsCount} booking(s) cancelled`,
    )

    const { subject, html } = renderEmail('reservation-suspended', member.lang, {
      firstName: member.firstName,
      invoiceCount: overdueInvoices.length,
      totalAmount,
      cancelledBookingsCount,
    })
    sendEmailFn(member.email, subject, html)
  } catch (error) {
    logger.error(`Error sending suspension email for member ${memberId}:`, error)
    throw error
  }
}

/**
 * Start the overdue invoice reminder worker
 * Runs daily at 6am to check for overdue unpaid invoices and send reminder emails
 */
export const startOverdueInvoiceWorker = defineWorker<OverdueInvoiceWorkerDeps>({
  name: WORKER_NAME,
  envPrefix: 'OVERDUE_INVOICE_WORKER',
  // '0 6 * * *' = At 6:00 AM every day
  schedule: '0 6 * * *',
  scheduleDescription: 'daily at 06:00',
  runOnStartup: true,
  run: async ({
    sendEmailFn = sendEmail,
    processOverdueInvoicesFn = processOverdueInvoices,
    processSuspendedMembersFn = processSuspendedMembers,
  }) => {
    // Two independent sweeps that only share a schedule. The suspension pass
    // cancels bookings and sends time-sensitive suspension mail, so it has to
    // run even when the reminder pass — which makes a SimplBooks call per
    // invoice — fails. Each is therefore isolated rather than left to abort
    // the run as a whole.
    await runSweep('overdue invoice reminders', () =>
      processOverdueInvoicesFn(sendEmailFn, createClientNote),
    )
    await runSweep('reservation suspensions', () => processSuspendedMembersFn(sendEmailFn))
  },
})

const runSweep = async (description: string, sweep: () => Promise<void>): Promise<void> => {
  try {
    await sweep()
  } catch (error) {
    logger.error(`${WORKER_NAME}: ${description} failed:`, error)
  }
}

/**
 * Process all overdue invoices and send reminder emails
 */
export async function processOverdueInvoices(
  sendEmailFn: typeof sendEmail,
  createClientNoteFn: typeof createClientNote = createClientNote,
): Promise<void> {
  try {
    logger.info('Fetching overdue invoices from database')
    const overdueInvoices = await getOverdueInvoicesWithoutReminder()

    if (overdueInvoices.length === 0) {
      logger.info('No overdue invoices found that need reminder emails')
      return
    }

    logger.info(`Found ${overdueInvoices.length} overdue invoices to process`)

    let sentCount = 0
    let errorCount = 0

    // Process each overdue invoice
    for (const invoice of overdueInvoices) {
      try {
        const member = await getMemberById(invoice.member_id)
        await sendOverdueInvoiceReminder(invoice, member, sendEmailFn)
        await markOverdueEmailSent(invoice.id.toString())
        sentCount++
        logger.info(
          `Sent overdue reminder for invoice ${invoice.id} to member ${invoice.member_id}`,
        )
        if (member?.billingId) {
          try {
            await createClientNoteFn(
              Number(member.billingId),
              Number(invoice.id),
              `Overdue reminder email sent from mik.intra to ${member.email}`,
            )
          } catch (noteError) {
            logger.warn(
              `Failed to create SimplBooks reminder note for invoice ${invoice.id}:`,
              noteError,
            )
          }
        }
      } catch (error) {
        errorCount++
        logger.error(
          `Error processing overdue invoice ${invoice.id} for member ${invoice.member_id}:`,
          error,
        )
      }
    }

    logger.info(
      `Overdue invoice processing completed: ${sentCount} reminders sent, ${errorCount} errors`,
    )
  } catch (error) {
    logger.error('Error during overdue invoice processing:', error)
  }
}

/**
 * Send an overdue invoice reminder email to a member
 */
async function sendOverdueInvoiceReminder(
  invoice: Invoice,
  member: Awaited<ReturnType<typeof getMemberById>>,
  sendEmailFn: typeof sendEmail,
): Promise<void> {
  try {
    if (!member) {
      logger.warn(`Member not found for invoice ${invoice.id}: ${invoice.member_id}`)
      return
    }

    logger.info(
      `Sending overdue reminder email for invoice ${invoice.id} to ${member.email} (${member.lang})`,
    )

    const { subject, html } = renderEmail('overdue-invoice', member.lang, {
      firstName: member.firstName,
      invoiceId: invoice.id,
      amount: Number(invoice.total_sum ?? 0),
      dueDate: invoice.due_at,
    })
    sendEmailFn(member.email, subject, html)
  } catch (error) {
    logger.error(`Error sending overdue reminder for invoice ${invoice.id}:`, error)
    throw error
  }
}

/**
 * Process members with overdue flight invoices and manage reservation suspensions
 */
export async function processSuspendedMembers(sendEmailFn: typeof sendEmail): Promise<void> {
  const suspensionDays = Number.parseInt(process.env.OVERDUE_INVOICE_SUSPENSION_DAYS || '30', 10)

  try {
    logger.info('Processing member reservation suspensions')

    // Get all members who currently have suspended reservations
    const suspendedMembers = await getMembersWithSuspendedReservations()

    logger.info(`Found ${suspendedMembers.length} members with suspended reservations`)

    // Check each suspended member to see if they should be restored
    for (const memberId of suspendedMembers) {
      const overdueFlightInvoices = await getOverdueFlightInvoicesForMember(memberId, 0)

      if (overdueFlightInvoices.length === 0) {
        // No overdue flight invoices - restore reservation privileges
        await restoreMemberReservations(memberId)
        logger.info(
          `Restored reservation privileges for member ${memberId} - all flight invoices paid`,
        )
      }
    }

    // Get all FLIGHT invoices that are overdue beyond the suspension period
    const overdueFlightInvoices = await getOverdueFlightInvoicesPastDays(suspensionDays)

    logger.info(
      `Found ${overdueFlightInvoices.length} FLIGHT invoices overdue > ${suspensionDays} days`,
    )

    // Group by member_id to get unique members who should be suspended
    const memberInvoicesMap = new Map<string, typeof overdueFlightInvoices>()
    for (const invoice of overdueFlightInvoices) {
      if (!memberInvoicesMap.has(invoice.member_id)) {
        memberInvoicesMap.set(invoice.member_id, [])
      }
      memberInvoicesMap.get(invoice.member_id)!.push(invoice)
    }

    // Suspend members who have flight invoices overdue beyond the suspension period
    for (const [memberId, invoices] of memberInvoicesMap) {
      const member = await getMemberById(memberId)

      if (member?.canMakeReservations) {
        // Suspend reservation privileges
        await suspendMemberReservations(memberId)

        // Cancel all future bookings
        const cancelledBookingsCount = await cancelAllFutureBookingsForMember(
          memberId,
          'Overdue unpaid flight invoices',
          'k1mnimda',
        )

        logger.info(
          `Suspended reservation privileges for member ${memberId} - flight invoices overdue > ${suspensionDays} days - cancelled ${cancelledBookingsCount} future booking(s)`,
        )

        // Send suspension notification email
        try {
          await sendReservationSuspendedEmail(
            memberId,
            invoices,
            cancelledBookingsCount,
            sendEmailFn,
          )
          logger.info(`Sent suspension notification email to member ${memberId}`)
        } catch (error) {
          logger.error(`Failed to send suspension email to member ${memberId}:`, error)
          // Don't throw - suspension already happened, email failure shouldn't rollback
        }
      }
    }

    logger.info('Member reservation suspension processing completed')
  } catch (error) {
    logger.error('Error during member suspension processing:', error)
  }
}
