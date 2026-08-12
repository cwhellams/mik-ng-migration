import 'dotenv/config'

import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import router from '../../../src/routes/instructor-worktime/api.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import dayjs from 'dayjs'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/instructor-worktime', router)
app.use(problemErrorHandler)

const flightlogAdminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_ADMIN],
  canMakeReservations: false,
})

const invoicingAdminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [MIKPermissions.INVOICING_ADMIN],
  canMakeReservations: false,
})

const memberToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'user@mik.fi',
  roles: [],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
})

describe('GET /instructor-worktime', () => {
  describe('Authentication and Authorization', () => {
    it('should return 401 for invalid token', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', 'accessToken=badToken')
        .query({ startDate: '2025-01-01', endDate: '2025-01-31' })

      expect(res.status).toBe(401)
    })

    it('should return 403 for member without admin permission', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${memberToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-01-31' })

      expect(res.status).toBe(403)
    })

    it('should allow access for FLIGHTLOG_ADMIN', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-01-31' })

      expect(res.status).toBe(200)
    })

    it('should allow access for INVOICING_ADMIN', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${invoicingAdminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-01-31' })

      expect(res.status).toBe(200)
    })
  })

  describe('Query Parameter Validation', () => {
    it('should return 400 for missing startDate', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ endDate: '2025-01-31' })

      expect(res.status).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
      expect(res.body.errors.length).toBeGreaterThan(0)
    })

    it('should return 400 for missing endDate', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2025-01-01' })

      expect(res.status).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
      expect(res.body.errors.length).toBeGreaterThan(0)
    })

    it('should return 400 for invalid date format', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '01-01-2025', endDate: '2025-01-31' })

      expect(res.status).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
      expect(res.body.errors.length).toBeGreaterThan(0)
    })

    it('should return 400 for impossible date values (e.g. month 99)', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2025-99-99', endDate: '2025-01-31' })

      expect(res.status).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
      expect(res.body.errors.length).toBeGreaterThan(0)
    })

    it('should return 400 for startDate after endDate', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2025-02-01', endDate: '2025-01-31' })

      expect(res.status).toBe(400)
      expect(
        res.body.errors.some((e: { message: string }) =>
          e.message.includes('Start date cannot be after end date'),
        ),
      ).toBe(true)
    })

    it('should return 400 for endDate in the future', async () => {
      const futureDate = dayjs().add(1, 'day').format('YYYY-MM-DD')
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2025-01-01', endDate: futureDate })

      expect(res.status).toBe(400)
      expect(
        res.body.errors.some((e: { message: string }) =>
          e.message.includes('End date cannot be in the future'),
        ),
      ).toBe(true)
    })

    it('should return 400 for invalid timeType', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-01-31', timeType: 'invalid' })

      expect(res.status).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
      expect(res.body.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Successful Queries', () => {
    it('should return instructor worktime data with valid parameters (block time)', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-12-31', timeType: 'block' })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('data')
      expect(res.body).toHaveProperty('filters')
      expect(res.body.filters).toEqual({
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        timeType: 'block',
      })
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('should return instructor worktime data with valid parameters (air time)', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-12-31', timeType: 'air' })

      expect(res.status).toBe(200)
      expect(res.body.filters.timeType).toBe('air')
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('should default timeType to block when not specified', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-01-31' })

      expect(res.status).toBe(200)
      expect(res.body.filters.timeType).toBe('block')
    })

    it('should return correct data shape when instructor flights exist', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-12-31' })

      expect(res.status).toBe(200)

      if (res.body.data.length > 0) {
        const entry = res.body.data[0]
        expect(entry).toHaveProperty('instructorMemberId')
        expect(entry).toHaveProperty('instructorName')
        expect(entry).toHaveProperty('date')
        expect(entry).toHaveProperty('flightCount')
        expect(entry).toHaveProperty('totalTimeMins')
        expect(entry).toHaveProperty('workTimeMins')

        expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(typeof entry.flightCount).toBe('number')
        expect(typeof entry.totalTimeMins).toBe('number')
        expect(typeof entry.workTimeMins).toBe('number')

        // workTimeMins = totalTimeMins + 90 * flightCount
        expect(entry.workTimeMins).toBe(entry.totalTimeMins + 90 * entry.flightCount)
      }
    })

    it('should return empty array for date range with no instructor flights', async () => {
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2020-01-01', endDate: '2020-01-31' })

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it('should include FI instructor flights from test data', async () => {
      // V50__FlightLogData.sql and V190__InstructorFlightData.sql seed FI flights
      const res = await request(app)
        .get('/instructor-worktime')
        .set('Cookie', `accessToken=${flightlogAdminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2026-01-31' })

      expect(res.status).toBe(200)
      expect(res.body.data.length).toBeGreaterThan(0)

      const entries: Array<{
        instructorMemberId: string
        instructorName: string
        date: string
        flightCount: number
        totalTimeMins: number
        workTimeMins: number
      }> = res.body.data
      entries.forEach((entry) => {
        expect(entry.workTimeMins).toBe(entry.totalTimeMins + 90 * entry.flightCount)
      })
    })
  })
})
