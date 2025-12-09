# @mik-ng/shared

Shared utilities for MIK-NG projects.

## Contents

### sanitize.ts

Security utilities for sanitizing user input and preventing XSS/SSRF/Open Redirect attacks:

- **escapeHtml**: Escapes HTML special characters to prevent XSS attacks
- **sanitizeUrl**: Validates URLs to only allow safe protocols (http, https, mailto, tel)
- **validateApiPath**: Validates API paths to prevent SSRF attacks
- **validateInternalPath**: Validates internal navigation paths to prevent open redirect attacks

## Usage

```typescript
import {
  escapeHtml,
  sanitizeUrl,
  validateApiPath,
  validateInternalPath,
} from '@mik-ng/shared'

// Escape HTML
const safe = escapeHtml('<script>alert("xss")</script>')
// Returns: &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;

// Sanitize URL
const url = sanitizeUrl('javascript:alert("xss")')
// Returns: '' (empty string for unsafe protocols)

// Validate API path
const apiPath = validateApiPath('/api/users/123')
// Returns: '/api/users/123'

// Validate internal path
const internalPath = validateInternalPath('/dashboard')
// Returns: '/dashboard'
```

## Development

```bash
# Type check
pnpm typecheck

# Build
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Testing

The package includes comprehensive tests for all sanitization utilities:

- **escapeHtml tests**: Validates HTML escaping for all special characters, edge cases, and null/undefined handling
- **sanitizeUrl tests**: Covers safe and unsafe protocols, edge cases, internationalization, and case variations
- **validateApiPath tests**: Tests path validation, traversal blocking, encoding attacks, and null byte prevention
- **validateInternalPath tests**: Validates internal navigation, open redirect prevention, and protocol blocking

Run `pnpm test` to execute all tests.
