import { describe, it, expect, beforeAll } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import helmet from 'helmet'

/**
 * Security headers test suite
 *
 * Tests the helmet() configuration in apps/backend/src/app.ts to ensure:
 * 1. Permissions-Policy header is set
 * 2. CSP is disabled when Cloudflare is proxying (CF-Ray present), and a fallback
 *    CSP applies when it is not, so a request can never leave with no CSP at all
 * 3. Other helmet() defaults are preserved (COOP, CORP, etc.)
 *
 * This addresses issue #1149.
 */
describe('Security Headers (Backend)', () => {
  let app: express.Application

  beforeAll(() => {
    app = express()

    // Replicate the helmet() configuration from apps/backend/src/app.ts
    app.use(
      helmet({
        contentSecurityPolicy: false,
        strictTransportSecurity: false,
      }),
    )

    // Permissions-Policy header (manually added as helmet v8 doesn't include it)
    app.use((_req, res, next) => {
      res.setHeader(
        'Permissions-Policy',
        'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
      )
      next()
    })

    // Fallback CSP for requests that bypass the Cloudflare edge rule (no CF-Ray header)
    const fallbackContentSecurityPolicy = helmet.contentSecurityPolicy()
    app.use((req, res, next) => {
      if (req.headers['cf-ray']) {
        next()
        return
      }
      fallbackContentSecurityPolicy(req, res, next)
    })

    app.use(express.json())

    // Test route to verify headers
    app.get('/test-headers', (_req, res) => {
      res.json({ status: 'ok' })
    })
  })

  describe('Permissions-Policy header', () => {
    it('should set Permissions-Policy header with locked-down features', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      expect(response.headers['permissions-policy']).toBeDefined()
      // Permissions-Policy is set by our own middleware, not helmet(); verify it
      // includes the expected directives.
      const permissionsPolicy = response.headers['permissions-policy'] as string
      expect(permissionsPolicy).toContain('geolocation=()')
      expect(permissionsPolicy).toContain('camera=()')
      expect(permissionsPolicy).toContain('microphone=()')
      expect(permissionsPolicy).toContain('payment=()')
      expect(permissionsPolicy).toContain('usb=()')
    })

    it('should apply Permissions-Policy to test endpoint', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      expect(response.headers['permissions-policy']).toBeDefined()
      const permissionsPolicy = response.headers['permissions-policy'] as string
      expect(permissionsPolicy).toContain('geolocation=()')
    })
  })

  describe('Content-Security-Policy (should be disabled)', () => {
    it('should NOT set CSP header when proxied by Cloudflare (delegated to edge rule)', async () => {
      const response = await request(app)
        .get('/test-headers')
        .set('CF-Ray', '1234567890abcdef-FRA')
        .expect(200)

      // CSP is disabled in helmet() config to avoid duplication with Cloudflare;
      // the CF-Ray header (added by Cloudflare to every proxied request) confirms
      // this request went through the edge rule, so no fallback CSP applies either.
      expect(response.headers['content-security-policy']).toBeUndefined()
    })

    it('should set a fallback CSP when a request bypasses Cloudflare (no CF-Ray header)', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      // Without CF-Ray, the request did not go through the Cloudflare edge rule,
      // so the app's own fallback CSP middleware applies as a safety net.
      expect(response.headers['content-security-policy']).toBeDefined()
    })
  })

  describe('Other helmet() defaults (should be preserved)', () => {
    it('should set Cross-Origin-Opener-Policy', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      expect(response.headers['cross-origin-opener-policy']).toBe('same-origin')
    })

    it('should set Cross-Origin-Resource-Policy', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      expect(response.headers['cross-origin-resource-policy']).toBe('same-origin')
    })

    it('should set X-DNS-Prefetch-Control', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      expect(response.headers['x-dns-prefetch-control']).toBe('off')
    })

    it('should set X-Permitted-Cross-Domain-Policies', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      expect(response.headers['x-permitted-cross-domain-policies']).toBe('none')
    })

    it('should set Origin-Agent-Cluster', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      expect(response.headers['origin-agent-cluster']).toBe('?1')
    })

    it('should set X-Content-Type-Options', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      expect(response.headers['x-content-type-options']).toBe('nosniff')
    })

    it('should set X-Frame-Options', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
    })

    it('should set X-XSS-Protection to 0 (disables legacy XSS auditor)', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      // helmet() v8 default: X-XSS-Protection: 0
      expect(response.headers['x-xss-protection']).toBe('0')
    })
  })

  describe('HSTS (delegated to Cloudflare edge rule)', () => {
    it('should NOT set Strict-Transport-Security (handled by edge rule)', async () => {
      const response = await request(app).get('/test-headers').expect(200)

      // helmet()'s strictTransportSecurity is explicitly disabled in app.ts so
      // Cloudflare's edge rule is the single source of HSTS.
      expect(response.headers['strict-transport-security']).toBeUndefined()
    })
  })
})
