import 'dotenv/config'
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const mockGet = jest.fn<(...args: any[]) => Promise<any>>()

jest.unstable_mockModule('axios', () => ({
  default: {
    get: mockGet,
    isAxiosError: (err: unknown): boolean =>
      !!err && typeof err === 'object' && 'isAxiosError' in (err as object),
  },
}))

const { router } = await import('../../../src/routes/mileage-geo/api.ts')

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/mileage', router)
app.use(problemErrorHandler)

const memberToken = generateAccessToken({
  memberId: 'Juha1',
  lastName: 'Seppälä',
  email: 'juha@mik.fi',
  roles: [],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
})

beforeEach(() => {
  mockGet.mockReset()
})

describe('GET /mileage/address-search', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/mileage/address-search').query({ q: 'Helsinki' })
    expect(res.status).toBe(401)
  })

  it('returns empty results for a too-short query without calling Nominatim', async () => {
    const res = await request(app)
      .get('/mileage/address-search')
      .query({ q: 'He' })
      .set('Cookie', `accessToken=${memberToken}`)
    expect(res.status).toBe(200)
    expect(res.body.results).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('maps Nominatim results to {label, lat, lon}', async () => {
    mockGet.mockResolvedValueOnce({
      data: [{ display_name: 'Helsinki, Finland', lat: '60.1699', lon: '24.9384' }],
    })
    const res = await request(app)
      .get('/mileage/address-search')
      .query({ q: 'Helsinki' })
      .set('Cookie', `accessToken=${memberToken}`)
    expect(res.status).toBe(200)
    expect(res.body.results).toEqual([{ label: 'Helsinki, Finland', lat: 60.1699, lon: 24.9384 }])
  })

  it('maps a connection timeout to 504', async () => {
    mockGet.mockRejectedValueOnce({ isAxiosError: true, code: 'ECONNABORTED' })
    const res = await request(app)
      .get('/mileage/address-search')
      .query({ q: 'Helsinki' })
      .set('Cookie', `accessToken=${memberToken}`)
    expect(res.status).toBe(504)
  })

  it('maps an upstream 5xx to 503', async () => {
    mockGet.mockRejectedValueOnce({ isAxiosError: true, response: { status: 500 } })
    const res = await request(app)
      .get('/mileage/address-search')
      .query({ q: 'Helsinki' })
      .set('Cookie', `accessToken=${memberToken}`)
    expect(res.status).toBe(503)
  })
})

describe('POST /mileage/route-distance', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/mileage/route-distance').send({})
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid body', async () => {
    const res = await request(app)
      .post('/mileage/route-distance')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({ start: { lat: 60 } })
    expect(res.status).toBe(400)
  })

  it('computes the same distance for both fields when there are no waypoints', async () => {
    mockGet.mockResolvedValueOnce({ data: { code: 'Ok', routes: [{ distance: 100000 }] } })
    const res = await request(app)
      .post('/mileage/route-distance')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        start: { lat: 60.1699, lon: 24.9384 },
        end: { lat: 61.4978, lon: 23.761 },
      })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ distanceKm: 100, directDistanceKm: 100 })
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('calls OSRM twice when waypoints are given, once direct and once via the waypoints', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { code: 'Ok', routes: [{ distance: 100000 }] } }) // direct
      .mockResolvedValueOnce({ data: { code: 'Ok', routes: [{ distance: 130000 }] } }) // via waypoint
    const res = await request(app)
      .post('/mileage/route-distance')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        start: { lat: 60.1699, lon: 24.9384 },
        end: { lat: 61.4978, lon: 23.761 },
        waypoints: [{ lat: 60.9827, lon: 25.6612 }],
      })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ distanceKm: 130, directDistanceKm: 100 })
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('returns an error when OSRM has no route', async () => {
    mockGet.mockResolvedValueOnce({ data: { code: 'NoRoute', routes: [] } })
    const res = await request(app)
      .post('/mileage/route-distance')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        start: { lat: 60.1699, lon: 24.9384 },
        end: { lat: 61.4978, lon: 23.761 },
      })
    expect(res.status).toBe(500)
  })
})
