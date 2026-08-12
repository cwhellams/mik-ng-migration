import 'dotenv/config'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const mockGetFuelPricesMarkdown = jest.fn<(...args: any[]) => Promise<string>>()
const mockSetFuelPricesMarkdown = jest.fn<(...args: any[]) => Promise<void>>()
const mockGetLocalFuelPrices = jest.fn<(...args: any[]) => Promise<any[]>>()
const mockCreateLocalFuelPrice = jest.fn<(...args: any[]) => Promise<any>>()

jest.unstable_mockModule('../../../src/db/fuel-prices-queries.ts', () => ({
  getFuelPricesMarkdown: mockGetFuelPricesMarkdown,
  setFuelPricesMarkdown: mockSetFuelPricesMarkdown,
}))

jest.unstable_mockModule('../../../src/db/local-fuel-price-queries.ts', () => ({
  getLocalFuelPrices: mockGetLocalFuelPrices,
  createLocalFuelPrice: mockCreateLocalFuelPrice,
}))

const { router } = await import('../../../src/routes/fuel-prices/api.ts')

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/fuel-prices', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FUEL_PRICES_ADMIN],
  canMakeReservations: false,
})

const userToken = generateAccessToken({
  memberId: 'Anna1',
  lastName: 'Korhonen',
  email: 'user@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FUEL_PRICES_USER],
  canMakeReservations: false,
})

const noPermissionToken = generateAccessToken({
  memberId: 'Juha1',
  lastName: 'Mäkinen',
  email: 'user@mik.fi',
  roles: [],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
})

describe('Fuel Prices API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /fuel-prices', () => {
    it('requires authentication', async () => {
      const response = await request(app).get('/fuel-prices')
      expect(response.status).toBe(401)
    })

    it('requires fuel prices user or admin permission', async () => {
      const response = await request(app)
        .get('/fuel-prices')
        .set('Cookie', `accessToken=${noPermissionToken}`)

      expect(response.status).toBe(403)
    })

    it('returns markdown and rendered html for authorized users', async () => {
      mockGetFuelPricesMarkdown.mockResolvedValue('# Fuel prices')

      const response = await request(app)
        .get('/fuel-prices')
        .set('Cookie', `accessToken=${userToken}`)

      expect(response.status).toBe(200)
      expect(response.body.markdown).toBe('# Fuel prices')
      expect(response.body.renderedHtml).toContain('<h1>Fuel prices</h1>')
    })
  })

  describe('PATCH /fuel-prices', () => {
    it('requires admin permission', async () => {
      const response = await request(app)
        .patch('/fuel-prices')
        .set('Cookie', `accessToken=${userToken}`)
        .send({ markdown: 'new content' })

      expect(response.status).toBe(403)
      expect(mockSetFuelPricesMarkdown).not.toHaveBeenCalled()
    })

    it('updates markdown content for admin users', async () => {
      mockSetFuelPricesMarkdown.mockResolvedValue(undefined)
      const markdown = '## Updated'

      const response = await request(app)
        .patch('/fuel-prices')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ markdown })

      expect(response.status).toBe(200)
      expect(response.body.markdown).toBe(markdown)
      expect(response.body.renderedHtml).toContain('<h2>Updated</h2>')
      expect(mockSetFuelPricesMarkdown).toHaveBeenCalledWith(markdown, expect.any(Object))
    })

    it('validates request body', async () => {
      const response = await request(app)
        .patch('/fuel-prices')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({})

      expect(response.status).toBe(400)
      expect(mockSetFuelPricesMarkdown).not.toHaveBeenCalled()
    })
  })

  describe('GET /fuel-prices/local', () => {
    it('requires fuel prices user or admin permission', async () => {
      const response = await request(app)
        .get('/fuel-prices/local')
        .set('Cookie', `accessToken=${noPermissionToken}`)
      expect(response.status).toBe(403)
    })

    it('returns local fuel prices for authorized users', async () => {
      mockGetLocalFuelPrices.mockResolvedValue([
        { id: 1, fuelType: '100LL', priceEurPerLitre: 3.05, validFrom: '2026-06-01' },
      ])
      const response = await request(app)
        .get('/fuel-prices/local')
        .set('Cookie', `accessToken=${userToken}`)

      expect(response.status).toBe(200)
      expect(response.body.prices).toHaveLength(1)
      expect(response.body.prices[0].fuelType).toBe('100LL')
    })
  })

  describe('POST /fuel-prices/local', () => {
    it('requires admin permission', async () => {
      const response = await request(app)
        .post('/fuel-prices/local')
        .set('Cookie', `accessToken=${userToken}`)
        .send({ fuelType: '100LL', priceEurPerLitre: 3.05, validFrom: '2026-06-01' })

      expect(response.status).toBe(403)
      expect(mockCreateLocalFuelPrice).not.toHaveBeenCalled()
    })

    it('creates a new effective-dated price for admin users', async () => {
      mockCreateLocalFuelPrice.mockResolvedValue({
        id: 2,
        fuelType: '100LL',
        priceEurPerLitre: 3.1,
        validFrom: '2026-07-01',
      })

      const response = await request(app)
        .post('/fuel-prices/local')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ fuelType: '100LL', priceEurPerLitre: 3.1, validFrom: '2026-07-01' })

      expect(response.status).toBe(201)
      expect(response.body.priceEurPerLitre).toBe(3.1)
      expect(mockCreateLocalFuelPrice).toHaveBeenCalledWith(
        { fuelType: '100LL', priceEurPerLitre: 3.1, validFrom: '2026-07-01' },
        expect.any(Object),
      )
    })

    it('validates the fuel type enum', async () => {
      const response = await request(app)
        .post('/fuel-prices/local')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ fuelType: 'diesel', priceEurPerLitre: 3.1, validFrom: '2026-07-01' })

      expect(response.status).toBe(400)
      expect(mockCreateLocalFuelPrice).not.toHaveBeenCalled()
    })
  })
})
