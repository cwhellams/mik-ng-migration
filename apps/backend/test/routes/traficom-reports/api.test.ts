import 'dotenv/config'

import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import router from '../../../src/routes/traficom-reports/api.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/traficom-reports', router)
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

describe('GET /traficom-reports', () => {
  describe('Authentication and Authorization', () => {
    it('should return 401 for invalid token', async () => {
      const res = await request(app)
        .get('/traficom-reports')
        .set('Cookie', 'accessToken=badToken')
        .query({ year: 2025 })

      expect(res.status).toBe(401)
    })

    it('should return 403 for user without INVOICING_ADMIN permission', async () => {
      const res = await request(app)
        .get('/traficom-reports')
        .set('Cookie', `accessToken=${userToken}`)
        .query({ year: 2025 })

      expect(res.status).toBe(403)
    })

    it('should return 403 for member without INVOICING_ADMIN permission', async () => {
      const res = await request(app)
        .get('/traficom-reports')
        .set('Cookie', `accessToken=${memberToken}`)
        .query({ year: 2025 })

      expect(res.status).toBe(403)
    })

    it('should allow access for INVOICING_ADMIN', async () => {
      const res = await request(app)
        .get('/traficom-reports')
        .set('Cookie', `accessToken=${adminToken}`)
        .query({ year: 2025 })

      expect(res.status).toBe(200)
    })
  })

  describe('Query Parameter Validation', () => {
    it('should return 400 for missing year', async () => {
      const res = await request(app)
        .get('/traficom-reports')
        .set('Cookie', `accessToken=${adminToken}`)

      expect(res.status).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
      expect(res.body.errors.length).toBeGreaterThan(0)
    })

    it('should return 400 for non-numeric year', async () => {
      const res = await request(app)
        .get('/traficom-reports')
        .set('Cookie', `accessToken=${adminToken}`)
        .query({ year: 'abcd' })

      expect(res.status).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
      expect(res.body.errors.length).toBeGreaterThan(0)
    })

    it('should return 400 for invalid filter value', async () => {
      const res = await request(app)
        .get('/traficom-reports')
        .set('Cookie', `accessToken=${adminToken}`)
        .query({ year: 2025, filter: 'BOGUS' })

      expect(res.status).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
      expect(res.body.errors.length).toBeGreaterThan(0)
    })

    it.each(['ALL', 'PRIVATE', 'SCHOOL', 'DTO_SCHOOL', 'NON_DTO_SCHOOL'])(
      'should accept filter=%s',
      async (filter) => {
        const res = await request(app)
          .get('/traficom-reports')
          .set('Cookie', `accessToken=${adminToken}`)
          .query({ year: 2025, filter })

        expect(res.status).toBe(200)
        expect(res.body.filters).toEqual({ year: 2025, filter })
      },
    )

    it('should default filter to ALL when not provided', async () => {
      const res = await request(app)
        .get('/traficom-reports')
        .set('Cookie', `accessToken=${adminToken}`)
        .query({ year: 2025 })

      expect(res.status).toBe(200)
      expect(res.body.filters).toEqual({ year: 2025, filter: 'ALL' })
    })
  })

  describe('Successful Queries', () => {
    it('should return data with the expected per-aircraft structure', async () => {
      const res = await request(app)
        .get('/traficom-reports')
        .set('Cookie', `accessToken=${adminToken}`)
        .query({ year: 2025, filter: 'ALL' })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('data')
      expect(res.body).toHaveProperty('filters')
      expect(Array.isArray(res.body.data)).toBe(true)

      if (res.body.data.length > 0) {
        const entry = res.body.data[0]
        expect(entry).toHaveProperty('aircraftRegistration')
        expect(entry).toHaveProperty('flights')
        expect(entry).toHaveProperty('landings')
        expect(entry).toHaveProperty('zzzzLandings')
        expect(entry).toHaveProperty('yearTotalFlightMins')
        expect(entry).toHaveProperty('yearTotalLandings')
        expect(entry).toHaveProperty('lifetimeTotalFlightMins')
        expect(entry).toHaveProperty('lifetimeTotalLandings')

        // ZZZZ landings cannot exceed total landings for the same filter window
        expect(entry.zzzzLandings).toBeLessThanOrEqual(entry.landings)

        // Year totals cannot exceed lifetime totals for the same aircraft
        expect(entry.yearTotalFlightMins).toBeLessThanOrEqual(entry.lifetimeTotalFlightMins)
        expect(entry.yearTotalLandings).toBeLessThanOrEqual(entry.lifetimeTotalLandings)

        // All numeric fields are non-negative numbers
        for (const key of [
          'flights',
          'landings',
          'zzzzLandings',
          'yearTotalFlightMins',
          'yearTotalLandings',
          'lifetimeTotalFlightMins',
          'lifetimeTotalLandings',
        ] as const) {
          expect(typeof entry[key]).toBe('number')
          expect(entry[key]).toBeGreaterThanOrEqual(0)
        }
      }
    })

    it('should return aircraft sorted by registration', async () => {
      const res = await request(app)
        .get('/traficom-reports')
        .set('Cookie', `accessToken=${adminToken}`)
        .query({ year: 2025 })

      expect(res.status).toBe(200)
      const regs: string[] = res.body.data.map(
        (e: { aircraftRegistration: string }) => e.aircraftRegistration,
      )
      const sorted = [...regs].sort()
      expect(regs).toEqual(sorted)
    })

    it('should return empty data for a year far in the past with no flights', async () => {
      const res = await request(app)
        .get('/traficom-reports')
        .set('Cookie', `accessToken=${adminToken}`)
        .query({ year: 1901 })

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })
  })
})
