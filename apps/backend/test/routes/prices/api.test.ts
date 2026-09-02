import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const mockGetCurrentAircraftPricing = jest.fn<(...args: any[]) => Promise<unknown[]>>()
const mockGetMembershipFees = jest.fn<(...args: any[]) => Promise<unknown[]>>()
const mockGetEquipmentFee = jest.fn<(...args: any[]) => Promise<unknown>>()

jest.unstable_mockModule('../../../src/db/prices-queries.ts', () => ({
  getCurrentAircraftPricing: mockGetCurrentAircraftPricing,
  getMembershipFees: mockGetMembershipFees,
  getEquipmentFee: mockGetEquipmentFee,
}))

const { router } = await import('../../../src/routes/prices/api.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use('/api/v1/prices', router)
app.use(problemErrorHandler)

const sampleAircraftPricing = [
  {
    registration: 'OH-ABC',
    price_per_min: 2.5,
    valid_from: '2024-01-01',
    valid_to: null,
  },
  {
    registration: 'OH-XYZ',
    price_per_min: 3.0,
    valid_from: '2024-01-01',
    valid_to: null,
  },
]

const sampleMembershipFees = [
  {
    code: 'JASEN',
    name: 'Regular Member Fee',
    price: 100,
    description: 'Annual membership fee',
    seasonalDiscountPercent: 50,
  },
  {
    code: 'NJASEN',
    name: 'Junior Member Fee',
    price: 50,
    description: 'Annual junior membership fee',
    seasonalDiscountPercent: 50,
  },
  {
    code: 'KJASEN',
    name: 'Supporting Member Fee',
    price: 75,
    description: 'Annual supporting membership fee',
    seasonalDiscountPercent: 50,
  },
]

const sampleEquipmentFee = {
  code: 'KALUSTO',
  name: 'Equipment Fee',
  price: 200,
  description: 'Annual equipment fee',
  seasonalDiscountPercent: 50,
}

describe('Prices API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /public', () => {
    it('returns all pricing information without authentication', async () => {
      mockGetCurrentAircraftPricing.mockResolvedValue(sampleAircraftPricing)
      mockGetMembershipFees.mockResolvedValue(sampleMembershipFees)
      mockGetEquipmentFee.mockResolvedValue(sampleEquipmentFee)

      const response = await request(app).get('/api/v1/prices/public')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        aircraft: sampleAircraftPricing,
        membershipFees: sampleMembershipFees,
        equipmentFee: sampleEquipmentFee,
      })

      expect(mockGetCurrentAircraftPricing).toHaveBeenCalled()
      expect(mockGetMembershipFees).toHaveBeenCalled()
      expect(mockGetEquipmentFee).toHaveBeenCalled()
    })

    it('returns null equipment fee when not configured', async () => {
      mockGetCurrentAircraftPricing.mockResolvedValue(sampleAircraftPricing)
      mockGetMembershipFees.mockResolvedValue(sampleMembershipFees)
      mockGetEquipmentFee.mockResolvedValue(null)

      const response = await request(app).get('/api/v1/prices/public')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        aircraft: sampleAircraftPricing,
        membershipFees: sampleMembershipFees,
        equipmentFee: null,
      })
    })

    it('returns empty arrays when no data is available', async () => {
      mockGetCurrentAircraftPricing.mockResolvedValue([])
      mockGetMembershipFees.mockResolvedValue([])
      mockGetEquipmentFee.mockResolvedValue(null)

      const response = await request(app).get('/api/v1/prices/public')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        aircraft: [],
        membershipFees: [],
        equipmentFee: null,
      })
    })

    it('returns 500 on database error', async () => {
      mockGetCurrentAircraftPricing.mockRejectedValue(new Error('Database connection failed'))

      const response = await request(app).get('/api/v1/prices/public')

      expect(response.status).toBe(500)
      expect(response.body).toMatchObject({
        status: 500,
        detail: 'Failed to fetch pricing information',
      })
    })
  })
})
