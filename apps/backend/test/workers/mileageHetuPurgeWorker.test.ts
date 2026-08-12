import { jest } from '@jest/globals'
import { db } from '../../src/db/connection.ts'
import { ExpenseClaimStatus } from '@mik/contracts/expenses'

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
import { purgeExpiredHetu } from '../../src/db/mileage-queries.ts'
import { processMileageHetuPurge } from '../../src/workers/mileageHetuPurgeWorker.ts'
import type { ScheduledTask, TaskFn, TaskOptions } from 'node-cron'

const MEMBER_ID = 'Juha1'

describe('Mileage HETU Purge Worker', () => {
  let mockCronSchedule: jest.Mock<
    (expression: string, func: string | TaskFn, options?: TaskOptions) => ScheduledTask
  >

  beforeAll(async () => {
    process.env.MILEAGE_HETU_PURGE_WORKER_ENABLED = 'true'
    process.env.MILEAGE_HETU_PURGE_WORKER_RUN_ON_STARTUP = 'false'
  })

  beforeEach(() => {
    jest.clearAllMocks()

    mockCronSchedule = jest.fn().mockReturnValue({
      stop: jest.fn(),
    }) as any
  })

  describe('Worker Initialization', () => {
    it('should schedule task when worker is enabled', async () => {
      const { startMileageHetuPurgeWorker } =
        await import('../../src/workers/mileageHetuPurgeWorker.ts')

      const worker = startMileageHetuPurgeWorker({ cronSchedule: mockCronSchedule })

      expect(mockCronSchedule).toHaveBeenCalledWith('0 3 * * *', expect.any(Function))

      worker.stop()
    })

    it('should not schedule task when worker is disabled', async () => {
      process.env.MILEAGE_HETU_PURGE_WORKER_ENABLED = 'false'

      jest.resetModules()

      const { startMileageHetuPurgeWorker } =
        await import('../../src/workers/mileageHetuPurgeWorker.ts')

      const worker = startMileageHetuPurgeWorker({ cronSchedule: mockCronSchedule })

      expect(mockCronSchedule).not.toHaveBeenCalled()

      worker.stop()

      process.env.MILEAGE_HETU_PURGE_WORKER_ENABLED = 'true'
    })
  })

  describe('purgeExpiredHetu', () => {
    const insertedClaimIds: string[] = []

    afterEach(async () => {
      if (insertedClaimIds.length > 0) {
        await db.deleteFrom('accts.expense_claim').where('id', 'in', insertedClaimIds).execute()
        insertedClaimIds.length = 0
      }
    })

    async function insertMileageClaim(approvedAt: Date | null): Promise<string> {
      const category = await db
        .selectFrom('accts.expense_category')
        .select('id')
        .where('code', '=', 'mileage')
        .executeTakeFirstOrThrow()

      const claim = await db
        .insertInto('accts.expense_claim')
        .values({
          member_id: MEMBER_ID,
          category_id: category.id,
          title: 'HETU purge test',
          status: approvedAt ? ExpenseClaimStatus.APPROVED : ExpenseClaimStatus.SUBMITTED,
          approved_at: approvedAt,
          approved_by: approvedAt ? MEMBER_ID : null,
          hetu_encrypted: 'dummy-ciphertext',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('accts.expense_mileage_detail')
        .values({
          claim_id: claim.id,
          route: 'HOME - ROS - HOME',
          journey_date: '2026-07-16',
          distance_km: 99,
          rate_per_km: 0.275,
        })
        .execute()

      return claim.id
    }

    it('purges HETU on claims approved more than 7 days ago', async () => {
      const oldClaimId = await insertMileageClaim(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000))
      insertedClaimIds.push(oldClaimId)

      const purged = await purgeExpiredHetu()
      expect(purged).toBeGreaterThanOrEqual(1)

      const claim = await db
        .selectFrom('accts.expense_claim')
        .select('hetu_encrypted')
        .where('id', '=', oldClaimId)
        .executeTakeFirstOrThrow()
      expect(claim.hetu_encrypted).toBeNull()
    })

    it('does not purge HETU on claims approved less than 7 days ago', async () => {
      const recentClaimId = await insertMileageClaim(new Date(Date.now() - 60_000))
      insertedClaimIds.push(recentClaimId)

      await purgeExpiredHetu()

      const claim = await db
        .selectFrom('accts.expense_claim')
        .select('hetu_encrypted')
        .where('id', '=', recentClaimId)
        .executeTakeFirstOrThrow()
      expect(claim.hetu_encrypted).toBe('dummy-ciphertext')
    })

    it('does not purge HETU on unapproved claims', async () => {
      const unapprovedClaimId = await insertMileageClaim(null)
      insertedClaimIds.push(unapprovedClaimId)

      await purgeExpiredHetu()

      const claim = await db
        .selectFrom('accts.expense_claim')
        .select('hetu_encrypted')
        .where('id', '=', unapprovedClaimId)
        .executeTakeFirstOrThrow()
      expect(claim.hetu_encrypted).toBe('dummy-ciphertext')
    })
  })

  describe('processMileageHetuPurge', () => {
    it('does not throw when there is nothing to purge', async () => {
      await expect(processMileageHetuPurge()).resolves.toBeUndefined()
    })
  })
})
