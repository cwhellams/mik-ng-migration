import {
  escapeHtml,
  sanitizeUrl,
  validateApiPath,
  validateInternalPath,
} from '../src/sanitize.js'

describe('escapeHtml', () => {
  test('escapes HTML special characters', () => {
    const input = '<script>alert("XSS")</script>'
    const expected = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;'
    expect(escapeHtml(input)).toBe(expected)
  })

  test('escapes ampersand', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  test('escapes less than and greater than', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;')
  })

  test('escapes double quotes', () => {
    expect(escapeHtml('Say "hello"')).toBe('Say &quot;hello&quot;')
  })

  test('escapes single quotes', () => {
    expect(escapeHtml("It's fine")).toBe('It&#x27;s fine')
  })

  test('escapes forward slash', () => {
    expect(escapeHtml('</script>')).toBe('&lt;&#x2F;script&gt;')
  })

  test('handles mixed special characters', () => {
    const input = `<a href="javascript:alert('XSS')">Click</a>`
    const expected = `&lt;a href=&quot;javascript:alert(&#x27;XSS&#x27;)&quot;&gt;Click&lt;&#x2F;a&gt;`
    expect(escapeHtml(input)).toBe(expected)
  })

  test('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('')
  })

  test('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('')
  })

  test('returns empty string for empty string', () => {
    expect(escapeHtml('')).toBe('')
  })

  test('does not modify safe text', () => {
    const safeText = 'Hello World 123'
    expect(escapeHtml(safeText)).toBe(safeText)
  })

  test('handles multiple occurrences of same character', () => {
    expect(escapeHtml('&&&')).toBe('&amp;&amp;&amp;')
    expect(escapeHtml('<<<')).toBe('&lt;&lt;&lt;')
  })
})

describe('sanitizeUrl', () => {
  test('allows valid http URLs', () => {
    const url = 'http://example.com'
    expect(sanitizeUrl(url)).toBe(url)
  })

  test('allows valid https URLs', () => {
    const url = 'https://example.com/path?query=value'
    expect(sanitizeUrl(url)).toBe(url)
  })

  test('allows mailto URLs', () => {
    const url = 'mailto:user@example.com'
    expect(sanitizeUrl(url)).toBe(url)
  })

  test('allows tel URLs', () => {
    const url = 'tel:+1234567890'
    expect(sanitizeUrl(url)).toBe(url)
  })

  test('blocks javascript URLs', () => {
    const url = 'javascript:alert("XSS")'
    expect(sanitizeUrl(url)).toBe('')
  })

  test('blocks data URLs', () => {
    const url = 'data:text/html,<script>alert("XSS")</script>'
    expect(sanitizeUrl(url)).toBe('')
  })

  test('blocks file URLs', () => {
    const url = 'file:///etc/passwd'
    expect(sanitizeUrl(url)).toBe('')
  })

  test('blocks vbscript URLs', () => {
    const url = 'vbscript:msgbox("XSS")'
    expect(sanitizeUrl(url)).toBe('')
  })

  test('returns empty string for invalid URLs', () => {
    expect(sanitizeUrl('not a url')).toBe('')
  })

  test('returns empty string for null', () => {
    expect(sanitizeUrl(null)).toBe('')
  })

  test('returns empty string for undefined', () => {
    expect(sanitizeUrl(undefined)).toBe('')
  })

  test('returns empty string for empty string', () => {
    expect(sanitizeUrl('')).toBe('')
  })

  test('trims whitespace from URLs', () => {
    const url = '  https://example.com  '
    expect(sanitizeUrl(url)).toBe(url.trim())
  })

  test('handles URLs with complex paths and query strings', () => {
    const url =
      'https://example.com/path/to/page?param1=value1&param2=value2#anchor'
    expect(sanitizeUrl(url)).toBe(url)
  })

  test('handles URLs with authentication', () => {
    const url = 'https://user:pass@example.com'
    expect(sanitizeUrl(url)).toBe(url)
  })

  test('handles URLs with ports', () => {
    const url = 'https://example.com:8080/path'
    expect(sanitizeUrl(url)).toBe(url)
  })

  test('handles international domain names', () => {
    const url = 'https://münchen.de'
    expect(sanitizeUrl(url)).toBe(url)
  })

  test('blocks javascript with uppercase protocol', () => {
    const url = 'JavaScript:alert("XSS")'
    expect(sanitizeUrl(url)).toBe('')
  })

  test('blocks mixed case javascript protocol', () => {
    const url = 'JaVaScRiPt:alert("XSS")'
    expect(sanitizeUrl(url)).toBe('')
  })
})

