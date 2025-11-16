import { jest } from '@jest/globals'

import 'dotenv/config'
import request from 'supertest'
import express from 'express'
import router from '../../../src/routes/invoicing/api.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { simplbooksApiClient } from '../../../src/services/simplbooks/simplbooksApiClient.ts'
import { mockSimplbooksGet, mockSimplbooksPost } from '../../__mocks__/simplbooksMock.ts'
import { deleteCreatedInvoiceItems } from '../../db/__helpers__/simplbooksDbHelpers.ts'

const app = express()
app.use(express.json())
app.use('/invoices', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  email: 'admin@mik.fi',
  permissions: [MIKPermissions.INVOICING_ADMIN],
})

const memberToken = generateAccessToken({
  memberId: 'Matti1',
  email: 'member@mik.fi',
  permissions: [MIKPermissions.MEMBER],
})

describe('GET /', () => {
  it('should return invoices for admin', async () => {
    const res = await request(app)
      .get('/invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({})
    expect(res.status).toBe(200)
    expect(res.body.invoices).toHaveLength(12)
  })

  it('should return 400 for invalid query params', async () => {
    const res = await request(app)
      .get('/invoices?id=not-a-number')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('search criteria are invalid')
  })

  it('should return 1 for member', async () => {
    const res = await request(app).get('/invoices').set('Authorization', `Bearer ${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.invoices).toHaveLength(1)
  })

  it('should return 401 for invalid token', async () => {
    const res = await request(app).get('/invoices').set('Authorization', `Bearer badToken`)
    expect(res.status).toBe(401)
  })
})

describe('GET /items', () => {
  it('should return invoice items', async () => {
    const res = await request(app)
      .get('/invoices/items')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(3)
  })

  it('should return 401 for invalid token', async () => {
    const res = await request(app).get('/invoices/items').set('Authorization', `Bearer badToken`)
    expect(res.status).toBe(401)
  })
})

describe('Invoice Simplbooks tests', () => {
  beforeAll(() => {
    jest.clearAllMocks()

    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(mockSimplbooksPost)
  })

  afterAll(() => {
    deleteCreatedInvoiceItems()
  })

  it('should refresh items', async () => {
    const simplbooksSpy = jest
      .spyOn(simplbooksApiClient, 'get')
      .mockImplementation(mockSimplbooksGet)

    const res = await request(app)
      .patch('/invoices/items/refresh')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(simplbooksSpy).toHaveBeenCalledWith('/articles/list', {
      data: { page: 1, per_page: 50 },
    })

    expect(res.status).toBe(200)
  })
})

describe('POST /flights', () => {
  it('should create a new invoice', async () => {
    const res = await request(app)
      .post('/invoices/flights')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        aircraftRegistration: 'OH-STL',
        endDate: '1999-01-10',
      })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Flights sent for invoicing')
  })

  it('should return 401 for invalid token', async () => {
    const res = await request(app).post('/invoices/flights').set('Authorization', `Bearer badToken`)
    expect(res.status).toBe(401)
  })

  it('should return 403 for non admin user', async () => {
    const res = await request(app)
      .post('/invoices/flights')
      .set('Authorization', `Bearer ${memberToken}`)
    expect(res.status).toBe(403)
  })
})
