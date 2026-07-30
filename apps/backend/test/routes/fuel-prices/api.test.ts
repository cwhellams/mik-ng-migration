import 'dotenv/config'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const mockGetFuelPricesMarkdown = jest.fn<(...args: any[]) => Promise<string>>()
const mockSetFuelPricesMarkdown = jest.fn<(...args: any[]) => Promise<void>>()

jest.unstable_mockModule('../../../src/db/fuel-prices-queries.ts', () => ({
  getFuelPricesMarkdown: mockGetFuelPricesMarkdown,
  setFuelPricesMarkdown: mockSetFuelPricesMarkdown,
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
})
