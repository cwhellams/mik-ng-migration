import 'dotenv/config'
import express from 'express'
import request from 'supertest'
import cors from 'cors'

describe('CORS Configuration', () => {
  let app: express.Application

  beforeEach(() => {
    app = express()
  })

  /**
   * Mirrors the CORS logic in app.ts.
   * Wildcard ('*') values are stripped — they are incompatible with credentialed requests.
   * @param origins  comma-separated origin string (mirrors CORS_ALLOWED_ORIGINS env var)
   * @param nodeEnv  simulated NODE_ENV (default: 'test')
   */
  const createAppWithCorsOrigins = (origins: string, nodeEnv = 'test') => {
    const rawOrigins = origins
      ? origins
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0 && origin !== '*')
      : []

    let corsOrigins: string[]

    if (rawOrigins.length === 0) {
      corsOrigins = nodeEnv === 'production' ? [] : ['http://localhost:5173']
    } else {
      corsOrigins = rawOrigins
    }

    app.use(
      cors({
        origin: corsOrigins.length > 0 ? corsOrigins : false,
        credentials: true,
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

  describe('Default origin fallback (non-production)', () => {
    test('should default to localhost:5173 when CORS_ALLOWED_ORIGINS is not set', async () => {
      app = createAppWithCorsOrigins('')

      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:5173')
        .expect(200)

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173')
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    test('should reject other origins when defaulting to localhost', async () => {
      app = createAppWithCorsOrigins('')

      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://intra.mik.fi')
        .expect(200)

      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })

    test('should strip wildcard and fall back to localhost in non-production', async () => {
      app = createAppWithCorsOrigins('*')

      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:5173')
        .expect(200)

      // Wildcard is stripped; falls back to localhost default
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173')
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })
  })

  describe('Production with no valid origins configured', () => {
    test('should block all cross-origin requests when misconfigured in production', async () => {
      app = createAppWithCorsOrigins('', 'production')

      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://intra.mik.fi')
        .expect(200)

      // No origins configured in prod → all cross-origin requests are blocked
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })

    test('should block wildcard-only config in production', async () => {
      app = createAppWithCorsOrigins('*', 'production')

      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://any-domain.com')
        .expect(200)

      expect(response.headers['access-control-allow-origin']).toBeUndefined()
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
