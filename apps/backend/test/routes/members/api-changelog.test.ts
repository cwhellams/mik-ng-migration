import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import dayjs from 'dayjs'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/members/api.ts'
import {
  MemberChangeType,
  MIKLang,
  MIKMemberTypes,
  MIKPermissions,
  type MemberChangeLogEntry,
  type MemberChangeLogResponse,
} from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { db } from '../../../src/db/connection.ts'
import { addMember } from '../../../src/db/member-queries.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/members', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: ['ADMIN'],
  permissions: [MIKPermissions.MEMBER_ADMIN],
  canMakeReservations: false,
})

const memberToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'member@mik.fi',
  roles: ['MEMBER'],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
})

const today = dayjs().format('YYYY-MM-DD')
const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD')

const queryChangeLog = async (
  token: string,
  query: Record<string, unknown> = { startDate: yesterday, endDate: today },
) => request(app).get('/members/changelog').set('Cookie', `accessToken=${token}`).query(query)

describe('GET /members/changelog', () => {
  describe('authentication and validation', () => {
    it('should return 401 for an invalid token', async () => {
      const res = await request(app)
        .get('/members/changelog')
        .set('Cookie', 'accessToken=badToken')
        .query({ startDate: yesterday, endDate: today })

      expect(res.status).toBe(401)
    })

    it('should return 403 for a member without MEMBER_ADMIN', async () => {
      const res = await queryChangeLog(memberToken)

      expect(res.status).toBe(403)
    })

    it('should return 400 when the dates are missing', async () => {
      const res = await queryChangeLog(adminToken, {})

      expect(res.status).toBe(400)
    })

    it('should return 400 when startDate is after endDate', async () => {
      const res = await queryChangeLog(adminToken, { startDate: today, endDate: yesterday })

      expect(res.status).toBe(400)
    })

    it('should return 400 when the period is longer than a year', async () => {
      const res = await queryChangeLog(adminToken, {
        startDate: dayjs().subtract(2, 'year').format('YYYY-MM-DD'),
        endDate: today,
      })

      expect(res.status).toBe(400)
    })

    it('should return 400 for a malformed date', async () => {
      const res = await queryChangeLog(adminToken, { startDate: '01.01.2026', endDate: today })

      expect(res.status).toBe(400)
    })
  })

  describe('change log content', () => {
    let memberId: string
    let externalMemberId: string

    const entriesFor = (body: MemberChangeLogResponse, id: string): MemberChangeLogEntry[] =>
      body.entries.filter((entry) => entry.memberId === id)

    beforeAll(async () => {
      const now = new Date()

      // A membership that is registered, approved, changes type and finally leaves
      memberId = await addMember({
        memberType: MIKMemberTypes.JUNIOR,
        email: `changelog-test-${Date.now()}@test.com`,
        firstName: 'Changelog',
        lastName: 'TestMember',
        lang: MIKLang.FI,
        streetAddress: 'Test Street',
        postcode: '00100',
        townCity: 'Test City',
        country: 'FI',
      })

      await db
        .updateTable('member.register')
        // is_membership_approved is generated from membership_approved_by
        .set({
          membershipApprovedBy: 'k1mnimda',
          membershipApprovedAt: now,
          updatedAt: now,
          updatedBy: 'k1mnimda',
        })
        .where('memberId', '=', memberId)
        .execute()

      await db
        .updateTable('member.register')
        .set({ memberType: MIKMemberTypes.FLYING, updatedAt: now, updatedBy: 'k1mnimda' })
        .where('memberId', '=', memberId)
        .execute()

      // Background sync churn that must not show up as a registry change
      await db
        .updateTable('member.register')
        .set({ brevoSyncStatus: 'SYNCED', brevoSyncedAt: now, updatedAt: now })
        .where('memberId', '=', memberId)
        .execute()

      await db
        .updateTable('member.register')
        .set({ memberType: MIKMemberTypes.REMOVED, updatedAt: now, updatedBy: 'k1mnimda' })
        .where('memberId', '=', memberId)
        .execute()

      // A separate external contact, used to check the member type filter
      externalMemberId = await addMember({
        memberType: MIKMemberTypes.EXTERNAL,
        email: `changelog-external-${Date.now()}@test.com`,
        firstName: 'Changelog',
        lastName: 'TestExternal',
        lang: MIKLang.FI,
        streetAddress: 'Test Street',
        postcode: '00100',
        townCity: 'Test City',
        country: 'FI',
      })
    })

    afterAll(async () => {
      await db
        .deleteFrom('member.register')
        .where('memberId', 'in', [memberId, externalMemberId])
        .execute()
      await db
        .deleteFrom('member.registerAudit')
        .where('memberId', 'in', [memberId, externalMemberId])
        .execute()
    })

    it('should classify the lifecycle of a membership', async () => {
      const res = await queryChangeLog(adminToken)
      expect(res.status).toBe(200)

      const entries = entriesFor(res.body, memberId)

      // newest first
      expect(entries.map((entry) => entry.changeType)).toEqual([
        MemberChangeType.LEFT,
        MemberChangeType.TYPE_CHANGED,
        MemberChangeType.APPROVED,
        MemberChangeType.REGISTERED,
      ])

      const left = entries[0]
      expect(left).toMatchObject({
        memberId,
        firstName: 'Changelog',
        lastName: 'TestMember',
        operationType: 'UPDATE',
        memberType: MIKMemberTypes.REMOVED,
        previousMemberType: MIKMemberTypes.FLYING,
        changedFields: ['member_type'],
        changedBy: 'k1mnimda',
      })
      expect(left.changedByName).toBeTruthy()
      expect(dayjs(left.changedAt).isValid()).toBe(true)

      const registered = entries[3]
      expect(registered).toMatchObject({
        operationType: 'INSERT',
        memberType: MIKMemberTypes.JUNIOR,
        previousMemberType: null,
        changedFields: [],
      })
    })

    it('should skip updates that only touched background sync columns', async () => {
      const res = await queryChangeLog(adminToken)

      const changedFields = entriesFor(res.body, memberId).flatMap((entry) => entry.changedFields)
      expect(changedFields).not.toContain('brevo_sync_status')
      expect(changedFields).not.toContain('brevo_synced_at')
    })

    it('should summarise joins and leavers consistently with the entries', async () => {
      const res = await queryChangeLog(adminToken)
      const body = res.body as MemberChangeLogResponse

      expect(body.summary.totalChanges).toBe(body.entries.length)
      expect(body.summary.newMembers).toBe(
        body.entries.filter((e) => e.changeType === MemberChangeType.APPROVED).length,
      )
      expect(body.summary.leftMembers).toBe(
        body.entries.filter(
          (e) =>
            e.changeType === MemberChangeType.LEFT || e.changeType === MemberChangeType.DELETED,
        ).length,
      )
      // the test member contributes one join and one leave
      expect(body.summary.newMembers).toBeGreaterThanOrEqual(1)
      expect(body.summary.leftMembers).toBeGreaterThanOrEqual(1)
    })

    it('should match the member type both before and after the change', async () => {
      const asFlying = await queryChangeLog(adminToken, {
        startDate: yesterday,
        endDate: today,
        memberType: MIKMemberTypes.FLYING,
      })
      // the member left FLYING, so the change is still reported under FLYING
      expect(entriesFor(asFlying.body, memberId).map((e) => e.changeType)).toContain(
        MemberChangeType.LEFT,
      )

      const asRemoved = await queryChangeLog(adminToken, {
        startDate: yesterday,
        endDate: today,
        memberType: MIKMemberTypes.REMOVED,
      })
      expect(entriesFor(asRemoved.body, memberId).map((e) => e.changeType)).toEqual([
        MemberChangeType.LEFT,
      ])
    })

    it('should exclude members whose type does not match the filter', async () => {
      const res = await queryChangeLog(adminToken, {
        startDate: yesterday,
        endDate: today,
        memberType: MIKMemberTypes.EXTERNAL,
      })

      expect(entriesFor(res.body, externalMemberId)).toHaveLength(1)
      expect(entriesFor(res.body, memberId)).toHaveLength(0)
    })

    it('should accept multiple member types', async () => {
      const res = await queryChangeLog(adminToken, {
        startDate: yesterday,
        endDate: today,
        memberType: [MIKMemberTypes.EXTERNAL, MIKMemberTypes.REMOVED],
      })

      expect(entriesFor(res.body, externalMemberId)).toHaveLength(1)
      expect(entriesFor(res.body, memberId)).toHaveLength(1)
    })

    it('should never include system accounts', async () => {
      const res = await queryChangeLog(adminToken, {
        startDate: dayjs().subtract(1, 'year').format('YYYY-MM-DD'),
        endDate: today,
      })
      const body = res.body as MemberChangeLogResponse

      expect(
        body.entries.filter(
          (entry) =>
            entry.memberType === MIKMemberTypes.SYSTEM ||
            entry.previousMemberType === MIKMemberTypes.SYSTEM,
        ),
      ).toHaveLength(0)
    })

    it('should return an empty log for a period with no changes', async () => {
      const res = await queryChangeLog(adminToken, {
        startDate: '2000-01-01',
        endDate: '2000-01-31',
      })

      expect(res.status).toBe(200)
      expect(res.body.entries).toEqual([])
      expect(res.body.summary).toEqual({ newMembers: 0, leftMembers: 0, totalChanges: 0 })
    })
  })
})
