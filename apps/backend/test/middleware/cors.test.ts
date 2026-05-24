import 'dotenv/config'
import express from 'express'
import request from 'supertest'
import cors from 'cors'

describe('CORS Configuration', () => {
  let app: express.Application

  beforeEach(() => {
    app = express()
  })

  const createAppWithCorsOrigins = (origins: string) => {
    // Simulate the same CORS logic as app.ts
    const corsOrigins = origins
      ? origins
          .split(',')
          .map(origin => origin.trim())
          .filter(origin => origin.length > 0)
      : ['*']

    if (corsOrigins.length === 0) {
      corsOrigins.push('*')
    }

    // Wildcard origin cannot be combined with credentials: true (violates CORS spec)
    const isWildcard = corsOrigins.length === 1 && corsOrigins[0] === '*'

    app.use(
      cors({
        origin: isWildcard ? '*' : corsOrigins,
        credentials: !isWildcard,
      }),
    )

    app.get('/test', (_req, res) => {
      res.json({ status: 'ok' })
    })

    return app
  }

  describe('Multiple allowed origins', () => {
    const allowedOrigins =
      'http://localhost:5173,https://beta.mik.fi,https://walrus-app-sa62h.ondigitalocean.app'

    beforeEach(() => {
      app = createAppWithCorsOrigins(allowedOrigins)
    })

    test('should allow request from localhost:5173', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:5173')
        .expect(200)

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173')
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    test('should allow request from beta.mik.fi', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://beta.mik.fi')
        .expect(200)

      expect(response.headers['access-control-allow-origin']).toBe('https://beta.mik.fi')
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    test('should allow request from walrus-app-sa62h.ondigitalocean.app', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://walrus-app-sa62h.ondigitalocean.app')
        .expect(200)

      expect(response.headers['access-control-allow-origin']).toBe(
        'https://walrus-app-sa62h.ondigitalocean.app',
      )
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    test('should reject request from unauthorized origin', async () => {
      const response = await request(app).get('/test').set('Origin', 'https://evil.com').expect(200)

      // CORS middleware won't block the request, but won't set the CORS headers
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })

    test('should handle OPTIONS preflight request for allowed origin', async () => {
      const response = await request(app)
        .options('/test')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Content-Type')
        .expect(204)

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173')
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    test('should not set CORS headers for OPTIONS preflight from unauthorized origin', async () => {
      const response = await request(app)
        .options('/test')
        .set('Origin', 'https://evil.com')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Content-Type')
        .expect(204)

      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('Wildcard origin fallback', () => {
    beforeEach(() => {
      app = createAppWithCorsOrigins('')
    })

    test('should allow all origins when CORS_ALLOWED_ORIGINS is not set', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://any-domain.com')
        .expect(200)

      expect(response.headers['access-control-allow-origin']).toBe('*')
      // credentials must not be enabled with wildcard origin (violates CORS spec)
      expect(response.headers['access-control-allow-credentials']).toBeUndefined()
    })

    test('should keep wildcard behavior when configuration contains empty entries', async () => {
      app = createAppWithCorsOrigins('* ,')

      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://any-domain.com')
        .expect(200)

      expect(response.headers['access-control-allow-origin']).toBe('*')
      expect(response.headers['access-control-allow-credentials']).toBeUndefined()
    })
  })

  describe('Single origin configuration', () => {
    beforeEach(() => {
      app = createAppWithCorsOrigins('https://single-domain.com')
    })

    test('should allow request from the single allowed origin', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://single-domain.com')
        .expect(200)

      expect(response.headers['access-control-allow-origin']).toBe('https://single-domain.com')
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    test('should reject request from different origin', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://other-domain.com')
        .expect(200)

      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('Origin parsing with whitespace', () => {
    beforeEach(() => {
      app = createAppWithCorsOrigins('  http://localhost:5173  ,  https://beta.mik.fi  ')
    })

    test('should correctly trim whitespace from origins', async () => {
      const response1 = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:5173')
        .expect(200)

      expect(response1.headers['access-control-allow-origin']).toBe('http://localhost:5173')

      const response2 = await request(app)
        .get('/test')
        .set('Origin', 'https://beta.mik.fi')
        .expect(200)

      expect(response2.headers['access-control-allow-origin']).toBe('https://beta.mik.fi')
    })
  })
})
