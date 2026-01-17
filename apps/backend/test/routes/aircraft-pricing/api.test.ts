import 'dotenv/config'
import express from 'express'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/aircraft-pricing/api.ts'
import type { AircraftPricing } from '../../../src/routes/aircraft-pricing/models.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/aircraft-pricing', router)
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
  permissions: [],
  canMakeReservations: false,
})

const removeTimestamps = (pricing: AircraftPricing) => ({
  ...pricing,
  created_at: expect.any(String),
  updated_at: expect.any(String),
})

describe('GET /aircraft-pricing', () => {
  const query = async (token: string, params?: Record<string, string>) =>
    request(app)
      .get('/aircraft-pricing')
      .set('Authorization', `Bearer ${token}`)
      .query(params ?? {})

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .get('/aircraft-pricing')
      .set('Authorization', `Bearer INVALID`)
      .query({})

    expect(response.status).toBe(401)
  })

  it('should return all pricing when authenticated', async () => {
    const response = await query(userToken)
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.pricing)).toBe(true)
    expect(response.body.pricing.length).toBeGreaterThan(0)
  })

  it('should filter pricing by registration', async () => {
    const response = await query(userToken, { registration: 'OH-STL' })
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.pricing)).toBe(true)
    response.body.pricing.forEach((pricing: AircraftPricing) => {
      expect(pricing.registration).toBe('OH-STL')
    })
  })

  it('should filter pricing by fromDate', async () => {
    const response = await query(userToken, { fromDate: '2025-01-01' })
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.pricing)).toBe(true)
    expect(response.body.pricing.length).toBeGreaterThan(0)
  })

  it('should filter pricing by toDate', async () => {
    const response = await query(userToken, { toDate: '2025-12-31' })
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.pricing)).toBe(true)
    expect(response.body.pricing.length).toBeGreaterThan(0)
  })

  it('should filter pricing by date range', async () => {
    const response = await query(userToken, {
      fromDate: '2025-01-01',
      toDate: '2025-12-31',
    })
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.pricing)).toBe(true)
  })

  it('should filter pricing by registration and date range', async () => {
    const response = await query(userToken, {
      registration: 'OH-STL',
      fromDate: '2025-01-01',
      toDate: '2025-12-31',
    })
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.pricing)).toBe(true)
    response.body.pricing.forEach((pricing: AircraftPricing) => {
      expect(pricing.registration).toBe('OH-STL')
    })
  })

  it('should return pricing with all required fields', async () => {
    const response = await query(userToken, { registration: 'OH-STL' })
    expect(response.status).toBe(200)
    expect(response.body.pricing.length).toBeGreaterThan(0)

    const pricing = response.body.pricing[0]
    expect(pricing).toHaveProperty('registration')
    expect(pricing).toHaveProperty('valid_from')
    expect(pricing).toHaveProperty('valid_to')
    expect(pricing).toHaveProperty('price_per_min')
    expect(pricing).toHaveProperty('created_at')
    expect(pricing).toHaveProperty('created_by')
    expect(pricing).toHaveProperty('updated_at')
    expect(pricing).toHaveProperty('updated_by')
    expect(pricing).toHaveProperty('notes')
    expect(typeof pricing.price_per_min).toBe('number')
  })

  it('should match snapshot for OH-STL pricing', async () => {
    const response = await query(userToken, { registration: 'OH-STL' })
    expect(response.status).toBe(200)
    expect(response.body.pricing).toMatchSnapshot(response.body.pricing.map(removeTimestamps))
  })
})

