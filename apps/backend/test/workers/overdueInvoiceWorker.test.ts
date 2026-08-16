import { jest } from '@jest/globals'
import { db } from '../../src/db/connection.ts'
import type { sendEmail } from '../../src/lib/sendGmail.ts'
import type { createClientNote } from '../../src/services/simplbooks/simplbooksApiClient.ts'

// Mock the logger
jest.mock('../../src/lib/logger.ts', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

// Pre-declare mock for sendEmail
const mockSendEmail = jest.fn<typeof sendEmail>().mockResolvedValue(undefined)

// Mock sendEmail
jest.mock('../../src/lib/sendGmail.ts', () => ({
  sendEmail: mockSendEmail,
}))

// Pre-declare mock for SimplBooks API client
const mockCreateClientNote = jest.fn<typeof createClientNote>().mockResolvedValue(undefined)

// Mock SimplBooks API client
jest.mock('../../src/services/simplbooks/simplbooksApiClient.ts', () => ({
  createClientNote: mockCreateClientNote,
}))

// Import modules AFTER setting up mocks
import {
  getOverdueInvoicesWithoutReminder,
  markOverdueEmailSent,
} from '../../src/db/invoicing-queries.ts'
import { MIK_SIMPLBOOKS_MEMBER } from '../../src/services/simplbooks/simplbooksOutboxHandler.ts'
import { processOverdueInvoices } from '../../src/workers/overdueInvoiceWorker.ts'
import type { ScheduledTask, TaskFn, TaskOptions } from 'node-cron'

describe('Overdue Invoice Worker', () => {
  const testMemberId = 'Matti1'
  let testInvoiceId: string
  let mockCronSchedule: jest.Mock<
    (expression: string, func: string | TaskFn, options?: TaskOptions) => ScheduledTask
  >

  beforeAll(async () => {
    // Set environment variables for testing
    process.env.OVERDUE_INVOICE_WORKER_ENABLED = 'true'
    process.env.OVERDUE_INVOICE_WORKER_RUN_ON_STARTUP = 'false'
    // Ensure grace period is 0 for most tests (explicit tests will override)
    process.env.OVERDUE_INVOICE_GRACE_PERIOD_DAYS = '0'
  })

  beforeEach(async () => {
    jest.clearAllMocks()

    // Initialize mocks
    mockCreateClientNote.mockResolvedValue(undefined)
    mockCronSchedule = jest.fn().mockReturnValue({
      stop: jest.fn(),
    }) as any

    // Create a test overdue invoice without reminder sent
    const maxIdResult = await db
      .selectFrom('accts.invoice')
      .select(db.fn.max('id').as('maxId'))
      .executeTakeFirst()

    const nextId = maxIdResult?.maxId ? Number(maxIdResult.maxId) + 1 : 1

    await db
      .insertInto('accts.invoice')
      .values({
        id: nextId.toString(),
        memberId: testMemberId,
        invoiceType: 'FLIGHT',
        description: 'Test overdue invoice',
        pmtRef: '12345', // Simplbooks invoice ID
        paidAt: null, // is_paid will be false (generated column)
        dueAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        sentAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), // 35 days ago
        currency: 'EUR',
        totalSum: '150.00',
        createdBy: MIK_SIMPLBOOKS_MEMBER,
        updatedBy: MIK_SIMPLBOOKS_MEMBER,
      })
      .execute()

    testInvoiceId = nextId.toString()
  })

  afterEach(async () => {
    // Clean up test invoice
    if (testInvoiceId) {
      await db.deleteFrom('accts.invoice').where('id', '=', testInvoiceId).execute()
    }
  })

  describe('Worker Initialization', () => {
    it('should schedule task when worker is enabled', async () => {
      const { startOverdueInvoiceWorker } =
        await import('../../src/workers/overdueInvoiceWorker.ts')

      const worker = startOverdueInvoiceWorker({
        sendEmailFn: mockSendEmail,
        cronSchedule: mockCronSchedule,
      })

      expect(mockCronSchedule).toHaveBeenCalledWith('0 6 * * *', expect.any(Function))

      worker.stop()
    })

    it('should not schedule task when worker is disabled', async () => {
      process.env.OVERDUE_INVOICE_WORKER_ENABLED = 'false'

      // Clear module cache to re-import with new env var
      jest.resetModules()

      const { startOverdueInvoiceWorker } =
        await import('../../src/workers/overdueInvoiceWorker.ts')

      const worker = startOverdueInvoiceWorker({
        sendEmailFn: mockSendEmail,
        cronSchedule: mockCronSchedule,
      })

      expect(mockCronSchedule).not.toHaveBeenCalled()

      worker.stop()

      // Restore env var
      process.env.OVERDUE_INVOICE_WORKER_ENABLED = 'true'
    })
  })

  // The reminder sweep and the suspension sweep are independent jobs that only
  // share a schedule: the suspension sweep cancels bookings and sends
  // time-sensitive suspension mail, so it has to run even when the reminder
  // sweep — a SimplBooks call per invoice — dies.
  describe('Sweep isolation', () => {
    const reminderSweep =
      jest.fn<
        (
          sendEmailFn: typeof sendEmail,
          createClientNoteFn?: typeof createClientNote,
        ) => Promise<void>
      >()
    const suspensionSweep = jest.fn<(sendEmailFn: typeof sendEmail) => Promise<void>>()

    const startWorker = async () => {
      const { startOverdueInvoiceWorker } =
        await import('../../src/workers/overdueInvoiceWorker.ts')

      return startOverdueInvoiceWorker({
        sendEmailFn: mockSendEmail,
        cronSchedule: mockCronSchedule,
        processOverdueInvoicesFn: reminderSweep,
        processSuspendedMembersFn: suspensionSweep,
      })
    }

    beforeEach(() => {
      reminderSweep.mockReset().mockResolvedValue(undefined)
      suspensionSweep.mockReset().mockResolvedValue(undefined)
    })

    afterEach(() => {
      process.env.OVERDUE_INVOICE_WORKER_RUN_ON_STARTUP = 'false'
    })

    it('runs the suspension sweep even when the reminder sweep throws', async () => {
      reminderSweep.mockRejectedValue(new Error('SimplBooks unreachable'))

      const worker = await startWorker()
      await (mockCronSchedule.mock.calls[0][1] as () => Promise<void>)()

      expect(reminderSweep).toHaveBeenCalledTimes(1)
      expect(suspensionSweep).toHaveBeenCalledTimes(1)

      worker.stop()
    })

    it('runs both sweeps on the startup path', async () => {
      process.env.OVERDUE_INVOICE_WORKER_RUN_ON_STARTUP = 'true'

      const worker = await startWorker()
      // The startup run is deliberately not awaited by the worker factory.
      await new Promise((resolve) => setImmediate(resolve))

      expect(reminderSweep).toHaveBeenCalledTimes(1)
      expect(suspensionSweep).toHaveBeenCalledTimes(1)

      worker.stop()
    })

    it('runs the suspension sweep on startup even when the reminder sweep throws', async () => {
      process.env.OVERDUE_INVOICE_WORKER_RUN_ON_STARTUP = 'true'
      reminderSweep.mockRejectedValue(new Error('SimplBooks unreachable'))

      const worker = await startWorker()
      await new Promise((resolve) => setImmediate(resolve))

      expect(suspensionSweep).toHaveBeenCalledTimes(1)

      worker.stop()
    })
  })

  describe('Database Queries', () => {
    it('should find overdue invoices without reminder sent', async () => {
      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should include our test invoice
      const testInvoice = overdueInvoices.find((inv) => inv.id.toString() === testInvoiceId)

      expect(testInvoice).toBeDefined()
      expect(testInvoice?.member_id).toBe(testMemberId)
      expect(testInvoice?.is_paid).toBe(false)
    })

    it('should not find invoices after reminder is marked as sent', async () => {
      // Mark reminder as sent
      await markOverdueEmailSent(testInvoiceId)

      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should NOT include our test invoice anymore
      const testInvoice = overdueInvoices.find((inv) => inv.id.toString() === testInvoiceId)

      expect(testInvoice).toBeUndefined()
    })

    it('should not find paid invoices even if overdue', async () => {
      // Mark invoice as paid
      await db
        .updateTable('accts.invoice')
        .set({
          paidAt: new Date().toISOString(),
          updatedBy: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('id', '=', testInvoiceId)
        .execute()

      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should NOT include paid invoice
      const testInvoice = overdueInvoices.find((inv) => inv.id.toString() === testInvoiceId)

      expect(testInvoice).toBeUndefined()
    })

    it('should not find future invoices', async () => {
      // Update invoice to have future due date
      await db
        .updateTable('accts.invoice')
        .set({
          dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days in future
          updatedBy: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('id', '=', testInvoiceId)
        .execute()

      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should NOT include future invoice
      const testInvoice = overdueInvoices.find((inv) => inv.id.toString() === testInvoiceId)

      expect(testInvoice).toBeUndefined()
    })

    it('should respect grace period when set', async () => {
      // Set grace period to 7 days
      process.env.OVERDUE_INVOICE_GRACE_PERIOD_DAYS = '7'

      // Update invoice to be 3 days overdue (within grace period)
      await db
        .updateTable('accts.invoice')
        .set({
          dueAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          updatedBy: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('id', '=', testInvoiceId)
        .execute()

      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should NOT include invoice because it's within grace period
      const testInvoice = overdueInvoices.find((inv) => inv.id.toString() === testInvoiceId)
      expect(testInvoice).toBeUndefined()

      // Restore grace period to 0
      process.env.OVERDUE_INVOICE_GRACE_PERIOD_DAYS = '0'
    })

    it('should find invoices past grace period', async () => {
      // Set grace period to 7 days
      process.env.OVERDUE_INVOICE_GRACE_PERIOD_DAYS = '7'

      // Update invoice to be 10 days overdue (past grace period)
      await db
        .updateTable('accts.invoice')
        .set({
          dueAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          updatedBy: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('id', '=', testInvoiceId)
        .execute()

      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should include invoice because it's past grace period
      const testInvoice = overdueInvoices.find((inv) => inv.id.toString() === testInvoiceId)
      expect(testInvoice).toBeDefined()
      expect(testInvoice?.member_id).toBe(testMemberId)

      // Restore grace period to 0
      process.env.OVERDUE_INVOICE_GRACE_PERIOD_DAYS = '0'
    })
  })

  describe('Mark Overdue Email Sent', () => {
    it('should update overdue_email_sent_at timestamp', async () => {
      await markOverdueEmailSent(testInvoiceId)

      const invoice = await db
        .selectFrom('accts.invoice')
        .selectAll()
        .where('id', '=', testInvoiceId)
        .executeTakeFirst()

      expect(invoice?.overdueEmailSentAt).not.toBeNull()
      expect(invoice?.updatedBy).toBe(MIK_SIMPLBOOKS_MEMBER)
    })
  })

  describe('SimplBooks client note on overdue reminder', () => {
    it('should create a SimplBooks note when a reminder is sent for a member with a billingId', async () => {
      await processOverdueInvoices(mockSendEmail, mockCreateClientNote)

      const testInvoiceCall = mockCreateClientNote.mock.calls.find(
        ([, invoiceId]) => invoiceId === Number(testInvoiceId),
      )
      expect(testInvoiceCall).toBeDefined()
      expect(testInvoiceCall?.[2]).toMatch(/^Overdue reminder email sent from mik\.intra to /)
    })

    it('should not create a SimplBooks note when member has no billingId', async () => {
      // Remove billing_id from the test member
      await db
        .updateTable('member.register')
        .set({ billingId: null })
        .where('memberId', '=', testMemberId)
        .execute()

      await processOverdueInvoices(mockSendEmail, mockCreateClientNote)

      expect(mockCreateClientNote).not.toHaveBeenCalled()

      // Restore billing_id to original test data value
      await db
        .updateTable('member.register')
        .set({ billingId: '123' })
        .where('memberId', '=', testMemberId)
        .execute()
    })

    it('should not fail the reminder flow when SimplBooks note creation throws', async () => {
      mockCreateClientNote.mockRejectedValueOnce(new Error('SimplBooks API error'))

      // Should not throw — note failure is non-fatal
      await expect(
        processOverdueInvoices(mockSendEmail, mockCreateClientNote),
      ).resolves.not.toThrow()

      // Reminder email was still sent
      expect(mockSendEmail).toHaveBeenCalled()

      // Invoice was still marked as reminded
      const invoice = await db
        .selectFrom('accts.invoice')
        .select('overdueEmailSentAt')
        .where('id', '=', testInvoiceId)
        .executeTakeFirst()
      expect(invoice?.overdueEmailSentAt).not.toBeNull()
    })
  })
})
