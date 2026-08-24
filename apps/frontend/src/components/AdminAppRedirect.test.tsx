import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminAppRedirect from './AdminAppRedirect'
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
  })

  it('forwards an old admin deep link to the same path in the admin app', () => {
    renderWithProviders(<AdminAppRedirect />, {
      route: '/admin/shop/orders',
      path: '/admin/*',
      serverClock: false,
    })

    expect(replace).toHaveBeenCalledWith('/atc/shop/orders')
  })

  it('keeps path parameters, query string and hash', () => {
    renderWithProviders(<AdminAppRedirect />, {
      route: '/admin/shop/orders/42?status=PENDING#items',
      path: '/admin/*',
      serverClock: false,
    })

    expect(replace).toHaveBeenCalledWith('/atc/shop/orders/42?status=PENDING#items')
  })

  it('sends the bare /admin link to the admin app root', () => {
    renderWithProviders(<AdminAppRedirect />, {
      route: '/admin',
      path: '/admin/*',
      serverClock: false,
    })

    expect(replace).toHaveBeenCalledWith('/atc/')
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
