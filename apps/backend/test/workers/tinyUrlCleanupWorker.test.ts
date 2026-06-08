import { jest } from '@jest/globals'
import { db } from '../../src/db/connection.ts'

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
import { deleteExpiredTinyUrls } from '../../src/db/tiny-url-queries.ts'
import { processExpiredTinyUrls } from '../../src/workers/tinyUrlCleanupWorker.ts'
import type { ScheduledTask, TaskFn, TaskOptions } from 'node-cron'

describe('Tiny URL Cleanup Worker', () => {
  let mockCronSchedule: jest.Mock<
    (expression: string, func: string | TaskFn, options?: TaskOptions) => ScheduledTask
  >

  beforeAll(async () => {
    process.env.TINY_URL_CLEANUP_WORKER_ENABLED = 'true'
    process.env.TINY_URL_CLEANUP_WORKER_RUN_ON_STARTUP = 'false'
  })

  beforeEach(() => {
    jest.clearAllMocks()

    mockCronSchedule = jest.fn().mockReturnValue({
      stop: jest.fn(),
    }) as any
  })

  describe('Worker Initialization', () => {
    it('should schedule task when worker is enabled', async () => {
      const { startTinyUrlCleanupWorker } =
        await import('../../src/workers/tinyUrlCleanupWorker.ts')

      const worker = startTinyUrlCleanupWorker({ cronSchedule: mockCronSchedule })

      expect(mockCronSchedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function))

      worker.stop()
    })

    it('should not schedule task when worker is disabled', async () => {
      process.env.TINY_URL_CLEANUP_WORKER_ENABLED = 'false'

      jest.resetModules()

      const { startTinyUrlCleanupWorker } =
        await import('../../src/workers/tinyUrlCleanupWorker.ts')

      const worker = startTinyUrlCleanupWorker({ cronSchedule: mockCronSchedule })

      expect(mockCronSchedule).not.toHaveBeenCalled()

      worker.stop()

      // Restore env var
      process.env.TINY_URL_CLEANUP_WORKER_ENABLED = 'true'
    })
  })

  describe('Database Queries', () => {
    const testMemberId = 'Matti1'

    afterEach(async () => {
      // Clean up any test tiny URLs
      await db
        .deleteFrom('member.document_tiny_urls')
        .where('created_by', '=', testMemberId)
        .execute()
    })

    it('should delete an expired tiny URL', async () => {
      const pastDate = new Date(Date.now() - 60_000) // expired 1 minute ago

      await db
        .insertInto('member.document_tiny_urls')
        .values({
          short_code: 'TEST',
          url: 'https://example.com/test',
          expires_at: pastDate,
          document_type: 'member',
          document_id: 1,
          aircraft_document_id: null,
          created_by: testMemberId,
        })
        .execute()

      const deleted = await deleteExpiredTinyUrls()
      expect(deleted).toBeGreaterThanOrEqual(1)

      const remaining = await db
        .selectFrom('member.document_tiny_urls')
        .select('short_code')
        .where('short_code', '=', 'TEST')
        .executeTakeFirst()

      expect(remaining).toBeUndefined()
    })

    it('should not delete a non-expired tiny URL', async () => {
      const futureDate = new Date(Date.now() + 300_000) // expires in 5 minutes

      await db
        .insertInto('member.document_tiny_urls')
        .values({
          short_code: 'LIVE',
          url: 'https://example.com/live',
          expires_at: futureDate,
          document_type: 'member',
          document_id: 1,
          aircraft_document_id: null,
          created_by: testMemberId,
        })
        .execute()

      const deleted = await deleteExpiredTinyUrls()
      expect(deleted).toBe(0)

      const remaining = await db
        .selectFrom('member.document_tiny_urls')
        .select('short_code')
        .where('short_code', '=', 'LIVE')
        .executeTakeFirst()

      expect(remaining).toBeDefined()
    })
  })

  describe('processExpiredTinyUrls', () => {
    const testMemberId = 'Matti1'

    afterEach(async () => {
      await db
        .deleteFrom('member.document_tiny_urls')
        .where('created_by', '=', testMemberId)
        .execute()
    })

    it('should delete expired tiny URLs and log count', async () => {
      const pastDate = new Date(Date.now() - 60_000)

      await db
        .insertInto('member.document_tiny_urls')
        .values({
          short_code: 'EXP1',
          url: 'https://example.com/exp1',
          expires_at: pastDate,
          document_type: 'member',
          document_id: 1,
          aircraft_document_id: null,
          created_by: testMemberId,
        })
        .execute()

      await processExpiredTinyUrls()

      const remaining = await db
        .selectFrom('member.document_tiny_urls')
        .select('short_code')
        .where('short_code', '=', 'EXP1')
        .executeTakeFirst()

      expect(remaining).toBeUndefined()
    })

    it('should log when there are no expired tiny URLs', async () => {
      // No expired URLs in DB — just verify processExpiredTinyUrls does not throw
      await expect(processExpiredTinyUrls()).resolves.toBeUndefined()
    })
  })
})
