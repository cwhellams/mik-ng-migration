import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import { MIKPermissions } from '@mik/contracts/members'

const mockGetCostCentres =
  jest.fn<(...args: any[]) => Promise<Array<{ code: string; description: string }>>>()
const mockCreateCostCentre =
  jest.fn<(...args: any[]) => Promise<{ code: string; description: string }>>()
const mockUpdateCostCentre =
  jest.fn<(...args: any[]) => Promise<{ code: string; description: string } | undefined>>()
const mockDeleteCostCentre = jest.fn<(...args: any[]) => Promise<boolean>>()

jest.unstable_mockModule('../../../src/db/cost-centre-queries.ts', () => ({
  getCostCentres: mockGetCostCentres,
  createCostCentre: mockCreateCostCentre,
  updateCostCentre: mockUpdateCostCentre,
  deleteCostCentre: mockDeleteCostCentre,
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

const { router } = await import('../../../src/routes/cost-centres/api.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use('/api/v1/cost-centres', router)
app.use(problemErrorHandler)

describe('Cost centres API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUserPermissions = []
  })

  it('GET / returns list for expense users', async () => {
    mockUserPermissions = [MIKPermissions.EXPENSE_USER]
    mockGetCostCentres.mockResolvedValue([{ code: 'OH', description: 'Overhead' }])

    const response = await request(app).get('/api/v1/cost-centres')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ code: 'OH', description: 'Overhead' }])
    expect(mockGetCostCentres).toHaveBeenCalledTimes(1)
  })

  it('POST / requires expense admin permission', async () => {
    mockUserPermissions = [MIKPermissions.EXPENSE_USER]

    const response = await request(app)
      .post('/api/v1/cost-centres')
      .send({ code: 'AC', description: 'Aircraft' })

    expect(response.status).toBe(403)
    expect(mockCreateCostCentre).not.toHaveBeenCalled()
  })

  it('POST / returns conflict for duplicate code', async () => {
    mockUserPermissions = [MIKPermissions.EXPENSE_ADMIN]
    mockGetCostCentres.mockResolvedValue([{ code: 'AC', description: 'Aircraft' }])

    const response = await request(app)
      .post('/api/v1/cost-centres')
      .send({ code: 'AC', description: 'Duplicate' })

    expect(response.status).toBe(409)
    expect(response.body.detail).toContain("Cost centre 'AC' already exists.")
    expect(mockCreateCostCentre).not.toHaveBeenCalled()
  })

  it('POST / creates a new cost centre', async () => {
    mockUserPermissions = [MIKPermissions.EXPENSE_ADMIN]
    mockGetCostCentres.mockResolvedValue([])
    mockCreateCostCentre.mockResolvedValue({ code: 'NEW', description: 'New one' })

    const response = await request(app)
      .post('/api/v1/cost-centres')
      .send({ code: 'NEW', description: 'New one' })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ code: 'NEW', description: 'New one' })
    expect(mockCreateCostCentre).toHaveBeenCalledWith('NEW', 'New one')
  })

  it('PUT /:code returns not found when code is missing', async () => {
    mockUserPermissions = [MIKPermissions.EXPENSE_ADMIN]
    mockUpdateCostCentre.mockResolvedValue(undefined)

    const response = await request(app)
      .put('/api/v1/cost-centres/MISS')
      .send({ description: 'Updated' })

    expect(response.status).toBe(404)
    expect(response.body.detail).toBe('Cost centre not found.')
  })

  it('PUT /:code updates existing code', async () => {
    mockUserPermissions = [MIKPermissions.EXPENSE_ADMIN]
    mockUpdateCostCentre.mockResolvedValue({ code: 'AC', description: 'Updated' })

    const response = await request(app)
      .put('/api/v1/cost-centres/AC')
      .send({ description: 'Updated' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ code: 'AC', description: 'Updated' })
    expect(mockUpdateCostCentre).toHaveBeenCalledWith('AC', 'Updated')
  })

  it('DELETE /:code returns 404 for unknown code', async () => {
    mockUserPermissions = [MIKPermissions.EXPENSE_ADMIN]
    mockDeleteCostCentre.mockResolvedValue(false)

    const response = await request(app).delete('/api/v1/cost-centres/NOPE')

    expect(response.status).toBe(404)
    expect(response.body.detail).toBe('Cost centre not found.')
  })

  it('DELETE /:code returns 204 when deletion succeeds', async () => {
    mockUserPermissions = [MIKPermissions.EXPENSE_ADMIN]
    mockDeleteCostCentre.mockResolvedValue(true)

    const response = await request(app).delete('/api/v1/cost-centres/AC')

    expect(response.status).toBe(204)
    expect(mockDeleteCostCentre).toHaveBeenCalledWith('AC')
  })
})
