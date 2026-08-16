import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/aircraft-cards/api.ts'
import type { AircraftCardAuditable } from '@mik/contracts/aircraft-cards'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/aircraft-cards', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [MIKPermissions.AIRCRAFT_ADMIN, MIKPermissions.AIRCRAFT_USER],
  canMakeReservations: false,
})

const userToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'user@mik.fi',
  roles: [],
  permissions: [MIKPermissions.AIRCRAFT_USER],
  canMakeReservations: false,
})

const noPermissionsToken = generateAccessToken({
  memberId: 'na',
  lastName: 'Unknown',
  email: 'no-permissions@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: false,
})

const TEST_REGISTRATION = 'OH-STL'

const newCard = {
  aircraftRegistration: TEST_REGISTRATION,
  name: 'Air BP Fuel Card',
  description: 'Test fuel card',
  validFrom: '2025-01-01',
  validTo: '2026-12-31',
}

const cleanupTestCards = async () => {
  await db
    .deleteFrom('flight.aircraftCards')
    .where('name', 'like', 'Air BP Fuel Card%')
    .where('aircraftRegistration', '=', TEST_REGISTRATION)
    .execute()
}

describe('GET /aircraft-cards', () => {
  const query = async (token: string, params?: Record<string, string>) =>
    request(app)
      .get('/aircraft-cards')
      .set('Cookie', `accessToken=${token}`)
      .query(params ?? {})

  it('should return 401 for invalid token', async () => {
    const response = await request(app).get('/aircraft-cards').set('Cookie', `accessToken=INVALID`)

    expect(response.status).toBe(401)
  })

  it('should return 403 when user has no permissions', async () => {
    const response = await query(noPermissionsToken)
    expect(response.status).toBe(403)
  })

  it('should return cards list when authenticated', async () => {
    const response = await query(userToken)
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.cards)).toBe(true)
    expect(typeof response.body.total).toBe('number')
  })

  it('should filter cards by aircraftRegistration', async () => {
    // Create a card first so we have something to filter
    const createResponse = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(newCard)
    expect(createResponse.status).toBe(201)

    try {
      const response = await query(userToken, { aircraftRegistration: TEST_REGISTRATION })
      expect(response.status).toBe(200)
      expect(Array.isArray(response.body.cards)).toBe(true)
      response.body.cards.forEach((card: AircraftCardAuditable) => {
        expect(card.aircraftRegistration).toBe(TEST_REGISTRATION)
      })
    } finally {
      await cleanupTestCards()
    }
  })
})

describe('GET /aircraft-cards/:cardId', () => {
  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .get('/aircraft-cards/1')
      .set('Cookie', `accessToken=INVALID`)

    expect(response.status).toBe(401)
  })

  it('should return 404 for non-existent card', async () => {
    const response = await request(app)
      .get('/aircraft-cards/999999')
      .set('Cookie', `accessToken=${userToken}`)

    expect(response.status).toBe(404)
  })

  it('should return card by ID', async () => {
    const createResponse = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(newCard)
    expect(createResponse.status).toBe(201)
    const cardId = createResponse.body.cardId

    try {
      const response = await request(app)
        .get(`/aircraft-cards/${cardId}`)
        .set('Cookie', `accessToken=${userToken}`)

      expect(response.status).toBe(200)
      expect(response.body.cardId).toBe(cardId)
      expect(response.body.name).toBe(newCard.name)
    } finally {
      await cleanupTestCards()
    }
  })
})

