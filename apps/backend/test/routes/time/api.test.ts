import { describe, it, expect, beforeAll } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import { router } from '../../../src/routes/time/api.ts'

const app = express()
app.use(express.json())
app.use('/time', router)

describe('GET /time', () => {
  let before: number
  let after: number
  let body: { utcIso: string; epochMs: number }

  beforeAll(async () => {
    before = Date.now()
    const response = await request(app).get('/time')
    after = Date.now()
    body = response.body
  })

  it('should return 200', async () => {
    const response = await request(app).get('/time')
    expect(response.status).toBe(200)
  })

  it('should return utcIso as a valid ISO 8601 string', () => {
    expect(typeof body.utcIso).toBe('string')
    expect(() => new Date(body.utcIso)).not.toThrow()
    expect(new Date(body.utcIso).toISOString()).toBe(body.utcIso)
  })

  it('should return epochMs as a number close to the current time', () => {
    expect(typeof body.epochMs).toBe('number')
    expect(body.epochMs).toBeGreaterThanOrEqual(before)
    expect(body.epochMs).toBeLessThanOrEqual(after)
  })

  it('should return utcIso and epochMs that are consistent with each other', () => {
    expect(new Date(body.utcIso).getTime()).toBe(body.epochMs)
  })

  it('should not require authentication', async () => {
    const response = await request(app).get('/time')
    expect(response.status).not.toBe(401)
    expect(response.status).not.toBe(403)
  })
})