describe('validateApiPath', () => {
  test('allows simple relative paths', () => {
    expect(validateApiPath('users')).toBe('users')
    expect(validateApiPath('api/users')).toBe('api/users')
  })

  test('allows paths with slashes', () => {
    expect(validateApiPath('users/123')).toBe('users/123')
    expect(validateApiPath('/api/users/123')).toBe('/api/users/123')
  })

  test('allows paths with query parameters', () => {
    expect(validateApiPath('users?id=123')).toBe('users?id=123')
  })

  test('allows paths with hyphens and underscores', () => {
    expect(validateApiPath('user-profile')).toBe('user-profile')
    expect(validateApiPath('user_profile')).toBe('user_profile')
  })

  test('trims whitespace', () => {
    expect(validateApiPath('  users/123  ')).toBe('users/123')
  })

  test('returns empty string for undefined', () => {
    expect(validateApiPath(undefined)).toBe('')
  })

  test('returns empty string for empty string', () => {
    expect(validateApiPath('')).toBe('')
  })

  test('blocks http URLs', () => {
    expect(() => validateApiPath('http://evil.com')).toThrow(
      'Absolute URLs are not allowed in API paths'
    )
  })

  test('blocks https URLs', () => {
    expect(() => validateApiPath('https://evil.com/api')).toThrow(
      'Absolute URLs are not allowed in API paths'
    )
  })

  test('blocks protocol-relative URLs', () => {
    expect(() => validateApiPath('//evil.com/api')).toThrow(
      'Absolute URLs are not allowed in API paths'
    )
  })

  test('blocks javascript protocol', () => {
    expect(() => validateApiPath('javascript:alert(1)')).toThrow(
      'Absolute URLs are not allowed in API paths'
    )
  })

  test('blocks data protocol', () => {
    expect(() => validateApiPath('data:text/html,<script>')).toThrow(
      'Absolute URLs are not allowed in API paths'
    )
  })

  test('blocks file protocol', () => {
    expect(() => validateApiPath('file:///etc/passwd')).toThrow(
      'Absolute URLs are not allowed in API paths'
    )
  })

  test('blocks ftp protocol', () => {
    expect(() => validateApiPath('ftp://server.com')).toThrow(
      'Absolute URLs are not allowed in API paths'
    )
  })

  test('blocks path traversal with ..', () => {
    expect(() => validateApiPath('../etc/passwd')).toThrow(
      'Path traversal is not allowed'
    )
  })

  test('blocks path traversal in middle of path', () => {
    expect(() => validateApiPath('users/../admin')).toThrow(
      'Path traversal is not allowed'
    )
  })

  test('blocks multiple path traversal attempts', () => {
    expect(() => validateApiPath('../../etc/passwd')).toThrow(
      'Path traversal is not allowed'
    )
  })

  test('blocks encoded path traversal %2e%2e', () => {
    expect(() => validateApiPath('users/%2e%2e/admin')).toThrow(
      'Encoded path traversal is not allowed'
    )
  })

  test('blocks uppercase encoded path traversal %2E%2E', () => {
    expect(() => validateApiPath('users/%2E%2E/admin')).toThrow(
      'Encoded path traversal is not allowed'
    )
  })

  test('blocks double-encoded path traversal %252e%252e', () => {
    expect(() => validateApiPath('users/%252e%252e/admin')).toThrow(
      'Encoded path traversal is not allowed'
    )
  })

  test('blocks null bytes', () => {
    expect(() => validateApiPath('users\0/admin')).toThrow(
      'Null bytes are not allowed in paths'
    )
  })

  test('blocks URL-encoded null bytes', () => {
    expect(() => validateApiPath('users%00/admin')).toThrow(
      'Null bytes are not allowed in paths'
    )
  })

  test('allows paths with legitimate dots in filenames', () => {
    expect(validateApiPath('users/file.json')).toBe('users/file.json')
    expect(validateApiPath('users/profile.data')).toBe('users/profile.data')
  })

  test('blocks mixed attack patterns', () => {
    expect(() => validateApiPath('https://evil.com/../api')).toThrow(
      'Absolute URLs are not allowed in API paths'
    )
  })
})