describe('POST /aircraft-cards', () => {
  afterEach(cleanupTestCards)

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=INVALID`)
      .send(newCard)

    expect(response.status).toBe(401)
  })

  it('should return 403 when not admin', async () => {
    const response = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=${userToken}`)
      .send(newCard)

    expect(response.status).toBe(403)
  })

  it('should create card when authenticated as admin', async () => {
    const response = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(newCard)

    expect(response.status).toBe(201)
    expect(response.body.aircraftRegistration).toBe(newCard.aircraftRegistration)
    expect(response.body.name).toBe(newCard.name)
    expect(response.body.validFrom).toBe(newCard.validFrom)
    expect(response.body.validTo).toBe(newCard.validTo)
    expect(response.body.createdBy).toBe('k1mnimda')
  })

  it('should return 400 for missing required fields', async () => {
    const response = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ aircraftRegistration: TEST_REGISTRATION })

    expect(response.status).toBe(400)
  })

  it('should return 400 for invalid date format', async () => {
    const response = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ ...newCard, validFrom: 'not-a-date' })

    expect(response.status).toBe(400)
  })

  it('should return 400 when validFrom is after validTo', async () => {
    const response = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ ...newCard, validFrom: '2026-12-31', validTo: '2025-01-01' })

    expect(response.status).toBe(400)
  })

  it('should return 400 when name exceeds max length', async () => {
    const response = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ ...newCard, name: 'x'.repeat(256) })

    expect(response.status).toBe(400)
  })

  it('should accept null dates for open-ended card', async () => {
    const openCard = { ...newCard, validFrom: null, validTo: null }
    const response = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(openCard)

    expect(response.status).toBe(201)
    expect(response.body.validFrom).toBeNull()
    expect(response.body.validTo).toBeNull()
  })
})

describe('PATCH /aircraft-cards/:cardId', () => {
  let testCardId: number

  beforeEach(async () => {
    const createResponse = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(newCard)
    expect(createResponse.status).toBe(201)
    testCardId = createResponse.body.cardId
  })

  afterEach(cleanupTestCards)

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .patch(`/aircraft-cards/${testCardId}`)
      .set('Cookie', `accessToken=INVALID`)
      .send({ name: 'Updated' })

    expect(response.status).toBe(401)
  })

  it('should return 403 when not admin', async () => {
    const response = await request(app)
      .patch(`/aircraft-cards/${testCardId}`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ name: 'Updated' })

    expect(response.status).toBe(403)
  })

  it('should update card when authenticated as admin', async () => {
    const response = await request(app)
      .patch(`/aircraft-cards/${testCardId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ name: 'Air BP Fuel Card Updated' })

    expect(response.status).toBe(200)
    expect(response.body.name).toBe('Air BP Fuel Card Updated')
    expect(response.body.updatedBy).toBe('k1mnimda')
  })

  it('should return 404 for non-existent card', async () => {
    const response = await request(app)
      .patch('/aircraft-cards/999999')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ name: 'Updated' })

    expect(response.status).toBe(404)
  })

  it('should return 400 when patch creates invalid date range', async () => {
    const response = await request(app)
      .patch(`/aircraft-cards/${testCardId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ validFrom: '2027-01-01' }) // after existing validTo 2026-12-31

    expect(response.status).toBe(400)
  })

  it('should return 400 for invalid date format in patch', async () => {
    const response = await request(app)
      .patch(`/aircraft-cards/${testCardId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ validTo: 'not-a-date' })

    expect(response.status).toBe(400)
  })
})

describe('DELETE /aircraft-cards/:cardId', () => {
  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .delete('/aircraft-cards/1')
      .set('Cookie', `accessToken=INVALID`)

    expect(response.status).toBe(401)
  })

  it('should return 403 when not admin', async () => {
    const response = await request(app)
      .delete('/aircraft-cards/1')
      .set('Cookie', `accessToken=${userToken}`)

    expect(response.status).toBe(403)
  })

  it('should return 404 for non-existent card', async () => {
    const response = await request(app)
      .delete('/aircraft-cards/999999')
      .set('Cookie', `accessToken=${adminToken}`)

    expect(response.status).toBe(404)
  })

  it('should delete card when authenticated as admin', async () => {
    const createResponse = await request(app)
      .post('/aircraft-cards')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(newCard)
    expect(createResponse.status).toBe(201)
    const cardId = createResponse.body.cardId

    const deleteResponse = await request(app)
      .delete(`/aircraft-cards/${cardId}`)
      .set('Cookie', `accessToken=${adminToken}`)

    expect(deleteResponse.status).toBe(204)

    // Verify it's gone
    const getResponse = await request(app)
      .get(`/aircraft-cards/${cardId}`)
      .set('Cookie', `accessToken=${userToken}`)

    expect(getResponse.status).toBe(404)
  })
})
