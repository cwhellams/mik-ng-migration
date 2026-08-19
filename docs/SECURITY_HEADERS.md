# Security Headers Audit Fixes (#1149)

This document summarizes the changes made to address the security headers audit findings from issue #1149.

## Changes Made

### 1. Backend API Headers (`apps/backend/src/app.ts`)

#### Permissions-Policy Header Added

- Added custom middleware to set `Permissions-Policy` header
- Locks down unused browser features: `geolocation=(), camera=(), microphone=(), payment=(), usb=()`
- Applied to all API routes (`/api/*`, `/auth/*`, `/health`, `/t/*`)
- Note: helmet v8.3.0 doesn't include built-in Permissions-Policy support, so we use custom middleware

#### Content-Security-Policy Disabled, With a Fallback for Non-Cloudflare Requests

- Disabled CSP in helmet() configuration via `contentSecurityPolicy: false`
- Eliminates duplicate CSP headers (helmet + Cloudflare edge rule)
- Cloudflare edge rule now serves as single source of truth for CSP across all paths
- Prevents conflicts and confusion from multiple CSP directives
- `CORS_ALLOWED_ORIGINS` can include the raw DO app-platform origin, which reaches
  this service directly and bypasses the Cloudflare edge rule — that request would
  otherwise get no CSP at all. A second middleware checks for the `CF-Ray` header
  Cloudflare adds to every proxied request; when it's absent, helmet's default CSP
  is applied as a fallback. Cloudflare-proxied responses (the normal case) still
  carry exactly one CSP header, from the edge rule.

#### Other Helmet Defaults Preserved

All other helmet() v8 defaults remain active:

- `Cross-Origin-Opener-Policy: same-origin` (COOP)
- `Cross-Origin-Resource-Policy: same-origin` (CORP)
- `X-DNS-Prefetch-Control: off`
- `X-Permitted-Cross-Domain-Policies: none`
- `Origin-Agent-Cluster: ?1`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 0` (disables legacy XSS auditor per OWASP/MDN guidance)

### 2. Frontend Static Site Headers (`apps/frontend/public/_headers`)

Created a new `_headers` file that sets security headers for the frontend HTML and JS/CSS assets:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=()`
- `X-Permitted-Cross-Domain-Policies: none`
- `X-DNS-Prefetch-Control: off`
- `Origin-Agent-Cluster: ?1`
- `X-XSS-Protection: 0`

The file uses Netlify-style syntax and is automatically copied to `dist/_headers` during build.
Digital Ocean App Platform static sites automatically respect this file.

### 3. Test Coverage (`apps/backend/test/middleware/securityHeaders.test.ts`)

- Permissions-Policy header presence and values
- CSP header absence when proxied by Cloudflare (`CF-Ray` present), and presence
  of the fallback CSP when it is not
- All helmet() defaults (COOP, CORP, X-DNS-Prefetch-Control, etc.)
- X-XSS-Protection set to `0`
- HSTS (`Strict-Transport-Security`) header is asserted absent, since
  `strictTransportSecurity: false` is set in both `app.ts` and the test's replica
  helmet() config — Cloudflare's edge rule is the only source of HSTS

## What This Fixes

### ✅ Issue #1: Permissions-Policy Missing Everywhere (PRIORITY)

- **Before**: No Permissions-Policy header on frontend or API
- **After**: Header set on both frontend and API with locked-down features

### ✅ Issue #2: Frontend Missing Headers

- **Before**: Frontend HTML/JS lacked COOP, CORP, X-Permitted-Cross-Domain-Policies, etc.
- **After**: All helmet() defaults now applied to frontend via `_headers` file

### ✅ Issue #3: Duplicate, Disagreeing CSP Headers on API

- **Before**: Two CSP headers on `/api/*` (helmet + Cloudflare edge rule)
- **After**: Single CSP source (Cloudflare edge rule only)

### ⚠️ Issue #4: X-XSS-Protection Legacy Value

- **Backend/Frontend**: Now explicitly set to `0` per OWASP guidance
- **Note**: Cloudflare edge rule may override this with `1; mode=block` depending on header precedence
- Recommended: Update Cloudflare edge rule to set `X-XSS-Protection: 0`

## Header Sources After Changes

| Path           | Source                       | Headers Set                                                                                                                                                                                                                                                         |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` (HTML)     | `_headers` file + Cloudflare | COOP, CORP, Permissions-Policy, X-DNS-Prefetch-Control, Origin-Agent-Cluster, X-Permitted-Cross-Domain-Policies, X-XSS-Protection, CSP (Cloudflare), HSTS (Cloudflare)                                                                                              |
| `/assets/*.js` | `_headers` file + Cloudflare | Same as above                                                                                                                                                                                                                                                       |
| `/api/*`       | helmet() + Cloudflare        | COOP, CORP, Permissions-Policy, X-DNS-Prefetch-Control, Origin-Agent-Cluster, X-Permitted-Cross-Domain-Policies, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, CSP (Cloudflare when proxied, helmet fallback otherwise — see below), HSTS (Cloudflare) |
| `/auth/*`      | helmet() + Cloudflare        | Same as `/api/*`                                                                                                                                                                                                                                                    |
| `/health`      | helmet() + Cloudflare        | Same as `/api/*`                                                                                                                                                                                                                                                    |
| `/t/:code`     | helmet() + Cloudflare        | Same as `/api/*`                                                                                                                                                                                                                                                    |

## Deployment Notes

### Frontend Static Site

- The `_headers` file is automatically copied to `dist/` during build
- Digital Ocean App Platform automatically applies headers from `dist/_headers`
- No changes needed to `.do/mik-intranet-prod.yaml` or `.do/mik-intranet-test.yaml`

### Backend API

- Changes are in `apps/backend/src/app.ts` and deploy automatically with the Docker image
- No environment variables or configuration changes needed

### Cloudflare Edge Rule (Optional Follow-up)

Consider updating the Cloudflare edge rule to:

1. Set `X-XSS-Protection: 0` instead of `1; mode=block`
2. Document that CSP is managed there (not in application code)
3. Optionally scope the CSP rule to exclude `/api/*` for clarity (though current setup works)

## Testing

Run the security headers test suite:

```bash
cd apps/backend
pnpm test test/middleware/securityHeaders.test.ts
```

All 13 tests should pass.

## References

- Issue: #1149
- OWASP Secure Headers: https://owasp.org/www-project-secure-headers/
- helmet.js v8 docs: https://github.com/helmetjs/helmet
- DO App Platform _headers: https://docs.digitalocean.com/products/app-platform/reference/static-sites/
- Netlify _headers syntax: https://docs.netlify.com/routing/headers/
