import { describe, expect, it } from 'vitest'

import {
  escapeHtml,
  sanitizeUrl,
  validateApiPath,
  validateInternalPath,
} from '../src/sanitizers.ts'

describe('sanitizers', () => {
  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      const input = '<script>alert("xss")</script>'
      const output = escapeHtml(input)

      expect(output).toContain('&lt;script&gt;')
      expect(output).toContain('&lt;&#x2F;script&gt;')
    })
  })

  describe('sanitizeUrl', () => {
    it('returns escaped URL for valid https URL', () => {
      const result = sanitizeUrl('https://example.com/path?a=1&b=2')
      expect(result).toBe('https:&#x2F;&#x2F;example.com&#x2F;path?a=1&amp;b=2')
    })

    it('allows localhost URLs in development style hosts', () => {
      const result = sanitizeUrl('http://dev.localhost:3000/hello')
      expect(result).toBe('http:&#x2F;&#x2F;dev.localhost:3000&#x2F;hello')
    })

    it('allows tel and mailto protocols', () => {
      expect(sanitizeUrl('tel:+358401234567')).toBe('tel:+358401234567')
      expect(sanitizeUrl('mailto:test@example.com')).toBe('mailto:test@example.com')
    })

    it('returns empty string for unsafe protocols', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('')
      expect(sanitizeUrl('data:text/html;base64,abcd')).toBe('')
    })

    it('returns empty string for null, undefined, and invalid URL strings', () => {
      expect(sanitizeUrl(null)).toBe('')
      expect(sanitizeUrl(undefined)).toBe('')
      expect(sanitizeUrl('not a url')).toBe('')
    })
  })

  describe('validateApiPath', () => {
    it('returns trimmed relative API path when valid', () => {
      expect(validateApiPath('  /invoices/get/123  ')).toBe('/invoices/get/123')
      expect(validateApiPath('api/v1/items')).toBe('api/v1/items')
    })

    it('returns empty string when input is missing', () => {
      expect(validateApiPath(undefined)).toBe('')
      expect(validateApiPath('')).toBe('')
    })

    it('throws for absolute URLs and protocol-relative URLs', () => {
      expect(() => validateApiPath('https://evil.example.com/x')).toThrow(
        'Absolute URLs are not allowed in API paths',
      )
      expect(() => validateApiPath('//evil.example.com/x')).toThrow(
        'Absolute URLs are not allowed in API paths',
      )
    })

    it('throws for plain and encoded path traversal attempts', () => {
      expect(() => validateApiPath('../etc/passwd')).toThrow('Path traversal is not allowed')
      expect(() => validateApiPath('/api/%2e%2e/secret')).toThrow(
        'Encoded path traversal is not allowed',
      )
      expect(() => validateApiPath('/api/%252e%252e/secret')).toThrow(
        'Encoded path traversal is not allowed',
      )
    })

    it('throws for null-byte attacks', () => {
      expect(() => validateApiPath('/api/abc\0def')).toThrow('Null bytes are not allowed in paths')
      expect(() => validateApiPath('/api/%00def')).toThrow('Null bytes are not allowed in paths')
    })
  })

  describe('validateInternalPath', () => {
    it('returns / for empty-ish values', () => {
      expect(validateInternalPath(undefined)).toBe('/')
      expect(validateInternalPath(null)).toBe('/')
      expect(validateInternalPath('')).toBe('/')
      expect(validateInternalPath('   ')).toBe('/')
    })

    it('returns safe internal path and prepends slash when missing', () => {
      expect(validateInternalPath('/dashboard')).toBe('/dashboard')
      expect(validateInternalPath('dashboard')).toBe('/dashboard')
    })

    it('returns / for external or unsafe path formats', () => {
      expect(validateInternalPath('https://example.com/redirect')).toBe('/')
      expect(validateInternalPath('//example.com/redirect')).toBe('/')
      expect(validateInternalPath('\\evil\\path')).toBe('/')
      expect(validateInternalPath('javascript:alert(1)')).toBe('/')
      expect(validateInternalPath('data:text/html;base64,abcd')).toBe('/')
      expect(validateInternalPath('vbscript:msgbox(1)')).toBe('/')
    })

    it('returns / for path traversal attempts', () => {
      expect(validateInternalPath('/a/../b')).toBe('/')
      expect(validateInternalPath('../outside')).toBe('/')
    })
  })
})
