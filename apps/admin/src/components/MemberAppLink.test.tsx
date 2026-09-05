import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MemberAppLink, memberBase } from './MemberAppLink'
import { renderWithProviders } from '../test/renderWithProviders'

describe('MemberAppLink', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('renders a real anchor, not a router link', () => {
    // The destination is a separate single-page app with its own bundle, so it
    // needs a full page load; a router navigation would 404 inside this app.
    vi.stubEnv('VITE_MEMBER_URL', undefined)
    vi.stubEnv('VITE_API_TARGET', 'https://intra.mik.fi')

    renderWithProviders(<MemberAppLink to='/logs/flights/fi_inst1'>Flight</MemberAppLink>)

    expect(screen.getByRole('link', { name: 'Flight' })).toHaveAttribute(
      'href',
      'https://intra.mik.fi/logs/flights/fi_inst1',
    )
  })

  it('points at the member app’s own Vite port when there is nothing to derive it from', () => {
    vi.stubEnv('VITE_MEMBER_URL', undefined)
    vi.stubEnv('VITE_API_TARGET', undefined)

    renderWithProviders(<MemberAppLink to='/logs/books/OH-STL/4'>Logbook</MemberAppLink>)

    expect(screen.getByRole('link', { name: 'Logbook' })).toHaveAttribute(
      'href',
      'http://localhost:5173/logs/books/OH-STL/4',
    )
  })
})

describe('memberBase', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is the intra.mik.fi subdomain in production', () => {
    vi.stubEnv('VITE_MEMBER_URL', undefined)
    vi.stubEnv('VITE_API_TARGET', 'https://intra.mik.fi')

    expect(memberBase()).toBe('https://intra.mik.fi')
  })

  it('is the beta.mik.fi subdomain in the beta environment', () => {
    vi.stubEnv('VITE_MEMBER_URL', undefined)
    vi.stubEnv('VITE_API_TARGET', 'https://beta.mik.fi')

    expect(memberBase()).toBe('https://beta.mik.fi')
  })

  it('is the member app’s own Vite port when there is nothing to derive it from', () => {
    vi.stubEnv('VITE_MEMBER_URL', undefined)
    vi.stubEnv('VITE_API_TARGET', undefined)

    expect(memberBase()).toBe('http://localhost:5173')
  })

  it('lets an explicit VITE_MEMBER_URL win over the derived subdomain', () => {
    vi.stubEnv('VITE_MEMBER_URL', 'https://intra.mik.fi')
    vi.stubEnv('VITE_API_TARGET', 'https://beta.mik.fi')

    expect(memberBase()).toBe('https://intra.mik.fi')
  })

  it('yields a same-origin path under the single-origin topology', () => {
    // On Cloudflare both apps are served from one hostname, this one under
    // /admin/, so the member app is at the origin root. apps/edge's
    // scripts/build-assets.sh sets VITE_MEMBER_URL='/' for that build; the
    // trailing-slash strip in memberBase then makes links plain absolute paths
    // rather than cross-origin URLs.
    vi.stubEnv('VITE_MEMBER_URL', '/')
    vi.stubEnv('VITE_API_TARGET', 'https://intra.mik.fi')

    expect(memberBase()).toBe('/')
    renderWithProviders(<MemberAppLink to='/logs/books/OH-STL/4'>Logbook</MemberAppLink>)
    expect(screen.getByRole('link', { name: 'Logbook' })).toHaveAttribute(
      'href',
      '/logs/books/OH-STL/4',
    )
  })
})
