import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminAppRedirect, { adminBase } from './AdminAppRedirect'
import { renderWithProviders } from '../test/renderWithProviders'

/**
 * jsdom's `window.location.replace` is a hard "not implemented" — it cannot be
 * assigned over either, so the property is redefined for the duration.
 */
const captureRedirect = () => {
  const replace = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, replace },
  })
  return replace
}

describe('AdminAppRedirect', () => {
  let replace: ReturnType<typeof captureRedirect>

  beforeEach(() => {
    replace = captureRedirect()
    // The suite runs with import.meta.env.DEV set, where the base defaults to
    // the admin app's Vite port. Pin the production value so the assertions
    // below are about the path rewriting rather than about which base is in
    // force; `adminBase` has its own tests for that.
    vi.stubEnv('VITE_ADMIN_URL', 'https://twr.mik.fi')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('forwards an old admin deep link to the same path in the admin app', () => {
    renderWithProviders(<AdminAppRedirect />, {
      route: '/admin/shop/orders',
      path: '/admin/*',
      serverClock: false,
    })

    expect(replace).toHaveBeenCalledWith('https://twr.mik.fi/shop/orders')
  })

  it('keeps path parameters, query string and hash', () => {
    renderWithProviders(<AdminAppRedirect />, {
      route: '/admin/shop/orders/42?status=PENDING#items',
      path: '/admin/*',
      serverClock: false,
    })

    expect(replace).toHaveBeenCalledWith('https://twr.mik.fi/shop/orders/42?status=PENDING#items')
  })

  it('sends the bare /admin link to the admin app root', () => {
    renderWithProviders(<AdminAppRedirect />, {
      route: '/admin',
      path: '/admin/*',
      serverClock: false,
    })

    expect(replace).toHaveBeenCalledWith('https://twr.mik.fi/')
  })

  it('forwards an accounting link, whose prefix the admin app keeps verbatim', () => {
    renderWithProviders(<AdminAppRedirect />, {
      route: '/accounting/items',
      path: '/accounting/*',
      serverClock: false,
    })

    expect(replace).toHaveBeenCalledWith('https://twr.mik.fi/accounting/items')
  })

  it('rewrites the three /club/members admin screens, which lose the /club prefix', () => {
    renderWithProviders(<AdminAppRedirect />, {
      route: '/club/members/changelog',
      path: '/club/members/changelog',
      serverClock: false,
    })

    expect(replace).toHaveBeenCalledWith('https://twr.mik.fi/members/changelog')
  })

  it('tells the user what is happening rather than showing a blank page', () => {
    renderWithProviders(<AdminAppRedirect />, {
      route: '/admin/outbox',
      path: '/admin/*',
      serverClock: false,
    })

    expect(screen.getByText('Redirecting to the admin app…')).toBeInTheDocument()
  })
})

describe('adminBase', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is the twr.mik.fi subdomain in production', () => {
    vi.stubEnv('VITE_ADMIN_URL', undefined)
    vi.stubEnv('VITE_API_TARGET', 'https://intra.mik.fi')

    expect(adminBase()).toBe('https://twr.mik.fi')
  })

  it('is the beta-twr.mik.fi subdomain in the beta environment', () => {
    vi.stubEnv('VITE_ADMIN_URL', undefined)
    vi.stubEnv('VITE_API_TARGET', 'https://beta.mik.fi')

    expect(adminBase()).toBe('https://beta-twr.mik.fi')
  })

  it('is the admin app’s own Vite port when there is nothing to derive it from', () => {
    // Local dev has no VITE_API_TARGET set, and the two apps are separate dev
    // servers — landing on this app's own 404 page is exactly what a member
    // saw when an old accounting link redirected locally, before this existed.
    vi.stubEnv('VITE_ADMIN_URL', undefined)
    vi.stubEnv('VITE_API_TARGET', undefined)

    expect(adminBase()).toBe('http://localhost:5174')
  })

  it('lets an explicit VITE_ADMIN_URL win over the derived subdomain', () => {
    vi.stubEnv('VITE_ADMIN_URL', 'https://staging-twr.mik.fi')
    vi.stubEnv('VITE_API_TARGET', 'https://intra.mik.fi')

    expect(adminBase()).toBe('https://staging-twr.mik.fi')
  })
})
