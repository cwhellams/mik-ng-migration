import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import { MIKPermissions } from '@mik/contracts/members'

const mockGetUsefulPhoneNumbers = jest.fn<(...args: any[]) => Promise<unknown[]>>()
const mockGetFlightPlanCentrePhoneNumber = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockCreateUsefulPhoneNumber = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockUpdateUsefulPhoneNumber = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockDeleteUsefulPhoneNumber = jest.fn<(...args: any[]) => Promise<boolean>>()

jest.unstable_mockModule('../../../src/db/useful-phone-number-queries.ts', () => ({
  getUsefulPhoneNumbers: mockGetUsefulPhoneNumbers,
  getFlightPlanCentrePhoneNumber: mockGetFlightPlanCentrePhoneNumber,
  createUsefulPhoneNumber: mockCreateUsefulPhoneNumber,
  updateUsefulPhoneNumber: mockUpdateUsefulPhoneNumber,
  deleteUsefulPhoneNumber: mockDeleteUsefulPhoneNumber,
}))

let mockUserPermissions: MIKPermissions[] = []

jest.unstable_mockModule('../../../src/middleware/authMiddleware.ts', () => ({
  validateUser:
    (...permissions: MIKPermissions[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      req.user = {
        memberId: 'test-user',
        lastName: 'User',
        email: 'user@test.com',
        roles: [],
        permissions: mockUserPermissions,
        canMakeReservations: true,
      }

      if (
        permissions.length === 0 ||
        permissions.some((permission) => mockUserPermissions.includes(permission))
      ) {
        return next()
      }

      return res.status(403).json({ status: 403, title: 'Forbidden', detail: 'Protected Content' })
    },
}))

const { router } = await import('../../../src/routes/useful-phone-numbers/api.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use('/api/v1/useful-phone-numbers', router)
app.use(problemErrorHandler)

const sample = {
  label: 'FLIGHT_PLAN_CENTER',
  phoneNumber: '029 150 2071',
  sortOrder: 0,
}

describe('Useful phone numbers API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUserPermissions = []
  })

  it('GET / is public and returns the list', async () => {
    mockGetUsefulPhoneNumbers.mockResolvedValue([sample])

    const response = await request(app).get('/api/v1/useful-phone-numbers')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([sample])
  })

  it('GET /flight-plan-centre returns the configured number', async () => {
    mockGetFlightPlanCentrePhoneNumber.mockResolvedValue(sample)

    const response = await request(app).get('/api/v1/useful-phone-numbers/flight-plan-centre')

    expect(response.status).toBe(200)
    expect(response.body).toEqual(sample)
  })

  it('GET /flight-plan-centre returns 404 when none configured', async () => {
    mockGetFlightPlanCentrePhoneNumber.mockResolvedValue(undefined)

    const response = await request(app).get('/api/v1/useful-phone-numbers/flight-plan-centre')

    expect(response.status).toBe(404)
  })

  it('POST / requires admin permission', async () => {
    const response = await request(app).post('/api/v1/useful-phone-numbers').send({
      label: 'Test',
      phoneNumber: '123',
      sortOrder: 0,
    })

    expect(response.status).toBe(403)
    expect(mockCreateUsefulPhoneNumber).not.toHaveBeenCalled()
  })

  it('POST / creates a new phone number', async () => {
    mockUserPermissions = [MIKPermissions.MEMBER_ADMIN]
    mockCreateUsefulPhoneNumber.mockResolvedValue(sample)

    const response = await request(app).post('/api/v1/useful-phone-numbers').send({
      label: sample.label,
      phoneNumber: sample.phoneNumber,
      sortOrder: sample.sortOrder,
    })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(sample)
    expect(mockCreateUsefulPhoneNumber).toHaveBeenCalledWith(
      sample.label,
      sample.phoneNumber,
      sample.sortOrder,
    )
  })

  it('PUT /:label returns 404 when not found', async () => {
    mockUserPermissions = [MIKPermissions.MEMBER_ADMIN]
    mockUpdateUsefulPhoneNumber.mockResolvedValue(undefined)

    const response = await request(app)
      .put('/api/v1/useful-phone-numbers/MISSING')
      .send({ phoneNumber: sample.phoneNumber, sortOrder: sample.sortOrder })

    expect(response.status).toBe(404)
  })

  it('PUT /:label updates an existing phone number', async () => {
    mockUserPermissions = [MIKPermissions.MEMBER_ADMIN]
    mockUpdateUsefulPhoneNumber.mockResolvedValue(sample)

    const response = await request(app)
      .put(`/api/v1/useful-phone-numbers/${sample.label}`)
      .send({ phoneNumber: sample.phoneNumber, sortOrder: sample.sortOrder })

    expect(response.status).toBe(200)
    expect(mockUpdateUsefulPhoneNumber).toHaveBeenCalledWith(
      sample.label,
      sample.phoneNumber,
      sample.sortOrder,
    )
  })

  it('DELETE /:label returns 204 on success', async () => {
    mockUserPermissions = [MIKPermissions.MEMBER_ADMIN]
    mockDeleteUsefulPhoneNumber.mockResolvedValue(true)

    const response = await request(app).delete(`/api/v1/useful-phone-numbers/${sample.label}`)

    expect(response.status).toBe(204)
    expect(mockDeleteUsefulPhoneNumber).toHaveBeenCalledWith(sample.label)
  })
})
