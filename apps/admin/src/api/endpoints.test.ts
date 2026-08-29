import { describe, expect, it } from 'vitest'

import { absolute, endpoints } from './endpoints'

/**
 * The registry exists so that a fetching component and a `mutate()` that
 * revalidates it produce byte-identical strings — `useApi` keys its SWR cache
 * on `[url, params]`, so two hand-built copies that differ by a slash
 * revalidate nothing at all, silently. These tests pin the shape that makes
 * that guarantee hold.
 */
describe('endpoints', () => {
  const paths = [
    endpoints.members.root,
    endpoints.members.me,
    endpoints.members.roles,
    endpoints.members.nonRenewals,
    endpoints.members.deactivate('Matti1'),
    endpoints.members.sendRenewalReminder('Matti1'),
    endpoints.aircrafts.root,
    endpoints.findings.root,
    endpoints.findings.related,
    endpoints.findings.trending,
    endpoints.inventoryUnits.forItem('INV_VEST'),
    endpoints.inventoryUnits.byId('VEST1'),
    endpoints.inventoryUnits.status('VEST1'),
  ]

  it('carries no leading slash', () => {
    for (const path of paths) {
      expect(path.startsWith('/'), path).toBe(false)
    }
  })

  it('carries no query string', () => {
    // Query strings belong in `params`, which useApi serialises *and* includes
    // in the cache key. Baked into the path they are invisible to both.
    for (const path of paths) {
      expect(path, path).not.toContain('?')
    }
  })

  it('is versioned', () => {
    for (const path of paths) {
      expect(path.startsWith('v1/'), path).toBe(true)
    }
  })

  it('interpolates the member id into the parameterised paths', () => {
    expect(endpoints.members.deactivate('Matti1')).toBe('v1/members/Matti1/deactivate')
    expect(endpoints.members.sendRenewalReminder('Matti1')).toBe(
      'v1/members/Matti1/send-renewal-reminder',
    )
  })

  it('interpolates the item and unit ids into the inventory unit paths', () => {
    expect(endpoints.inventoryUnits.forItem('INV_VEST')).toBe('v1/inventory/items/INV_VEST/units')
    expect(endpoints.inventoryUnits.byId('VEST1')).toBe('v1/inventory/units/VEST1')
    expect(endpoints.inventoryUnits.status('VEST1')).toBe('v1/inventory/units/VEST1/status')
  })

  it('absolute() makes a path replace the hook url rather than extend it', () => {
    expect(absolute(endpoints.members.nonRenewals)).toBe('/v1/members/non-renewals')
  })
})
