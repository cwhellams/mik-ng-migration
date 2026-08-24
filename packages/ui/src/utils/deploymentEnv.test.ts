import { describe, expect, it } from 'vitest'

import { adminUrlFor, envLabel, memberUrlFor } from './deploymentEnv'

describe('envLabel', () => {
  it('strips the protocol and .mik.fi suffix', () => {
    expect(envLabel('https://intra.mik.fi')).toBe('intra')
    expect(envLabel('https://beta.mik.fi')).toBe('beta')
  })

  it('defaults to local when unset', () => {
    expect(envLabel(undefined)).toBe('local')
    expect(envLabel('')).toBe('local')
  })

  it('falls back to the raw stripped host for an unrecognised target', () => {
    // An ad hoc preview deploy still shows *something* informative rather than
    // silently blanking, even though it isn't one of the two real environments.
    expect(envLabel('https://pr-123.ondigitalocean.app')).toBe('pr-123.ondigitalocean.app')
  })
})

describe('memberUrlFor', () => {
  // Both apps are given the exact same VITE_API_TARGET — the backend host, not
  // either frontend's own domain — so both functions here take that as input,
  // never the calling app's own subdomain.
  it('is the backend host itself: intra.mik.fi’s API target names intra.mik.fi', () => {
    expect(memberUrlFor('https://intra.mik.fi')).toBe('https://intra.mik.fi')
  })

  it('does the same for beta', () => {
    expect(memberUrlFor('https://beta.mik.fi')).toBe('https://beta.mik.fi')
  })

  it('has nothing to derive locally or for an unknown target', () => {
    expect(memberUrlFor(undefined)).toBeUndefined()
    expect(memberUrlFor('https://pr-123.ondigitalocean.app')).toBeUndefined()
  })
})

describe('adminUrlFor', () => {
  it('maps the production backend host to the production admin subdomain', () => {
    expect(adminUrlFor('https://intra.mik.fi')).toBe('https://twr.mik.fi')
  })

  it('maps the beta backend host to the beta admin subdomain', () => {
    expect(adminUrlFor('https://beta.mik.fi')).toBe('https://beta-twr.mik.fi')
  })

  it('has nothing to derive locally or for an unknown target', () => {
    expect(adminUrlFor(undefined)).toBeUndefined()
    expect(adminUrlFor('https://pr-123.ondigitalocean.app')).toBeUndefined()
  })
})