describe('validateInternalPath', () => {
  test('allows simple internal paths', () => {
    expect(validateInternalPath('/dashboard')).toBe('/dashboard')
    expect(validateInternalPath('/users/profile')).toBe('/users/profile')
  })

  test('prepends slash to relative paths', () => {
    expect(validateInternalPath('dashboard')).toBe('/dashboard')
    expect(validateInternalPath('users/123')).toBe('/users/123')
  })

  test('allows paths with query parameters', () => {
    expect(validateInternalPath('/search?query=test')).toBe(
      '/search?query=test'
    )
  })

  test('allows paths with hash fragments', () => {
    expect(validateInternalPath('/page#section')).toBe('/page#section')
  })

  test('allows paths with both query and hash', () => {
    expect(validateInternalPath('/page?id=1#top')).toBe('/page?id=1#top')
  })

  test('defaults to / for null', () => {
    expect(validateInternalPath(null)).toBe('/')
  })

  test('defaults to / for undefined', () => {
    expect(validateInternalPath(undefined)).toBe('/')
  })

  test('defaults to / for empty string', () => {
    expect(validateInternalPath('')).toBe('/')
  })

  test('defaults to / for whitespace only', () => {
    expect(validateInternalPath('   ')).toBe('/')
  })

  test('blocks http URLs', () => {
    expect(validateInternalPath('http://evil.com')).toBe('/')
  })

  test('blocks https URLs', () => {
    expect(validateInternalPath('https://evil.com/steal')).toBe('/')
  })

  test('blocks protocol-relative URLs', () => {
    expect(validateInternalPath('//evil.com/phishing')).toBe('/')
  })

  test('blocks javascript URLs', () => {
    expect(validateInternalPath('javascript:alert(1)')).toBe('/')
  })

  test('blocks data URLs', () => {
    expect(
      validateInternalPath('data:text/html,<script>alert(1)</script>')
    ).toBe('/')
  })

  test('blocks vbscript URLs', () => {
    expect(validateInternalPath('vbscript:msgbox(1)')).toBe('/')
  })

  test('blocks backslash-prefixed paths', () => {
    expect(validateInternalPath('\\evil.com')).toBe('/')
  })

  test('blocks path traversal attempts', () => {
    expect(validateInternalPath('/users/../admin')).toBe('/')
    expect(validateInternalPath('../etc/passwd')).toBe('/')
  })

  test('blocks obfuscated protocols with mixed case', () => {
    expect(validateInternalPath('JavaScript:alert(1)')).toBe('/')
    expect(validateInternalPath('hTTpS://evil.com')).toBe('/')
  })

  test('trims whitespace before validation', () => {
    expect(validateInternalPath('  /dashboard  ')).toBe('/dashboard')
  })

  test('allows deep nested paths', () => {
    expect(validateInternalPath('/users/123/profile/settings')).toBe(
      '/users/123/profile/settings'
    )
  })

  test('allows paths with hyphens and underscores', () => {
    expect(validateInternalPath('/user-profile_view')).toBe(
      '/user-profile_view'
    )
  })

  test('blocks file protocol', () => {
    expect(validateInternalPath('file:///etc/passwd')).toBe('/')
  })

  test('blocks ftp protocol', () => {
    expect(validateInternalPath('ftp://server.com/files')).toBe('/')
  })
})
