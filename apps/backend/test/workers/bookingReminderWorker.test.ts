import { jest } from '@jest/globals'
import { db } from '../../src/db/connection.ts'
import dayjs from 'dayjs'

// Mock the logger
jest.mock('../../src/lib/logger.ts', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

// Mock sendEmail
jest.mock('../../src/lib/sendGmail.ts', () => ({
  sendEmail: jest.fn(),
}))

// Import modules AFTER setting up mocks
import { claimUpcomingBookingsForReminder } from '../../src/db/booking-queries.ts'
import { sendEmail } from '../../src/lib/sendGmail.ts'
import type { ScheduledTask, TaskFn, TaskOptions } from 'node-cron'

describe('Booking Reminder Worker', () => {
  const testMemberId = 'Matti1'
  let testBookingId: string
  let mockSendEmail: jest.Mock & typeof sendEmail
  let mockCronSchedule: jest.Mock<
    (expression: string, func: string | TaskFn, options?: TaskOptions) => ScheduledTask
  >
  let bookingCounter = 0

  beforeAll(async () => {
    process.env.BOOKING_REMINDER_WORKER_ENABLED = 'true'
  })

  beforeEach(async () => {
    jest.clearAllMocks()

    mockSendEmail = jest.fn().mockImplementation(() => Promise.resolve()) as jest.Mock &
      typeof sendEmail
    mockCronSchedule = jest.fn().mockReturnValue({
      stop: jest.fn(),
    }) as any

    // Insert a test booking starting in 24h, with no reminder sent yet
    // Epoch must be divisible by 60 (check_all_times_in_mins constraint)
    const startEpoch = (Math.floor(dayjs().add(24, 'hour').unix() / 60) * 60).toString()
    const endEpoch = (Math.floor(dayjs().add(25, 'hour').unix() / 60) * 60).toString()

    // Defensive cleanup before inserting:
    // 1. Remove any leftover rm* bookings from a previous interrupted test run.
    // 2. Remove any stl* test-data bookings (V120__bookings.sql generates stl1-stl20
    //    with times relative to current_date that can overlap with our 24h window).
    await db
      .deleteFrom('schedule.bookings')
      .where(eb =>
        eb.or([
          eb('booking_id', 'like', 'rm%'),
          eb.and([
            eb('booking_id', 'like', 'stl%'),
            eb('start_time_epoch', '<=', endEpoch),
            eb('end_time_epoch', '>=', startEpoch),
          ]),
        ]),
      )
      .execute()

    // booking_id is varchar(9) — keep it short: 'rm' prefix + zero-padded counter
    testBookingId = `rm${String(++bookingCounter).padStart(7, '0')}`

    await db
      .insertInto('schedule.bookings')
      .values({
        booking_id: testBookingId,
        member_id: testMemberId,
        registration: 'OH-STL',
        booking_type: 'PRIVATE',
        booking_status: 'CONFIRMED',
        start_time_epoch: startEpoch,
        end_time_epoch: endEpoch,
        reminder_sent_at: null,
        created_by: 'k1mnimda',
        updated_by: 'k1mnimda',
      })
      .execute()
  })

  afterEach(async () => {
    if (testBookingId) {
      await db.deleteFrom('schedule.bookings').where('booking_id', '=', testBookingId).execute()
    }
  })

  describe('Worker Initialization', () => {
    it('should schedule task when worker is enabled', async () => {
      const { startBookingReminderWorker } = await import(
        '../../src/workers/bookingReminderWorker.ts'
      )

      const worker = startBookingReminderWorker({
        sendEmailFn: mockSendEmail,
        cronSchedule: mockCronSchedule,
      })

      expect(mockCronSchedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function))

      worker.stop()
    })

    it('should not schedule task when worker is disabled', async () => {
      process.env.BOOKING_REMINDER_WORKER_ENABLED = 'false'

      jest.resetModules()

      const { startBookingReminderWorker } = await import(
        '../../src/workers/bookingReminderWorker.ts'
      )

      const worker = startBookingReminderWorker({
        sendEmailFn: mockSendEmail,
        cronSchedule: mockCronSchedule,
      })

      expect(mockCronSchedule).not.toHaveBeenCalled()

      worker.stop()

      process.env.BOOKING_REMINDER_WORKER_ENABLED = 'true'
    })
  })

  describe('claimUpcomingBookingsForReminder', () => {
    it('should find and claim a booking starting in ~24 hours', async () => {
      const claimed = await claimUpcomingBookingsForReminder()

      const testBooking = claimed.find(b => b.bookingId === testBookingId)
      expect(testBooking).toBeDefined()
      expect(testBooking?.memberId).toBe(testMemberId)
      expect(testBooking?.status).toBe('CONFIRMED')
    })

    it('should not return the same booking twice (atomic claim prevents duplicates)', async () => {
      const firstClaim = await claimUpcomingBookingsForReminder()
      expect(firstClaim.find(b => b.bookingId === testBookingId)).toBeDefined()

      // Second call must not return the already-claimed booking
      const secondClaim = await claimUpcomingBookingsForReminder()
      expect(secondClaim.find(b => b.bookingId === testBookingId)).toBeUndefined()
    })

    it('should not claim bookings already having reminder_sent_at set', async () => {
      // Pre-stamp the reminder
      await db
        .updateTable('schedule.bookings')
        .set({ reminder_sent_at: new Date().toISOString() })
        .where('booking_id', '=', testBookingId)
        .execute()

      const claimed = await claimUpcomingBookingsForReminder()
      expect(claimed.find(b => b.bookingId === testBookingId)).toBeUndefined()
    })

    it('should not claim CANCELLED bookings', async () => {
      await db
        .updateTable('schedule.bookings')
        .set({
          booking_status: 'CANCELLED',
          cancelled_at: new Date().toISOString(),
          cancelled_by: 'k1mnimda',
        })
        .where('booking_id', '=', testBookingId)
        .execute()

      const claimed = await claimUpcomingBookingsForReminder()
      expect(claimed.find(b => b.bookingId === testBookingId)).toBeUndefined()
    })

    it('should not claim bookings starting outside the ±1h window', async () => {
      // Move booking to 48h from now (outside the default 23h–25h window)
      const farEpoch = (Math.floor(dayjs().add(48, 'hour').unix() / 60) * 60).toString()
      const farEndEpoch = (Math.floor(dayjs().add(49, 'hour').unix() / 60) * 60).toString()
      await db
        .updateTable('schedule.bookings')
        .set({ start_time_epoch: farEpoch, end_time_epoch: farEndEpoch })
        .where('booking_id', '=', testBookingId)
        .execute()

      const claimed = await claimUpcomingBookingsForReminder()
      expect(claimed.find(b => b.bookingId === testBookingId)).toBeUndefined()
    })

    it('should claim a booking in the window when hoursBeforeBooking is customized', async () => {
      // Move booking to 48h from now - within the 47h–49h window when hoursBeforeBooking=48
      const farEpoch = (Math.floor(dayjs().add(48, 'hour').unix() / 60) * 60).toString()
      const farEndEpoch = (Math.floor(dayjs().add(49, 'hour').unix() / 60) * 60).toString()
      await db
        .updateTable('schedule.bookings')
        .set({ start_time_epoch: farEpoch, end_time_epoch: farEndEpoch })
        .where('booking_id', '=', testBookingId)
        .execute()

      // With default 24h window, the 48h booking should not be found
      const defaultClaim = await claimUpcomingBookingsForReminder(24)
      expect(defaultClaim.find(b => b.bookingId === testBookingId)).toBeUndefined()

      // With 48h window, it should be found
      const customClaim = await claimUpcomingBookingsForReminder(48)
      expect(customClaim.find(b => b.bookingId === testBookingId)).toBeDefined()
    })
  })
})
