import { describe, expect, it } from 'vitest'

import { absolute, endpoints } from './endpoints'

/**
 * The registry is data, so what is worth testing is the invariants the rest of the
 * app relies on rather than any individual string. `useApi` keys its SWR cache on
 * the path, prefixes it with `/api/`, and treats a leading slash as "replace the
 * base URL" — so a stray slash or an embedded query string is not a cosmetic
 * problem, it silently changes which request is made or which cache entry is hit.
 */

/** Every static path in the registry, as `[label, path]`. */
const staticPaths = Object.entries(endpoints).flatMap(([domain, paths]) =>
  Object.entries(paths)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([name, path]) => [`${domain}.${name}`, path] as const),
)

/** Every path builder, invoked with a recognisable stand-in segment. */
const builtPaths = Object.entries(endpoints).flatMap(([domain, paths]) =>
  Object.entries(paths)
    .filter(
      (entry): entry is [string, (segment: string) => string] => typeof entry[1] === 'function',
    )
    .map(([name, build]) => [`${domain}.${name}`, build('SEGMENT')] as const),
)

describe('endpoints', () => {
  it('has both static paths and builders to check', () => {
    // Without this the two tables below could quietly empty out — a registry
    // refactor that broke the introspection would leave every case unasserted.
    // Deliberately loose lower bounds: this guards against zero, and the registry
    // only ever grows, so it should never need editing as domains are added.
    expect(staticPaths.length).toBeGreaterThanOrEqual(10)
    expect(builtPaths.length).toBeGreaterThanOrEqual(5)
  })

  it.each([...staticPaths, ...builtPaths])('%s is a versioned relative path', (_label, path) => {
    expect(path.startsWith('v1/')).toBe(true)
  })

  it.each([...staticPaths, ...builtPaths])('%s carries no query string', (_label, path) => {
    // Query strings belong in useApi's `params`, which serialises them *and* puts
    // them in the cache key. Baked into the path they are invisible to both.
    expect(path).not.toMatch(/[?&]/)
  })

  it.each([...staticPaths, ...builtPaths])('%s has no empty path segment', (_label, path) => {
    expect(path).not.toMatch(/\/\//)
    expect(path.endsWith('/')).toBe(false)
  })

  it.each(builtPaths)('%s interpolates its argument', (_label, path) => {
    expect(path).toContain('SEGMENT')
    // Catches a builder that names a parameter it never uses — the shape that
    // produced `v1/members/undefined` before these were typed functions.
    expect(path).not.toContain('undefined')
  })

  it('has no duplicate static paths', () => {
    // Two names for one path is how a `mutate()` key and a `url` drift apart.
    const paths = staticPaths.map(([, path]) => path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  describe('absolute', () => {
    it('prefixes a slash so useApi replaces the base path rather than appending', () => {
      expect(absolute(endpoints.members.restore('Matti1'))).toBe('/v1/members/Matti1/restore')
    })
  })
})
