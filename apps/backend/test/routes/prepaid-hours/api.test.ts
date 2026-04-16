import { jest, describe, it, expect } from '@jest/globals'

import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'

// Ensure token generation/validation works in isolated test runs
process.env.ACCESS_TOKEN_SECRET ??= 'test-access-secret'
process.env.ACCESS_TOKEN_EXPIRATION ??= '15m'
process.env.SIMPLBOOKS_BASE_URI ??= 'https://example.test'
process.env.SIMPLBOOKS_COMPANY_ID ??= '123'
process.env.SIMPLBOOKS_API_KEY ??= 'test-api-key'
process.env.SIMPLBOOKS_API ??= 'api'

// ── Mock all DB queries so no real DB is needed ───────────────────────────────
jest.mock('../../../src/db/prepaid-hours-queries.ts', () => ({
  getPrepaidPackages: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getPrepaidPackageById: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
  insertPrepaidPackage: jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ productId: 'PKG001' }),
  updatePrepaidPackage: jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ productId: 'PKG001' }),
  getMemberPackages: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  extendExpiryForAircraft: jest.fn<() => Promise<number>>().mockResolvedValue(3),
  getUsageLog: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getUnbilledTimeByAircraft: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
}))

const { router } = await import('../../../src/routes/prepaid-hours/api.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/prepaid-hours', router)
app.use(problemErrorHandler)

// ── Tokens ────────────────────────────────────────────────────────────────────

const storeAdminToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Whellams',
  email: 'test@example.com',
  roles: ['ADMIN'],
  permissions: [MIKPermissions.STORE_ADMIN],
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

const storeUserToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'member@mik.fi',
  roles: [],
  permissions: [MIKPermissions.STORE_USER],
  canMakeReservations: false,
})

const memberToken = generateAccessToken({
  memberId: 'Matti2',
  lastName: 'Korhonen',
  email: 'member2@mik.fi',
  roles: [],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
})

const validPackageBody = {
  nameEn: 'Test Package',
  nameFi: 'Testipaketti',
  nameSv: 'Testpaket',
  aircraftRegistration: 'OH-STL',
  minutesPerPackage: 600,
  perMinRate: 1.5,
  totalPackagesAvailable: 10,
  vatPercent: 0,
  expiresAt: '2027-12-31',
  isActive: true,
}

// ── POST /packages auth tests ─────────────────────────────────────────────────

describe('POST /prepaid-hours/packages', () => {
  it('should return 201 for store admin (regression: was returning 403)', async () => {
    const res = await request(app)
      .post('/prepaid-hours/packages')
      .set('Cookie', `accessToken=${storeAdminToken}`)
      .send(validPackageBody)

    expect(res.status).toBe(201)
  })

  it('should return 201 for invoicing admin', async () => {
    const res = await request(app)
      .post('/prepaid-hours/packages')
      .set('Cookie', `accessToken=${invoicingAdminToken}`)
      .send(validPackageBody)

    expect(res.status).toBe(201)
  })

  it('should return 403 for store user (insufficient permissions)', async () => {
    const res = await request(app)
      .post('/prepaid-hours/packages')
      .set('Cookie', `accessToken=${storeUserToken}`)
      .send(validPackageBody)

    expect(res.status).toBe(403)
  })

  it('should return 403 for plain member', async () => {
    const res = await request(app)
      .post('/prepaid-hours/packages')
      .set('Cookie', `accessToken=${memberToken}`)
      .send(validPackageBody)

    expect(res.status).toBe(403)
  })

  it('should return 401 for unauthenticated request', async () => {
    const res = await request(app).post('/prepaid-hours/packages').send(validPackageBody)

    expect(res.status).toBe(401)
  })
})

// ── GET /packages auth tests ──────────────────────────────────────────────────

describe('GET /prepaid-hours/packages', () => {
  it('should return 200 for store admin', async () => {
    const res = await request(app)
      .get('/prepaid-hours/packages')
      .set('Cookie', `accessToken=${storeAdminToken}`)

    expect(res.status).toBe(200)
  })

  it('should return 200 for store user', async () => {
    const res = await request(app)
      .get('/prepaid-hours/packages')
      .set('Cookie', `accessToken=${storeUserToken}`)

    expect(res.status).toBe(200)
  })

  it('should return 403 for plain member', async () => {
    const res = await request(app)
      .get('/prepaid-hours/packages')
      .set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(403)
  })

  it('should return 401 for unauthenticated request', async () => {
    const res = await request(app).get('/prepaid-hours/packages')

    expect(res.status).toBe(401)
  })
})
