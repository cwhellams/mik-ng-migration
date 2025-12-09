import validator from 'validator'

/**
 * Sanitizes a URL to prevent XSS attacks by ensuring it uses a safe protocol
 * @param url - The URL to sanitize
 * @returns The sanitized URL or empty string if invalid
 */
export const sanitizeUrl = (url: string | null | undefined): string => {
  if (!url) {
    return ''
  }

  const trimmedUrl = url.trim()

  // Allow only safe protocols
  const safeProtocols = ['http', 'https', 'tel', 'mailto']

  // Use validator.isURL to validate the URL structure
  if (
    !validator.isURL(trimmedUrl, {
      protocols: safeProtocols,
      require_protocol: true,
      require_valid_protocol: true,
    })
  ) {
    return ''
  }

  return trimmedUrl
}

/**
 * Validates and sanitizes an API path to prevent SSRF attacks
 * Only allows relative paths that don't attempt to escape the API boundary
 * @param path - The path to validate (relative to API base)
 * @returns The sanitized path or throws an error if invalid
 */
export const validateApiPath = (path: string | undefined): string => {
  if (!path) {
    return ''
  }

  const trimmedPath = path.trim()

  // Block absolute URLs (protocol-based)
  if (
    trimmedPath.match(/^[a-z][a-z0-9+.-]*:/i) ||
    trimmedPath.startsWith('//')
  ) {
    throw new Error('Absolute URLs are not allowed in API paths')
  }

  // Block path traversal attempts
  if (trimmedPath.includes('..')) {
    throw new Error('Path traversal is not allowed')
  }

  // Block encoded path traversal attempts
  if (trimmedPath.match(/%2e%2e|%252e%252e/i)) {
    throw new Error('Encoded path traversal is not allowed')
  }

  // Block null bytes
  if (
    validator.contains(trimmedPath, '\0') ||
    validator.contains(trimmedPath, '%00')
  ) {
    throw new Error('Null bytes are not allowed in paths')
  }

  return trimmedPath
}

/**
 * Validates an internal navigation path to prevent open redirect attacks
 * Only allows relative paths within the application
 * @param path - The path to validate (from user input like query params)
 * @returns A safe internal path, defaults to '/' if invalid
 */
export const validateInternalPath = (
  path: string | null | undefined
): string => {
  if (!path) {
    return '/'
  }

  const trimmedPath = path.trim()

  // Block empty paths
  if (!trimmedPath) {
    return '/'
  }

  // Block absolute URLs with protocols
  if (trimmedPath.match(/^[a-z][a-z0-9+.-]*:/i)) {
    return '/'
  }

  // Block protocol-relative URLs (//example.com)
  if (trimmedPath.startsWith('//')) {
    return '/'
  }

  // Block URLs that start with backslash (Windows-style or obfuscation)
  if (trimmedPath.startsWith('\\')) {
    return '/'
  }

  // Block data URLs and javascript URLs
  if (trimmedPath.match(/^(data|javascript|vbscript):/i)) {
    return '/'
  }

  // Ensure path starts with / for internal navigation
  // If it doesn't, prepend it to make it relative
  const safePath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`

  // Additional safety: block obvious path traversal attempts
  if (safePath.includes('..')) {
    return '/'
  }

  return safePath
}
