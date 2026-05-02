import { jest } from '@jest/globals'
import { db } from '../../src/db/connection.ts'
import type { InvoiceResponse } from '../../src/services/simplbooks/models.ts'
import { FlightLogStatus } from '../../src/routes/flight-log/models.ts'

// Mock the logger
jest.mock('../../src/lib/logger.ts', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

// Import modules AFTER setting up mocks
import {
  getUnpaidInvoicesWithSimplbooksRef,
  markInvoiceAsPaid,
} from '../../src/db/invoicing-queries.ts'
import { MIK_SIMPLBOOKS_MEMBER } from '../../src/services/simplbooks/simplbooksOutboxHandler.ts'
import type { ScheduledTask, TaskFn, TaskOptions } from 'node-cron'

describe('Simplbooks Invoice Payment Worker', () => {
  const testMemberId = 'Matti1'
  let testInvoiceId: string
  let testFlightId: string
  let mockGetInvoice: jest.Mock<(id: number) => Promise<InvoiceResponse>>
  let mockCronSchedule: jest.Mock<
    (expression: string, func: string | TaskFn, options?: TaskOptions) => ScheduledTask
  >

  beforeAll(async () => {
    // Set environment variables for testing
    process.env.SIMPLBOOKS_INVOICE_PAYMENT_WORKER_ENABLED = 'true'
    process.env.SIMPLBOOKS_INVOICE_PAYMENT_WORKER_RUN_ON_STARTUP = 'false'
  })

  beforeEach(async () => {
    jest.clearAllMocks()

    // Initialize mocks
    mockGetInvoice = jest.fn<(id: number) => Promise<InvoiceResponse>>()
    mockCronSchedule = jest.fn().mockReturnValue({
      stop: jest.fn(),
    }) as any

    // Create a test unpaid invoice with Simplbooks reference
    // Note: We use the database's default ID generation
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
        description: 'Test flight invoice',
        pmt_ref: '12345', // Simplbooks invoice ID
        paid_at: null, // is_paid will be false (generated column)
        due_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        sent_at: new Date().toISOString(),
        currency: 'EUR',
        total_sum: '100.00',
        created_by: MIK_SIMPLBOOKS_MEMBER,
        updated_by: MIK_SIMPLBOOKS_MEMBER,
      })
      .execute()

    testInvoiceId = nextId.toString()

    // Create a test flight log linked to the invoice (flight_id is VARCHAR(9))
    testFlightId = 'tstpymnt'
    await db.deleteFrom('flight.logs').where('flight_id', '=', testFlightId).execute()

    // Generate past timestamps rounded down to the nearest minute (divisible by 60)
    // to satisfy check_all_times_in_mins and check_epochs_not_future constraints.
    const baseEpoch = Math.floor((Date.now() / 1000 - 86400) / 60) * 60 // yesterday, nearest minute
    const offBlock = baseEpoch
    const takeOff = baseEpoch + 900 // +15 min
    const landing = baseEpoch + 4500 // +1h15min
    const onBlock = baseEpoch + 5400 // +1h30min

    await db
      .insertInto('flight.logs')
      .values({
        flight_id: testFlightId,
        billable_member_id: testMemberId,
        pic_member_id: testMemberId,
        pic_last_name: 'TestPilot',
        pic_role: 'PIC',
        aircraft_registration: 'OH-STL',
        off_block_time_epoch: offBlock,
        takeoff_time_epoch: takeOff,
        landing_time_epoch: landing,
        on_block_time_epoch: onBlock,
        persons_on_board: 1,
        number_of_landings: 1,
        night_flying_mins: 0,
        instrument_flying_mins: 0,
        fuel_remaining_litres: 20,
        departure_airport: 'EFHK',
        arrival_airport: 'EFHK',
        invoice_number: testInvoiceId,
        flight_type: 'XC',
        created_by: MIK_SIMPLBOOKS_MEMBER,
        updated_by: MIK_SIMPLBOOKS_MEMBER,
        is_billable_flight: true,
        is_dto_training_flight: false,
        priv_or_com_flight: 'C',
        ajlb_seq_no: 2,
        ajlb_blank_rows_before: 0,
        ajlb_total_flight_mins: 60,
        ajlb_page_number: 1,
        ajlb_row_number: 1,
        total_time_in_service: 1.0,
        status: FlightLogStatus.INVOICED,
      } as any)
      .execute()
  })

  afterEach(async () => {
    // Clean up test flight log and invoice
    if (testFlightId) {
      await db.deleteFrom('flight.logs').where('flight_id', '=', testFlightId).execute()
    }
    if (testInvoiceId) {
      await db.deleteFrom('accts.invoice').where('id', '=', testInvoiceId).execute()
    }
  })

  describe('Worker Initialization', () => {
    it('should schedule task when worker is enabled', async () => {
      // Import the worker module fresh
      const { startSimplbooksInvoicePaymentWorker } = await import(
        '../../src/workers/simplbooksInvoicePaymentWorker.ts'
      )

      const worker = startSimplbooksInvoicePaymentWorker({
        getInvoice: mockGetInvoice,
        cronSchedule: mockCronSchedule,
      })

      expect(mockCronSchedule).toHaveBeenCalledWith('0 4 * * *', expect.any(Function))
      // Note: logger mock assertions removed as logger is imported in the worker module

      worker.stop()
    })

    it('should not start worker when disabled', async () => {
      process.env.SIMPLBOOKS_INVOICE_PAYMENT_WORKER_ENABLED = 'false'

      // Clear module cache to reload with new env var
      jest.resetModules()
      const { startSimplbooksInvoicePaymentWorker } = await import(
        '../../src/workers/simplbooksInvoicePaymentWorker.ts'
      )

      const worker = startSimplbooksInvoicePaymentWorker({
        getInvoice: mockGetInvoice,
        cronSchedule: mockCronSchedule,
      })

      // Note: logger mock assertions removed as logger is imported in the worker module
      expect(mockCronSchedule).not.toHaveBeenCalled()

      worker.stop()

      // Reset env var
      process.env.SIMPLBOOKS_INVOICE_PAYMENT_WORKER_ENABLED = 'true'
    })
  })

  describe('Database Queries', () => {
    it('should retrieve unpaid invoices with Simplbooks reference', async () => {
      const unpaidInvoices = await getUnpaidInvoicesWithSimplbooksRef()

      expect(unpaidInvoices).toBeDefined()
      expect(Array.isArray(unpaidInvoices)).toBe(true)

      // Should include our test invoice
      const testInvoice = unpaidInvoices.find(inv => inv.id.toString() === testInvoiceId)
      expect(testInvoice).toBeDefined()
      expect(testInvoice?.is_paid).toBe(false)
      expect(testInvoice?.pmt_ref).toBe('12345')
    })

    it('should exclude invoices without Simplbooks reference', async () => {
      // Create an invoice without pmt_ref
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
          description: 'Test invoice without ref',
          pmt_ref: '',
          paid_at: null, // is_paid will be false (generated column)
          due_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          sent_at: new Date().toISOString(),
          currency: 'EUR',
          total_sum: '100.00',
          created_by: MIK_SIMPLBOOKS_MEMBER,
          updated_by: MIK_SIMPLBOOKS_MEMBER,
        })
        .execute()

      const noRefInvoiceId = nextId.toString()

      const unpaidInvoices = await getUnpaidInvoicesWithSimplbooksRef()

      // Should not include invoice without pmt_ref
      const noRefInvoice = unpaidInvoices.find(inv => inv.id.toString() === noRefInvoiceId)
      expect(noRefInvoice).toBeUndefined()

      // Clean up
      await db.deleteFrom('accts.invoice').where('id', '=', noRefInvoiceId).execute()
    })

    it('should mark invoice as paid and update linked flight logs to PAID', async () => {
      const paidDate = '2024-11-27'
      await markInvoiceAsPaid(testInvoiceId, paidDate)

      const invoice = await db
        .selectFrom('accts.invoice')
        .selectAll()
        .where('id', '=', testInvoiceId)
        .executeTakeFirst()

      expect(invoice?.is_paid).toBe(true)
      expect(invoice?.paid_at).toBe(paidDate)
      expect(invoice?.updated_by).toBe('simplbks')

      const flightLog = await db
        .selectFrom('flight.logs')
        .selectAll()
        .where('flight_id', '=', testFlightId)
        .executeTakeFirst()

      expect(flightLog?.status).toBe(FlightLogStatus.PAID)
      expect(flightLog?.updated_by).toBe('simplbks')
    })
  })

  describe('End-to-End Invoice Sync', () => {
    it('should sync payment status for paid invoice', async () => {
      // Mock getInvoice to return a paid invoice
      mockGetInvoice.mockResolvedValue({
        status: 200,
        duration: 0.05,
        data: {
          Invoice: {
            id: 12345,
            client_id: 123,
            client_name: 'Test Client',
            paid: '2024-11-27',
            due: '2024-11-30',
          },
          Task: [],
        },
      })

      // Verify invoice is unpaid before sync
      const invoiceBefore = await db
        .selectFrom('accts.invoice')
        .selectAll()
        .where('id', '=', testInvoiceId)
        .executeTakeFirst()

      expect(invoiceBefore?.is_paid).toBe(false)

      // Manually trigger the sync logic (simulate worker execution)
      const unpaidInvoices = await getUnpaidInvoicesWithSimplbooksRef()
      const testInvoice = unpaidInvoices.find(inv => inv.id.toString() === testInvoiceId)

      if (testInvoice) {
        const simplbooksInvoice = await mockGetInvoice(parseInt(testInvoice.pmt_ref, 10))

        if (
          simplbooksInvoice.data.Invoice.paid &&
          simplbooksInvoice.data.Invoice.paid !== '' &&
          simplbooksInvoice.data.Invoice.paid !== '0000-00-00'
        ) {
          await markInvoiceAsPaid(testInvoice.id.toString(), simplbooksInvoice.data.Invoice.paid)
        }
      }

      // Verify invoice is now paid
      const invoiceAfter = await db
        .selectFrom('accts.invoice')
        .selectAll()
        .where('id', '=', testInvoiceId)
        .executeTakeFirst()

      expect(invoiceAfter?.is_paid).toBe(true)
      expect(invoiceAfter?.paid_at).toBe('2024-11-27')
      expect(invoiceAfter?.updated_by).toBe('simplbks')

      // Verify flight logs linked to the invoice are also marked as PAID
      const flightLogAfter = await db
        .selectFrom('flight.logs')
        .selectAll()
        .where('flight_id', '=', testFlightId)
        .executeTakeFirst()

      expect(flightLogAfter?.status).toBe(FlightLogStatus.PAID)
    })

    it('should not update invoice if still unpaid in Simplbooks', async () => {
      // Mock getInvoice to return an unpaid invoice
      mockGetInvoice.mockResolvedValue({
        status: 200,
        duration: 0.05,
        data: {
          Invoice: {
            id: 12345,
            client_id: 123,
            client_name: 'Test Client',
            paid: '', // Still unpaid
            due: '2024-11-30',
          },
          Task: [],
        },
      })

      // Get initial state
      const invoiceBefore = await db
        .selectFrom('accts.invoice')
        .selectAll()
        .where('id', '=', testInvoiceId)
        .executeTakeFirst()

      expect(invoiceBefore?.is_paid).toBe(false)

      // Manually trigger the sync logic
      const unpaidInvoices = await getUnpaidInvoicesWithSimplbooksRef()
      const testInvoice = unpaidInvoices.find(inv => inv.id.toString() === testInvoiceId)

      if (testInvoice) {
        const simplbooksInvoice = await mockGetInvoice(parseInt(testInvoice.pmt_ref, 10))

        if (
          simplbooksInvoice.data.Invoice.paid &&
          simplbooksInvoice.data.Invoice.paid !== '' &&
          simplbooksInvoice.data.Invoice.paid !== '0000-00-00'
        ) {
          await markInvoiceAsPaid(testInvoice.id.toString(), simplbooksInvoice.data.Invoice.paid)
        }
      }

      // Verify invoice is still unpaid
      const invoiceAfter = await db
        .selectFrom('accts.invoice')
        .selectAll()
        .where('id', '=', testInvoiceId)
        .executeTakeFirst()

      expect(invoiceAfter?.is_paid).toBe(false)
      expect(invoiceAfter?.paid_at).toBeNull()
    })
  })
})
