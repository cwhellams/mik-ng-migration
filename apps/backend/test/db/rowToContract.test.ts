import { describe, expect, it } from '@jest/globals'

import { noExtraKeys } from '../../src/db/rowToContract.ts'

type Contract = { id: string; name: string }

/**
 * The point of this helper is entirely at compile time, so most of what matters here is
 * the `@ts-expect-error` case: it fails the build if the guard ever stops guarding.
 *
 * The hazard it exists for is that TypeScript does **not** apply excess-property checking
 * to spreads. `const c: Contract = { ...row }` compiles with a row carrying anything at
 * all, and those extra columns are then serialised to the client.
 */
describe('noExtraKeys', () => {
  it('returns the value unchanged at runtime', () => {
    const row = { id: '1', name: 'Matti' }

    const result: Contract = noExtraKeys({ ...row })

    expect(result).toEqual({ id: '1', name: 'Matti' })
  })

  it('keeps overrides applied after the spread', () => {
    const row = { id: '1', name: 'Matti' }

    const result: Contract = noExtraKeys({ ...row, name: 'Liisa' })

    expect(result).toEqual({ id: '1', name: 'Liisa' })
  })

  it('rejects a row carrying keys the contract does not declare', () => {
    const leaky = { id: '1', name: 'Matti', hetuEncrypted: 'secret' }

    // @ts-expect-error hetuEncrypted is not on Contract and would reach the client
    const result: Contract = noExtraKeys({ ...leaky })

    // It is an identity function, so the extra key is still there at runtime — which is
    // exactly why the compile-time rejection is the whole point.
    expect(result).toHaveProperty('hetuEncrypted')
  })

  it('still rejects when the extra key arrives alongside an override', () => {
    const leaky = { id: '1', name: 'Matti', internalNote: 'do not ship' }

    // @ts-expect-error internalNote is not on Contract
    const result: Contract = noExtraKeys({ ...leaky, name: 'Liisa' })

    expect(result.name).toBe('Liisa')
  })

  /**
   * The guard reads its contract from the call's contextual type, so the obvious worry
   * (raised in review on #1195) is that a mapper written without a return-type annotation
   * would infer the contract *from the row itself* and quietly check nothing — a leak with
   * no compile error and no lint error to catch it.
   *
   * It does not: with no contextual type, `Contract` falls back to `unknown`, `keyof
   * unknown` is `never`, and so **every** key counts as excess. An unannotated call is a
   * hard error rather than a silent pass, which is why no lint rule is needed to require
   * the annotation — the type system already refuses to compile without it.
   *
   * These cases pin that. They are the reason the helper can be trusted by construction,
   * so a refactor that made an unannotated call start compiling must fail the build.
   */
  it('fails closed when there is no contextual type to check against', () => {
    const clean = { id: '1', name: 'Matti' }

    // @ts-expect-error no annotation, so there is no contract to check against
    const unchecked = noExtraKeys({ ...clean })

    expect(unchecked).toEqual({ id: '1', name: 'Matti' })
  })

  it('fails closed rather than narrowing to a union member', () => {
    const clean = { id: '1', name: 'Matti' }

    // `keyof (Contract | undefined)` is `never`, so this is refused too. Over-strict, not
    // unsafe: a mapper returning `Contract | undefined` maps the row in a branch that has
    // its own annotation, rather than reaching for the union.
    // @ts-expect-error a union return type carries no usable key set
    const widened: Contract | undefined = noExtraKeys({ ...clean })

    expect(widened).toEqual({ id: '1', name: 'Matti' })
  })
})
