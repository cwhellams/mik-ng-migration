import { jest } from '@jest/globals'

import 'dotenv/config'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import router from '../../../src/routes/invoicing/api.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { simplbooksApiClient } from '../../../src/services/simplbooks/simplbooksApiClient.ts'
import { mockSimplbooksGet, mockSimplbooksPost } from '../../__mocks__/simplbooksMock.ts'
import { deleteCreatedInvoiceItems } from '../../db/__helpers__/simplbooksDbHelpers.ts'
import { db } from '../../../src/db/connection.ts'
import { FeeProcessingStatus, RecurringFeeType } from '../../../src/services/simplbooks/models.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/invoices', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
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
  email: 'member@mik.fi',
  roles: [],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
})

describe('GET /', () => {
  it('should return invoices for admin', async () => {
    const res = await request(app)
      .get('/invoices')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({})
    expect(res.status).toBe(200)
    expect(res.body.invoices).toHaveLength(15)
  })

  it('should return 400 for invalid query params', async () => {
    const res = await request(app)
      .get('/invoices?id=not-a-number')
      .set('Cookie', `accessToken=${adminToken}`)

    expect(res.status).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
    expect(res.body.errors.length).toBeGreaterThan(0)
  })

  it('should return 1 for member', async () => {
    const res = await request(app).get('/invoices').set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.invoices).toHaveLength(2)
  })

  it('should return 401 for invalid token', async () => {
    const res = await request(app).get('/invoices').set('Cookie', `accessToken=badToken`)
    expect(res.status).toBe(401)
  })
})

describe('GET /items', () => {
  it('should return invoice items', async () => {
    const res = await request(app).get('/invoices/items').set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBeGreaterThanOrEqual(3)
    // Verify expected items are present
    const codes = res.body.items.map((item: any) => item.code)
    expect(codes).toContain('OH-STL')
    expect(codes).toContain('JUNIOR')
    expect(codes).toContain('VIRHEMERKINTA')
  })

  it('should return 401 for invalid token', async () => {
    const res = await request(app).get('/invoices/items').set('Cookie', `accessToken=badToken`)
    expect(res.status).toBe(401)
  })
})

describe('Invoice Simplbooks tests', () => {
  beforeAll(() => {
    jest.clearAllMocks()

    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(mockSimplbooksPost)
  })

  afterAll(async () => {
    await deleteCreatedInvoiceItems()
  })

  it('should refresh items', async () => {
    const simplbooksSpy = jest
      .spyOn(simplbooksApiClient, 'get')
      .mockImplementation(mockSimplbooksGet)

    const res = await request(app)
      .patch('/invoices/items/refresh')
      .set('Cookie', `accessToken=${adminToken}`)

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
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        aircraftRegistration: 'OH-STL',
        endDate: '1999-01-10',
      })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Flights sent for invoicing')
  })

  it('should return 401 for invalid token', async () => {
    const res = await request(app).post('/invoices/flights').set('Cookie', `accessToken=badToken`)
    expect(res.status).toBe(401)
  })

  it('should return 403 for non admin user', async () => {
    const res = await request(app)
      .post('/invoices/flights')
      .set('Cookie', `accessToken=${memberToken}`)
    expect(res.status).toBe(403)
  })
})

describe('GET /flights', () => {
  it('should return invoicable flights for admin', async () => {
    const res = await request(app)
      .get('/invoices/flights')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ aircraftRegistration: 'OH-STL', endDate: '2100-01-10' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('logs')
  })

  it('should return 403 for non admin user', async () => {
    const res = await request(app)
      .get('/invoices/flights')
      .set('Cookie', `accessToken=${memberToken}`)
      .query({ limit: 10 })

    expect(res.status).toBe(403)
  })
})

describe('GET /annualMembershipBillingRuns', () => {
  it('should return billing runs for admin', async () => {
    const res = await request(app)
      .get('/invoices/annualMembershipBillingRuns')
      .set('Cookie', `accessToken=${adminToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('should return 403 for non admin user', async () => {
    const res = await request(app)
      .get('/invoices/annualMembershipBillingRuns')
      .set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(403)
    expect(res.body.detail).toContain('does not have permission')
  })
})

describe('POST /triggerAnnualMembershipBillingProcess', () => {
  const currentYear = new Date().getFullYear()

  beforeAll(async () => {
    // Remove any existing fee processing record for the current year so the test
    // does not fail if test data already marks it as processed (e.g. V180__NonRenewalsData.sql)
    await db
      .deleteFrom('accts.recurring_fees_processing')
      .where('fee_type', '=', RecurringFeeType.ANNUAL_FEE)
      .where('year', '=', currentYear)
      .execute()
  })

  afterAll(async () => {
    // Restore the processed record so other tests that rely on this data still pass
    await db
      .insertInto('accts.recurring_fees_processing')
      .values({
        fee_type: RecurringFeeType.ANNUAL_FEE,
        year: currentYear,
        status: FeeProcessingStatus.PROCESSED,
        created_by: 'k1mnimda',
        updated_by: 'k1mnimda',
      })
      .onConflict((oc) => oc.columns(['fee_type', 'year']).doNothing())
      .execute()
  })

  it('should trigger annual billing process for admin', async () => {
    const res = await request(app)
      .post('/invoices/triggerAnnualMembershipBillingProcess/')
      .set('Cookie', `accessToken=${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('membersProcessed')
  })

  it('should return 401 for invalid token', async () => {
    const res = await request(app)
      .post('/invoices/triggerAnnualMembershipBillingProcess/')
      .set('Cookie', `accessToken=badToken`)

    expect(res.status).toBe(401)
  })
})

describe('POST /requestOwnEquipmentFeeInvoice', () => {
  it('should create equipment fee invoice for member', async () => {
    const res = await request(app)
      .post('/invoices/requestOwnEquipmentFeeInvoice')
      .set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(200)
  })

  it('should return 401 for invalid token', async () => {
    const res = await request(app)
      .post('/invoices/requestOwnEquipmentFeeInvoice')
      .set('Cookie', `accessToken=badToken`)

    expect(res.status).toBe(401)
  })
})

describe('POST /sendEquipmentFeeInvoiceToMember', () => {
  it('should send equipment fee invoice as admin', async () => {
    const res = await request(app)
      .post('/invoices/sendEquipmentFeeInvoiceToMember')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ memberId: 'Matti1' })

    expect(res.status).toBe(200)
  })

  it('should return 403 for non admin user', async () => {
    const res = await request(app)
      .post('/invoices/sendEquipmentFeeInvoiceToMember')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({ memberId: 'Antti1' })

    expect(res.status).toBe(403)
    expect(res.body.detail).toContain('does not have permission')
  })
})

describe('GET /:invoiceId/pdf', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock the getInvoicePdf to return a base64 string
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/invoices/') && path.includes('/pdf')) {
        return { data: 'base64encodedpdfstring' }
      }
      return mockSimplbooksGet(path)
    })
  })

  // TODO Get mocking working

  // it.only('should return PDF for valid invoice', async () => {
  //   const res = await request(app)
  //     .get('/invoices/2788/pdf')
  //     .set('Cookie', `accessToken=${memberToken}`)

  //   expect(res.status).toBe(200)
  // })

  it('should return 400 for invalid invoice ID', async () => {
    const res = await request(app)
      .get('/invoices/invalid/pdf')
      .set('Cookie', `accessToken=${adminToken}`)

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('Invalid invoice ID')
  })

  it('should return 401 for invalid token', async () => {
    const res = await request(app).get('/invoices/2788/pdf').set('Cookie', `accessToken=badToken`)

    expect(res.status).toBe(401)
  })
})
