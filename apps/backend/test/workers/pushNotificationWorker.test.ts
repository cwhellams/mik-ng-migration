import { jest } from '@jest/globals'
import type { Selectable } from 'kysely'
import { db } from '../../src/db/connection.ts'
import type { ScheduleBookings } from '../../src/db/schema.d.ts'
import dayjs from 'dayjs'

type SavedBooking = Omit<
  Selectable<ScheduleBookings>,
  'calendarSequence' | 'startTimeUtc' | 'endTimeUtc'
>

// Mock the logger
jest.mock('../../src/lib/logger.ts', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

// Mock web-push sending
jest.mock('../../src/lib/webPush.ts', () => ({
  sendWebPush: jest.fn(),
}))

// Import modules AFTER setting up mocks
import { claimUpcomingBookingsForPushReminder } from '../../src/db/push-queries.ts'
import { sendWebPush } from '../../src/lib/webPush.ts'
import type { ScheduledTask, TaskFn, TaskOptions } from 'node-cron'

describe('Push Notification Worker', () => {
  const testMemberId = 'Matti1'
  let testBookingId: string
  let mockSendWebPush: jest.Mock & typeof sendWebPush
  let mockCronSchedule: jest.Mock<
    (expression: string, func: string | TaskFn, options?: TaskOptions) => ScheduledTask
  >
  let bookingCounter = 0
  let savedStlBookings: SavedBooking[] = []

  beforeAll(async () => {
    process.env.PUSH_NOTIFICATION_WORKER_ENABLED = 'true'
  })

  beforeEach(async () => {
    jest.clearAllMocks()

    mockSendWebPush = jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ok: true })) as jest.Mock & typeof sendWebPush
    mockCronSchedule = jest.fn().mockReturnValue({
      stop: jest.fn(),
    }) as any

    // Insert a test booking starting in 1h, no push reminder sent yet.
    // Epoch must be divisible by 60 (check_all_times_in_mins constraint)
    const startEpoch = (Math.floor(dayjs().add(1, 'hour').unix() / 60) * 60).toString()
    const endEpoch = (Math.floor(dayjs().add(2, 'hour').unix() / 60) * 60).toString()
    // Some tests move the booking to ~5h from now; pre-clear that window too.
    const farStartEpoch = (Math.floor(dayjs().add(5, 'hour').unix() / 60) * 60).toString()
    const farEndEpoch = (Math.floor(dayjs().add(6, 'hour').unix() / 60) * 60).toString()

    savedStlBookings = await db
      .selectFrom('schedule.bookings')
      .select([
        'bookingId',
        'memberId',
        'registration',
        'bookingType',
        'bookingStatus',
        'startTimeEpoch',
        'endTimeEpoch',
        'instructorMemberId',
        'cancellationNote',
        'cancellationReason',
        'cancelledAt',
        'cancelledBy',
        'description',
        'reminderSentAt',
        'createdBy',
        'createdAt',
        'updatedBy',
        'updatedAt',
      ])
      .where((eb) =>
        eb.and([
          eb('bookingId', 'like', 'stl%'),
          eb.or([
            eb.and([eb('startTimeEpoch', '<', endEpoch), eb('endTimeEpoch', '>', startEpoch)]),
            eb.and([
              eb('startTimeEpoch', '<', farEndEpoch),
              eb('endTimeEpoch', '>', farStartEpoch),
            ]),
          ]),
        ]),
      )
      .execute()

    await db
      .deleteFrom('schedule.bookings')
      .where((eb) =>
        eb.or([
          eb('bookingId', 'like', 'pn%'),
          eb.and([
            eb('bookingId', 'like', 'stl%'),
            eb.or([
              eb.and([eb('startTimeEpoch', '<', endEpoch), eb('endTimeEpoch', '>', startEpoch)]),
              eb.and([
                eb('startTimeEpoch', '<', farEndEpoch),
                eb('endTimeEpoch', '>', farStartEpoch),
              ]),
            ]),
          ]),
        ]),
      )
      .execute()

    // booking_id is varchar(9) — keep it short: 'pn' prefix + zero-padded counter
    testBookingId = `pn${String(++bookingCounter).padStart(7, '0')}`

    await db
      .insertInto('schedule.bookings')
      .values({
        bookingId: testBookingId,
        memberId: testMemberId,
        registration: 'OH-STL',
        bookingType: 'PRIVATE',
        bookingStatus: 'CONFIRMED',
        startTimeEpoch: startEpoch,
        endTimeEpoch: endEpoch,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()
  })

  afterEach(async () => {
    if (testBookingId) {
      // Deleting the booking cascades to schedule.push_reminder_log via FK.
      await db.deleteFrom('schedule.bookings').where('bookingId', '=', testBookingId).execute()
    }
    if (savedStlBookings.length > 0) {
      await db.insertInto('schedule.bookings').values(savedStlBookings).execute()
      savedStlBookings = []
    }
  })

  describe('Worker Initialization', () => {
    it('should schedule task when worker is enabled', async () => {
      const { startPushNotificationWorker } =
        await import('../../src/workers/pushNotificationWorker.ts')

      const worker = startPushNotificationWorker({
        sendWebPushFn: mockSendWebPush,
        cronSchedule: mockCronSchedule,
      })

      expect(mockCronSchedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function))

      worker.stop()
    })

    it('should not schedule task when worker is disabled', async () => {
      process.env.PUSH_NOTIFICATION_WORKER_ENABLED = 'false'

      jest.resetModules()

      const { startPushNotificationWorker } =
        await import('../../src/workers/pushNotificationWorker.ts')

      const worker = startPushNotificationWorker({
        sendWebPushFn: mockSendWebPush,
        cronSchedule: mockCronSchedule,
      })

      expect(mockCronSchedule).not.toHaveBeenCalled()

      worker.stop()

      process.env.PUSH_NOTIFICATION_WORKER_ENABLED = 'true'
    })
  })

  describe('claimUpcomingBookingsForPushReminder', () => {
    it('should find and claim a booking starting in ~1 hour', async () => {
      const claimed = await claimUpcomingBookingsForPushReminder()

      const testBooking = claimed.find((b) => b.bookingId === testBookingId)
      expect(testBooking).toBeDefined()
      expect(testBooking?.memberId).toBe(testMemberId)
    })

    it('should not return the same booking twice (atomic claim prevents duplicates)', async () => {
      const firstClaim = await claimUpcomingBookingsForPushReminder()
      expect(firstClaim.find((b) => b.bookingId === testBookingId)).toBeDefined()

      const secondClaim = await claimUpcomingBookingsForPushReminder()
      expect(secondClaim.find((b) => b.bookingId === testBookingId)).toBeUndefined()
    })

    it('should not claim CANCELLED bookings', async () => {
      await db
        .updateTable('schedule.bookings')
        .set({
          bookingStatus: 'CANCELLED',
          cancelledAt: new Date().toISOString(),
          cancelledBy: 'k1mnimda',
        })
        .where('bookingId', '=', testBookingId)
        .execute()

      const claimed = await claimUpcomingBookingsForPushReminder()
      expect(claimed.find((b) => b.bookingId === testBookingId)).toBeUndefined()
    })

    it('should not claim bookings starting outside the +/-1h window', async () => {
      const farEpoch = (Math.floor(dayjs().add(5, 'hour').unix() / 60) * 60).toString()
      const farEndEpoch = (Math.floor(dayjs().add(6, 'hour').unix() / 60) * 60).toString()
      await db
        .updateTable('schedule.bookings')
        .set({ startTimeEpoch: farEpoch, endTimeEpoch: farEndEpoch })
        .where('bookingId', '=', testBookingId)
        .execute()

      const claimed = await claimUpcomingBookingsForPushReminder()
      expect(claimed.find((b) => b.bookingId === testBookingId)).toBeUndefined()
    })
  })
})
