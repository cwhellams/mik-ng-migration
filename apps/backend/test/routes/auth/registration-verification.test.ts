import { MIKRegistrationVerificationStrategy } from '../../../src/routes/auth/registration-verification.ts'
import jwt from 'jsonwebtoken'

describe('Registration Verification Strategy', () => {
  let strategy: MIKRegistrationVerificationStrategy

  beforeEach(() => {
    strategy = new MIKRegistrationVerificationStrategy()
    process.env.MAGIC_LINK_SECRET = 'test-secret'
    process.env.PUBLIC_URL = 'http://localhost:5173'
  })

  describe('generateVerificationLink', () => {
    it('should generate a verification link with 3-day expiry', () => {
      const email = 'test@example.com'
      const result = strategy.generateVerificationLink(email)

      expect(result).toHaveProperty('href')
      expect(result).toHaveProperty('code')
      expect(result.href).toContain('/register/verify?token=')
      expect(result.code).toBeGreaterThanOrEqual(10000)
      expect(result.code).toBeLessThanOrEqual(99999)

      // Decode the token to verify structure
      const token = result.href.split('token=')[1]
      const decoded = jwt.verify(token, 'test-secret') as any

      expect(decoded.email).toBe(email)
      expect(decoded.type).toBe('registration')
      expect(decoded.code).toBe(result.code.toString())

      // Check expiry is approximately 3 days (allowing some variance)
      const now = Math.floor(Date.now() / 1000)
      const threeDaysInSeconds = 3 * 24 * 60 * 60
      const expectedExpiry = now + threeDaysInSeconds
      expect(decoded.exp).toBeGreaterThan(expectedExpiry - 60) // Allow 1 minute variance
      expect(decoded.exp).toBeLessThan(expectedExpiry + 60)
    })

    it('should generate unique codes for different calls', () => {
      const email = 'test@example.com'
      const result1 = strategy.generateVerificationLink(email)
      const result2 = strategy.generateVerificationLink(email)

      expect(result1.code).not.toBe(result2.code)
    })
  })

  describe('verifyRegistration', () => {
    it('should reject non-registration token types', async () => {
      const payload = {
        email: 'test@example.com',
        type: 'login',
      }

      await expect(strategy.verifyRegistration(payload)).rejects.toThrow(
        'Invalid token type for registration verification',
      )
    })

    it('should reject tokens without type', async () => {
      const payload = {
        email: 'test@example.com',
      }

      await expect(strategy.verifyRegistration(payload)).rejects.toThrow(
        'Invalid token type for registration verification',
      )
    })
  })
})
