import 'dotenv/config'

import request from 'supertest'
import express from 'express'
import router from '../../../src/routes/tax-reports/api.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import dayjs from 'dayjs'

const app = express()
app.use(express.json())
app.use('/tax-reports', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [MIKPermissions.INVOICING_ADMIN],
  canMakeReservations: false,
})

const userToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'user@mik.fi',
  roles: [],
  permissions: [MIKPermissions.INVOICING_USER],
  canMakeReservations: false,
})

const memberToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Virtanen',
  email: 'member@mik.fi',
  roles: [],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
})

describe('GET /tax-reports', () => {
  describe('Authentication and Authorization', () => {
    it('should return 401 for invalid token', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', 'Bearer badToken')
        .query({ startDate: '2025-01-01', endDate: '2025-01-31' })

      expect(res.status).toBe(401)
    })

    it('should return 403 for user without INVOICING_ADMIN permission', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-01-31' })

      expect(res.status).toBe(403)
    })

    it('should return 403 for member without INVOICING_ADMIN permission', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${memberToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-01-31' })

      expect(res.status).toBe(403)
    })

    it('should allow access for INVOICING_ADMIN', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-01-31' })

      expect(res.status).toBe(200)
    })
  })

  describe('Query Parameter Validation', () => {
    it('should return 400 for missing startDate', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ endDate: '2025-01-31' })

      expect(res.status).toBe(400)
      expect(res.body.detail).toContain('Invalid query parameters')
    })

    it('should return 400 for missing endDate', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '2025-01-01' })

      expect(res.status).toBe(400)
      expect(res.body.detail).toContain('Invalid query parameters')
    })

    it('should return 400 for invalid date format', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '01-01-2025', endDate: '2025-01-31' })

      expect(res.status).toBe(400)
      expect(res.body.detail).toContain('Invalid query parameters')
    })

    it('should return 400 for startDate after endDate', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '2025-02-01', endDate: '2025-01-31' })

      expect(res.status).toBe(400)
      expect(res.body.detail).toContain('Start date cannot be after end date')
    })

    it('should return 400 for endDate in the future', async () => {
      const futureDate = dayjs().add(1, 'day').format('YYYY-MM-DD')
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '2025-01-01', endDate: futureDate })

      expect(res.status).toBe(400)
      expect(res.body.detail).toContain('End date cannot be in the future')
    })
  })

  describe('Successful Queries', () => {
    it('should return tax report data with valid parameters', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-01-31' })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('data')
      expect(res.body).toHaveProperty('filters')
      expect(res.body.filters).toEqual({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      })
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('should return data grouped by month and aircraft', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-12-31' })

      expect(res.status).toBe(200)

      if (res.body.data.length > 0) {
        const entry = res.body.data[0]
        expect(entry).toHaveProperty('month')
        expect(entry).toHaveProperty('aircraftRegistration')
        expect(entry).toHaveProperty('commercialBlockMins')
        expect(entry).toHaveProperty('commercialFlightMins')
        expect(entry).toHaveProperty('privateBlockMins')
        expect(entry).toHaveProperty('privateFlightMins')
        expect(entry).toHaveProperty('totalBlockMins')
        expect(entry).toHaveProperty('totalFlightMins')

        // Verify month format
        expect(entry.month).toMatch(/^\d{4}-\d{2}$/)

        // Verify numeric types
        expect(typeof entry.commercialBlockMins).toBe('number')
        expect(typeof entry.commercialFlightMins).toBe('number')
        expect(typeof entry.privateBlockMins).toBe('number')
        expect(typeof entry.privateFlightMins).toBe('number')
        expect(typeof entry.totalBlockMins).toBe('number')
        expect(typeof entry.totalFlightMins).toBe('number')

        // Verify totals match sum of commercial and private
        expect(entry.totalBlockMins).toBe(entry.commercialBlockMins + entry.privateBlockMins)
        expect(entry.totalFlightMins).toBe(entry.commercialFlightMins + entry.privateFlightMins)
      }
    })

    it('should return empty array for date range with no flights', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '2020-01-01', endDate: '2020-01-31' })

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it('should handle single day date range', async () => {
      const res = await request(app)
        .get('/tax-reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '2025-01-15', endDate: '2025-01-15' })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('data')
      expect(Array.isArray(res.body.data)).toBe(true)
    })
  })
})
