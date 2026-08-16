import { jest } from '@jest/globals'
import { db } from '../../src/db/connection.ts'
import type { sendEmail } from '../../src/lib/sendGmail.ts'

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

// Import modules AFTER setting up mocks
import {
  getJuniorMembersTurning18Today,
  promoteMemberToFlying,
} from '../../src/db/member-queries.ts'
import { processJuniorPromotions } from '../../src/workers/juniorMemberPromotionWorker.ts'
import { MIKMemberTypes } from '@mik/contracts/members'
import type { ScheduledTask, TaskFn, TaskOptions } from 'node-cron'

/** Format a Date as YYYY-MM-DD using local time (avoids UTC offset shifting the date). */
const toLocalDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('Junior Member Promotion Worker', () => {
  // Use Pekka1 as the test JUNIOR member (approved in V80__ApproveMembers.sql)
  const testMemberId = 'Pekka1'
  let mockCronSchedule: jest.Mock<
    (expression: string, func: string | TaskFn, options?: TaskOptions) => ScheduledTask
  >

  beforeAll(async () => {
    process.env.JUNIOR_PROMOTION_WORKER_ENABLED = 'true'
    process.env.JUNIOR_PROMOTION_WORKER_RUN_ON_STARTUP = 'false'
  })

  beforeEach(async () => {
    jest.clearAllMocks()

    mockCronSchedule = jest.fn().mockReturnValue({
      stop: jest.fn(),
    }) as any

    // Reset test member to JUNIOR with is_membership_expired = false
    // Note: is_membership_approved is a generated column (cannot be set directly)
    await db
      .updateTable('member.register')
      .set({
        memberType: MIKMemberTypes.JUNIOR,
        isMembershipExpired: false,
        updatedBy: 'k1mnimda',
      })
      .where('memberId', '=', testMemberId)
      .execute()
  })

  afterEach(async () => {
    // Restore test member to its original JUNIOR state
    await db
      .updateTable('member.register')
      .set({
        memberType: MIKMemberTypes.JUNIOR,
        isMembershipExpired: false,
        updatedBy: 'k1mnimda',
      })
      .where('memberId', '=', testMemberId)
      .execute()
  })

  describe('Worker Initialization', () => {
    it('should schedule task when worker is enabled', async () => {
      const { startJuniorMemberPromotionWorker } =
        await import('../../src/workers/juniorMemberPromotionWorker.ts')

      const worker = startJuniorMemberPromotionWorker({
        sendEmailFn: mockSendEmail,
        cronSchedule: mockCronSchedule,
      })

      expect(mockCronSchedule).toHaveBeenCalledWith('0 7 * * *', expect.any(Function))

      worker.stop()
    })

    it('should not schedule task when worker is disabled', async () => {
      process.env.JUNIOR_PROMOTION_WORKER_ENABLED = 'false'

      // Clear module cache to re-import with new env var
      jest.resetModules()

      const { startJuniorMemberPromotionWorker } =
        await import('../../src/workers/juniorMemberPromotionWorker.ts')

      const worker = startJuniorMemberPromotionWorker({
        sendEmailFn: mockSendEmail,
        cronSchedule: mockCronSchedule,
      })

      expect(mockCronSchedule).not.toHaveBeenCalled()

      worker.stop()

      // Restore env var
      process.env.JUNIOR_PROMOTION_WORKER_ENABLED = 'true'
    })
  })

  describe('Database Queries', () => {
    it('should find JUNIOR member whose 18th birthday is today', async () => {
      // Set date_of_birth so member turns exactly 18 today
      const today = new Date()
      const dob = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
      const dobStr = toLocalDateStr(dob)

      await db
        .updateTable('member.register')
        .set({ dateOfBirth: dobStr, updatedBy: 'k1mnimda' })
        .where('memberId', '=', testMemberId)
        .execute()

      const members = await getJuniorMembersTurning18Today()

      const found = members.find((m) => m.memberId === testMemberId)
      expect(found).toBeDefined()
      expect(found?.memberId).toBe(testMemberId)
    })

    it('should not find JUNIOR member whose birthday is not today', async () => {
      // Set date_of_birth to yesterday 18 years ago
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const dob = new Date(yesterday.getFullYear() - 18, yesterday.getMonth(), yesterday.getDate())
      const dobStr = toLocalDateStr(dob)

      await db
        .updateTable('member.register')
        .set({ dateOfBirth: dobStr, updatedBy: 'k1mnimda' })
        .where('memberId', '=', testMemberId)
        .execute()

      const members = await getJuniorMembersTurning18Today()

      const found = members.find((m) => m.memberId === testMemberId)
      expect(found).toBeUndefined()
    })

    it('should not find FLYING member even if birthday is today', async () => {
      // Set member to FLYING type
      const today = new Date()
      const dob = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
      const dobStr = toLocalDateStr(dob)

      await db
        .updateTable('member.register')
        .set({
          memberType: MIKMemberTypes.FLYING,
          dateOfBirth: dobStr,
          updatedBy: 'k1mnimda',
        })
        .where('memberId', '=', testMemberId)
        .execute()

      const members = await getJuniorMembersTurning18Today()

      const found = members.find((m) => m.memberId === testMemberId)
      expect(found).toBeUndefined()
    })

    it('should not find JUNIOR member turning 17 today (not 18)', async () => {
      // Set date_of_birth so member turns 17 today
      const today = new Date()
      const dob = new Date(today.getFullYear() - 17, today.getMonth(), today.getDate())
      const dobStr = toLocalDateStr(dob)

      await db
        .updateTable('member.register')
        .set({ dateOfBirth: dobStr, updatedBy: 'k1mnimda' })
        .where('memberId', '=', testMemberId)
        .execute()

      const members = await getJuniorMembersTurning18Today()

      const found = members.find((m) => m.memberId === testMemberId)
      expect(found).toBeUndefined()
    })

    it('should not find unapproved JUNIOR member turning 18 today', async () => {
      const unapprovedMemberId = 'Sanna1'
      const today = new Date()
      const dob = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
      const dobStr = toLocalDateStr(dob)

      // Capture current approval state so we can restore it unconditionally
      const original = await db
        .selectFrom('member.register')
        .select(['dateOfBirth', 'membershipApprovedAt', 'membershipApprovedBy'])
        .where('memberId', '=', unapprovedMemberId)
        .executeTakeFirstOrThrow()

      try {
        // Explicitly revoke approval + set birthday to today-18y so the only reason
        // for exclusion is is_membership_approved = false
        await db
          .updateTable('member.register')
          .set({
            dateOfBirth: dobStr,
            membershipApprovedAt: null,
            membershipApprovedBy: null,
            updatedBy: 'k1mnimda',
          })
          .where('memberId', '=', unapprovedMemberId)
          .execute()

        const members = await getJuniorMembersTurning18Today()

        const found = members.find((m) => m.memberId === unapprovedMemberId)
        expect(found).toBeUndefined()
      } finally {
        // Restore original state so subsequent tests are not affected
        await db
          .updateTable('member.register')
          .set({
            dateOfBirth: original.dateOfBirth,
            membershipApprovedAt: original.membershipApprovedAt,
            membershipApprovedBy: original.membershipApprovedBy,
            updatedBy: 'k1mnimda',
          })
          .where('memberId', '=', unapprovedMemberId)
          .execute()
      }
    })

    it('should not find expired JUNIOR member turning 18 today', async () => {
      const today = new Date()
      const dob = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
      const dobStr = toLocalDateStr(dob)

      await db
        .updateTable('member.register')
        .set({
          dateOfBirth: dobStr,
          isMembershipExpired: true,
          updatedBy: 'k1mnimda',
        })
        .where('memberId', '=', testMemberId)
        .execute()

      const members = await getJuniorMembersTurning18Today()

      const found = members.find((m) => m.memberId === testMemberId)
      expect(found).toBeUndefined()
    })
  })

  describe('promoteMemberToFlying', () => {
    it('should update member_type from JUNIOR to FLYING', async () => {
      await promoteMemberToFlying(testMemberId)

      const member = await db
        .selectFrom('member.register')
        .select(['memberType', 'updatedBy'])
        .where('memberId', '=', testMemberId)
        .executeTakeFirstOrThrow()

      expect(member.memberType).toBe(MIKMemberTypes.FLYING)
      expect(member.updatedBy).toBe('k1mnimda')
    })
  })

  describe('processJuniorPromotions', () => {
    it('should promote member and send email when member turns 18 today', async () => {
      const today = new Date()
      const dob = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
      const dobStr = toLocalDateStr(dob)

      await db
        .updateTable('member.register')
        .set({ dateOfBirth: dobStr, updatedBy: 'k1mnimda' })
        .where('memberId', '=', testMemberId)
        .execute()

      await processJuniorPromotions(mockSendEmail)

      // Check member was promoted
      const member = await db
        .selectFrom('member.register')
        .select('memberType')
        .where('memberId', '=', testMemberId)
        .executeTakeFirstOrThrow()

      expect(member.memberType).toBe(MIKMemberTypes.FLYING)

      // Check email was sent
      expect(mockSendEmail).toHaveBeenCalledTimes(1)
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('MIK'),
        expect.any(String),
      )
    })

    it('should not promote or email when no member turns 18 today', async () => {
      // Set date_of_birth so nobody turns 18 today
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dob = new Date(tomorrow.getFullYear() - 18, tomorrow.getMonth(), tomorrow.getDate())
      const dobStr = toLocalDateStr(dob)

      await db
        .updateTable('member.register')
        .set({ dateOfBirth: dobStr, updatedBy: 'k1mnimda' })
        .where('memberId', '=', testMemberId)
        .execute()

      await processJuniorPromotions(mockSendEmail)

      // No email should be sent
      expect(mockSendEmail).not.toHaveBeenCalled()

      // Member should still be JUNIOR
      const member = await db
        .selectFrom('member.register')
        .select('memberType')
        .where('memberId', '=', testMemberId)
        .executeTakeFirstOrThrow()

      expect(member.memberType).toBe(MIKMemberTypes.JUNIOR)
    })
  })
})