describe('POST /aircraft-pricing', () => {
  const newPricing = {
    registration: 'OH-IHQ',
    valid_from: '2026-01-01',
    valid_to: null,
    price_per_min: 4.5,
    notes: 'Test API pricing',
  }

  afterEach(async () => {
    // Clean up test data
    await db
      .deleteFrom('accts.aircraft_pricing')
      .where('registration', '=', newPricing.registration)
      .where('valid_from', '=', newPricing.valid_from)
      .execute()
  })

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .post('/aircraft-pricing')
      .set('Authorization', `Bearer INVALID`)
      .send(newPricing)

    expect(response.status).toBe(401)
  })

  it('should return 403 when not admin', async () => {
    const response = await request(app)
      .post('/aircraft-pricing')
      .set('Authorization', `Bearer ${userToken}`)
      .send(newPricing)

    expect(response.status).toBe(403)
  })

  it('should create new pricing when authenticated as admin', async () => {
    const response = await request(app)
      .post('/aircraft-pricing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newPricing)

    expect(response.status).toBe(201)
    expect(response.body).toBeDefined()
    expect(response.body.registration).toBe(newPricing.registration)
    expect(response.body.valid_from).toBe(newPricing.valid_from)
    expect(response.body.price_per_min).toBe(newPricing.price_per_min)
    expect(response.body.created_by).toBe('k1mnimda')
  })

  it('should return 400 for invalid registration', async () => {
    const invalidPricing = {
      ...newPricing,
      registration: 'INVALID-REG',
    }

    const response = await request(app)
      .post('/aircraft-pricing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(invalidPricing)

    expect(response.status).toBe(400)
  })

  it('should return 400 for missing required fields', async () => {
    const incompletePricing = {
      registration: 'OH-IHQ',
      // Missing valid_from and price_per_min
    }

    const response = await request(app)
      .post('/aircraft-pricing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(incompletePricing)

    expect(response.status).toBe(400)
  })

  it('should return 400 for negative price', async () => {
    const negativePricing = {
      ...newPricing,
      price_per_min: -1.0,
    }

    const response = await request(app)
      .post('/aircraft-pricing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(negativePricing)

    expect(response.status).toBe(400)
  })

  it('should return 400 for invalid date range', async () => {
    const invalidDateRange = {
      ...newPricing,
      valid_from: '2026-12-31',
      valid_to: '2026-01-01', // valid_to before valid_from
    }

    const response = await request(app)
      .post('/aircraft-pricing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(invalidDateRange)

    // Could be 400 from validation or 500 if database constraint catches it
    expect([400, 500]).toContain(response.status)
  })

  it('should accept null valid_to for open-ended pricing', async () => {
    const openPricing = {
      registration: 'OH-IHQ',
      valid_from: '2028-01-01',
      valid_to: null,
      price_per_min: 5.5,
    }

    const response = await request(app)
      .post('/aircraft-pricing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(openPricing)

    expect(response.status).toBe(201)
    expect(response.body.valid_to).toBeNull()

    // Clean up
    await db
      .deleteFrom('accts.aircraft_pricing')
      .where('registration', '=', openPricing.registration)
      .where('valid_from', '=', openPricing.valid_from)
      .execute()
  })
})

describe('PATCH /aircraft-pricing/:registration/:validFrom', () => {
  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .patch('/aircraft-pricing/OH-STL/2025-01-01')
      .set('Authorization', `Bearer INVALID`)
      .send({ notes: 'Test' })

    expect(response.status).toBe(401)
  })

  it('should return 403 when not admin', async () => {
    const response = await request(app)
      .patch('/aircraft-pricing/OH-STL/2025-01-01')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ notes: 'Test' })

    expect(response.status).toBe(403)
  })

  it('should update pricing when authenticated as admin', async () => {
    const update = {
      notes: 'Updated via API test',
    }

    const response = await request(app)
      .patch('/aircraft-pricing/OH-STL/2025-12-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(update)

    expect(response.status).toBe(200)
    expect(response.body).toBeDefined()
    expect(response.body.registration).toBe('OH-STL')
    expect(response.body.valid_from).toBe('2025-12-01')
    expect(response.body.notes).toBe(update.notes)
    expect(response.body.updated_by).toBe('k1mnimda')

    // Restore original state
    await request(app)
      .patch('/aircraft-pricing/OH-STL/2025-01-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: null })
  })

  it('should update price_per_min', async () => {
    // Get current price
    const current = await request(app)
      .get('/aircraft-pricing')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ registration: 'OH-STL' })

    const originalPrice = current.body.pricing[0].price_per_min
    const update = {
      price_per_min: originalPrice + 0.5,
    }

    const response = await request(app)
      .patch('/aircraft-pricing/OH-STL/2025-12-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(update)

    expect(response.status).toBe(200)
    expect(response.body.price_per_min).toBe(update.price_per_min)

    // Restore original price
    await request(app)
      .patch('/aircraft-pricing/OH-STL/2025-12-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price_per_min: originalPrice })
  })

  it('should return 404 for non-existent pricing', async () => {
    const response = await request(app)
      .patch('/aircraft-pricing/OH-STL/1999-01-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Test' })

    expect(response.status).toBe(404)
  })

  it('should return 400 for invalid update data', async () => {
    const invalidUpdate = {
      price_per_min: -1.0, // Negative price
    }

    const response = await request(app)
      .patch('/aircraft-pricing/OH-STL/2025-01-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(invalidUpdate)

    expect(response.status).toBe(400)
  })
})

describe('DELETE /aircraft-pricing/:registration/:validFrom', () => {
  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .delete('/aircraft-pricing/OH-STL/2025-01-01')
      .set('Authorization', `Bearer INVALID`)

    expect(response.status).toBe(401)
  })

  it('should return 403 when not admin', async () => {
    const response = await request(app)
      .delete('/aircraft-pricing/OH-STL/2025-01-01')
      .set('Authorization', `Bearer ${userToken}`)

    expect(response.status).toBe(403)
  })

  it('should delete pricing when authenticated as admin', async () => {
    // Create a test pricing to delete - use a far future date to avoid gaps
    const testPricing = {
      registration: 'OH-STL',
      valid_from: '2099-01-01',
      valid_to: null,
      price_per_min: 5.0,
      notes: 'Test pricing for API deletion',
    }

    const createResponse = await request(app)
      .post('/aircraft-pricing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(testPricing)

    expect(createResponse.status).toBe(201)

    // Delete it
    const response = await request(app)
      .delete(`/aircraft-pricing/${testPricing.registration}/${testPricing.valid_from}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(204)

    // Verify it's gone
    const getResponse = await request(app)
      .get('/aircraft-pricing')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({
        registration: testPricing.registration,
        fromDate: testPricing.valid_from,
        toDate: testPricing.valid_from,
      })

    const deleted = getResponse.body.pricing.find(
      (p: AircraftPricing) => p.valid_from === testPricing.valid_from,
    )
    expect(deleted).toBeUndefined()
  })

  it('should return 404 for non-existent pricing', async () => {
    const response = await request(app)
      .delete('/aircraft-pricing/OH-STL/1999-01-01')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(404)
  })
})
