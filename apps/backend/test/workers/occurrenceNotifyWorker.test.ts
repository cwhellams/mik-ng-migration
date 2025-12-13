import { jest } from '@jest/globals'
import type { ScheduledTask, TaskContext, TaskFn, TaskOptions } from 'node-cron'

describe('Occurrence Notifying Worker', () => {
  let mockSendEmail: jest.Mock
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
    mockSendEmail = jest.fn() as jest.Mock
    mockCronSchedule = jest
      .fn<(expression: string, func: string | TaskFn, options?: TaskOptions) => ScheduledTask>()
      .mockImplementation((_expression, func) => {
        // execute the schedule function immediately
        ;(func as TaskFn)({} as TaskContext)

        return { stop: jest.fn() } as unknown as ScheduledTask
      })
  })

  describe('Worker Initialization', () => {
    it('should schedule task when worker is enabled', async () => {
      const { startOccurrenceNotificationWorker } = await import(
        '../../src/workers/occurrenceNotifyWorker.ts'
      )

      const worker = startOccurrenceNotificationWorker({
        sendEmailFn: mockSendEmail,
        cronSchedule: mockCronSchedule,
      })

      // wait the scheduled task run
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(mockCronSchedule).toHaveBeenCalledWith('0 7 * * *', expect.any(Function))

      // 2 members and 2 occurences
      expect(mockSendEmail).toHaveBeenCalledTimes(4)

      worker.stop()
    })

    it('should not schedule task when worker is disabled', async () => {
      process.env.OCCURRENCE_NOTIFICATION_WORKER_ENABLED = 'false'

      // Clear module cache to re-import with new env var
      jest.resetModules()

      const { startOccurrenceNotificationWorker } = await import(
        '../../src/workers/occurrenceNotifyWorker.ts'
      )

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
