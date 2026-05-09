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
      .select(db.fn.max('id').as('max_id'))
      .executeTakeFirst()

    const nextId = maxIdResult?.max_id ? Number(maxIdResult.max_id) + 1 : 1

    await db
      .insertInto('accts.invoice')
      .values({
        id: nextId.toString(),
        member_id: testMemberId,
        invoice_type: 'FLIGHT',
        description: 'Test overdue invoice',
        pmt_ref: '12345', // Simplbooks invoice ID
        paid_at: null, // is_paid will be false (generated column)
        due_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        sent_at: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), // 35 days ago
        currency: 'EUR',
        total_sum: '150.00',
        created_by: MIK_SIMPLBOOKS_MEMBER,
        updated_by: MIK_SIMPLBOOKS_MEMBER,
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
      const { startOverdueInvoiceWorker } = await import(
        '../../src/workers/overdueInvoiceWorker.ts'
      )

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

      const { startOverdueInvoiceWorker } = await import(
        '../../src/workers/overdueInvoiceWorker.ts'
      )

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

  describe('Database Queries', () => {
    it('should find overdue invoices without reminder sent', async () => {
      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should include our test invoice
      const testInvoice = overdueInvoices.find(inv => inv.id.toString() === testInvoiceId)

      expect(testInvoice).toBeDefined()
      expect(testInvoice?.member_id).toBe(testMemberId)
      expect(testInvoice?.is_paid).toBe(false)
    })

    it('should not find invoices after reminder is marked as sent', async () => {
      // Mark reminder as sent
      await markOverdueEmailSent(testInvoiceId)

      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should NOT include our test invoice anymore
      const testInvoice = overdueInvoices.find(inv => inv.id.toString() === testInvoiceId)

      expect(testInvoice).toBeUndefined()
    })

    it('should not find paid invoices even if overdue', async () => {
      // Mark invoice as paid
      await db
        .updateTable('accts.invoice')
        .set({
          paid_at: new Date().toISOString(),
          updated_by: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('id', '=', testInvoiceId)
        .execute()

      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should NOT include paid invoice
      const testInvoice = overdueInvoices.find(inv => inv.id.toString() === testInvoiceId)

      expect(testInvoice).toBeUndefined()
    })

    it('should not find future invoices', async () => {
      // Update invoice to have future due date
      await db
        .updateTable('accts.invoice')
        .set({
          due_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days in future
          updated_by: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('id', '=', testInvoiceId)
        .execute()

      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should NOT include future invoice
      const testInvoice = overdueInvoices.find(inv => inv.id.toString() === testInvoiceId)

      expect(testInvoice).toBeUndefined()
    })

    it('should respect grace period when set', async () => {
      // Set grace period to 7 days
      process.env.OVERDUE_INVOICE_GRACE_PERIOD_DAYS = '7'

      // Update invoice to be 3 days overdue (within grace period)
      await db
        .updateTable('accts.invoice')
        .set({
          due_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          updated_by: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('id', '=', testInvoiceId)
        .execute()

      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should NOT include invoice because it's within grace period
      const testInvoice = overdueInvoices.find(inv => inv.id.toString() === testInvoiceId)
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
          due_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          updated_by: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('id', '=', testInvoiceId)
        .execute()

      const overdueInvoices = await getOverdueInvoicesWithoutReminder()

      // Should include invoice because it's past grace period
      const testInvoice = overdueInvoices.find(inv => inv.id.toString() === testInvoiceId)
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

      expect(invoice?.overdue_email_sent_at).not.toBeNull()
      expect(invoice?.updated_by).toBe(MIK_SIMPLBOOKS_MEMBER)
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
        .set({ billing_id: null })
        .where('member_id', '=', testMemberId)
        .execute()

      await processOverdueInvoices(mockSendEmail, mockCreateClientNote)

      expect(mockCreateClientNote).not.toHaveBeenCalled()

      // Restore billing_id to original test data value
      await db
        .updateTable('member.register')
        .set({ billing_id: '123' })
        .where('member_id', '=', testMemberId)
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
        .select('overdue_email_sent_at')
        .where('id', '=', testInvoiceId)
        .executeTakeFirst()
      expect(invoice?.overdue_email_sent_at).not.toBeNull()
    })
  })
})
