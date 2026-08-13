import express from 'express'
import request from 'supertest'
import { rateLimiterMiddleware } from '../../src/middleware/rateLimiter.js'
import cookieParser from 'cookie-parser'

describe('Rate Limiter Middleware', () => {
  let app: express.Application

  beforeEach(() => {
    app = express()
    app.use(cookieParser())
    app.use(rateLimiterMiddleware)

    // Test routes
    app.get('/test-get', (_req, res) => {
      res.json({ status: 'ok' })
    })

    app.post('/test-post', (_req, res) => {
      res.json({ status: 'ok' })
    })

    app.put('/test-put', (_req, res) => {
      res.json({ status: 'ok' })
    })

    app.options('/test-options', (_req, res) => {
      res.status(204).send()
    })

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' })
    })

    app.get('/api/v1/version', (_req, res) => {
      res.json({ version: '1.0.0' })
    })

    app.get('/api/v1/time', (_req, res) => {
      res.json({ time: Date.now() })
    })
  })

  describe('Exempt paths', () => {
    test('should not rate limit /health endpoint', async () => {
      // Make many requests - should all succeed
      const requests = Array(50)
        .fill(null)
        .map(() => request(app).get('/health'))

      const responses = await Promise.all(requests)

      // All requests should succeed (200, not 429)
      responses.forEach((response) => {
        expect(response.status).toBe(200)
      })
    })

    test('should not rate limit /api/v1/version endpoint', async () => {
      // Make many requests - should all succeed
      const requests = Array(50)
        .fill(null)
        .map(() => request(app).get('/api/v1/version'))

      const responses = await Promise.all(requests)

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200)
      })
    })

    test('should not rate limit /api/v1/time endpoint', async () => {
      // Make many requests - should all succeed
      const requests = Array(50)
        .fill(null)
        .map(() => request(app).get('/api/v1/time'))

      const responses = await Promise.all(requests)

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200)
      })
    })
  })

  describe('OPTIONS requests (CORS preflight)', () => {
    test('should not rate limit OPTIONS requests', async () => {
      // Make many OPTIONS requests - should all succeed
      const requests = Array(50)
        .fill(null)
        .map(() => request(app).options('/test-options'))

      const responses = await Promise.all(requests)

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(204)
      })
    })
  })

  describe('Authenticated GET requests', () => {
    test('should allow many GET requests with authentication token (0.5 points each)', async () => {
      // With 40 points budget and 0.5 points per GET, we should be able to make 80 GET requests
      // Let's test with 70 to have margin
      const requests = Array(70)
        .fill(null)
        .map(() => request(app).get('/test-get').set('Cookie', 'accessToken=valid-token'))

      const responses = await Promise.all(requests)

      // Most requests should succeed
      const successCount = responses.filter((r) => r.status === 200).length
      expect(successCount).toBeGreaterThan(60) // Should allow most requests
    })

    test('should handle dashboard-like parallel GET requests', async () => {
      // Simulate a dashboard load with 35 parallel GET requests (common scenario)
      const requests = Array(35)
        .fill(null)
        .map(() => request(app).get('/test-get').set('Cookie', 'accessToken=valid-token'))

      const responses = await Promise.all(requests)

      // All requests should succeed (35 * 0.5 = 17.5 points, well under 40)
      const successCount = responses.filter((r) => r.status === 200).length
      expect(successCount).toBe(35)
    })
  })

  describe('Authenticated write requests', () => {
    test('should consume more points for POST requests (2 points each)', async () => {
      // With 40 points budget and 2 points per POST, we should be able to make 20 POST requests
      // Let's test with 25 to verify rate limiting kicks in
      const requests = Array(25)
        .fill(null)
        .map(() => request(app).post('/test-post').set('Cookie', 'accessToken=valid-token'))

      const responses = await Promise.all(requests)

      // Some requests should be rate limited
      const rateLimitedCount = responses.filter((r) => r.status === 429).length
      expect(rateLimitedCount).toBeGreaterThan(0)
    })

    test('should consume more points for PUT requests (2 points each)', async () => {
      const requests = Array(25)
        .fill(null)
        .map(() => request(app).put('/test-put').set('Cookie', 'accessToken=valid-token'))

      const responses = await Promise.all(requests)

      // Some requests should be rate limited
      const rateLimitedCount = responses.filter((r) => r.status === 429).length
      expect(rateLimitedCount).toBeGreaterThan(0)
    })
  })

  describe('Unauthenticated requests', () => {
    test('should consume 3 points for unauthenticated requests', async () => {
      // With 40 points budget and 3 points per request, we should be able to make ~13 requests
      // Let's test with 20 to verify rate limiting
      const requests = Array(20)
        .fill(null)
        .map(() => request(app).get('/test-get'))

      const responses = await Promise.all(requests)

      // Some requests should be rate limited
      const rateLimitedCount = responses.filter((r) => r.status === 429).length
      expect(rateLimitedCount).toBeGreaterThan(0)

      // Should allow approximately 13 requests (40 / 3 ≈ 13)
      const successCount = responses.filter((r) => r.status === 200).length
      expect(successCount).toBeLessThan(16)
    })
  })

  describe('Rate limit response', () => {
    test('should return 429 status with proper message when rate limited', async () => {
      // Make enough requests to trigger rate limit
      const requests = Array(100)
        .fill(null)
        .map(() => request(app).get('/test-get'))

      const responses = await Promise.all(requests)

      // Find a rate limited response
      const rateLimitedResponse = responses.find((r) => r.status === 429)
      expect(rateLimitedResponse).toBeDefined()

      if (rateLimitedResponse) {
        expect(rateLimitedResponse.body).toEqual({
          status: 429,
          title: 'Too many requests, slow down.',
        })
      }
    })
  })
})
