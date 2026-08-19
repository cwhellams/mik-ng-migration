import { jest } from '@jest/globals'
import type { ScheduledTask, TaskContext, TaskFn, TaskOptions } from 'node-cron'
import { sendEmail } from '../../src/lib/sendGmail.ts'
import { db } from '../../src/db/connection.ts'

describe('Occurrence Notifying Worker', () => {
  let mockSendEmail: jest.Mock & typeof sendEmail
  let mockCronSchedule: jest.Mock<
    (expression: string, func: string | TaskFn, options?: TaskOptions) => ScheduledTask
  >

  beforeAll(async () => {
    // Set environment variables for testing
    process.env.OCCURRENCE_NOTIFICATION_WORKER_ENABLED = 'true'
  })

  beforeEach(async () => {
    jest.clearAllMocks()

    // Initialize mocks
    mockSendEmail = jest.fn().mockImplementation(() => Promise.resolve()) as jest.Mock &
      typeof sendEmail
    mockCronSchedule = jest
      .fn<(expression: string, func: string | TaskFn, options?: TaskOptions) => ScheduledTask>()
      .mockImplementation((_expression, func) => {
        // execute the schedule function immediately
        ;(func as TaskFn)({} as TaskContext)

        return { stop: jest.fn() } as unknown as ScheduledTask
      })
  })

  afterEach(async () => {
    // The worker marks pending occurrences as notified as a side effect; reset
    // that so shared test data stays pristine for other tests/re-runs.
    await db
      .updateTable('flight.occurrences')
      .set({ notifiedStatus: null, notifiedAt: null })
      .where('reportId', 'like', 'SMS%')
      .execute()
  })

  describe('Worker Initialization', () => {
    it('should schedule task when worker is enabled, and not re-send on a later run', async () => {
      const { startOccurrenceNotificationWorker } =
        await import('../../src/workers/occurrenceNotifyWorker.ts')

      const worker = startOccurrenceNotificationWorker({
        sendEmailFn: mockSendEmail,
        cronSchedule: mockCronSchedule,
      })

      // wait the scheduled task run (allow extra time for DB queries on slow CI)
      await new Promise((resolve) => setTimeout(resolve, 5000))

      expect(mockCronSchedule).toHaveBeenCalledWith('0 7 * * *', expect.any(Function))

      // 2 processors and 2 occurences + 1 occurrence for managers
      expect(mockSendEmail).toHaveBeenCalledTimes(5)

      worker.stop()

      // A later run (e.g. the next day's cron tick) must not re-send the same
      // notifications, since none of the occurrences changed status.
      mockSendEmail.mockClear()

      const laterWorker = startOccurrenceNotificationWorker({
        sendEmailFn: mockSendEmail,
        cronSchedule: mockCronSchedule,
      })
      await new Promise((resolve) => setTimeout(resolve, 5000))
      expect(mockSendEmail).not.toHaveBeenCalled()
      laterWorker.stop()
    }, 20000)

    it('should not schedule task when worker is disabled', async () => {
      process.env.OCCURRENCE_NOTIFICATION_WORKER_ENABLED = 'false'

      // Clear module cache to re-import with new env var
      jest.resetModules()

      const { startOccurrenceNotificationWorker } =
        await import('../../src/workers/occurrenceNotifyWorker.ts')

      const worker = startOccurrenceNotificationWorker({
        sendEmailFn: mockSendEmail,
        cronSchedule: mockCronSchedule,
      })

      expect(mockCronSchedule).not.toHaveBeenCalled()
      expect(mockSendEmail).not.toHaveBeenCalled()

      worker.stop()

      // Restore env var
      process.env.OCCURRENCE_NOTIFICATION_WORKER_ENABLED = 'true'
    })
  })
})
