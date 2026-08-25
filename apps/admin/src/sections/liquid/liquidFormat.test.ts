import { describe, expect, it } from 'vitest'

import { OilSource } from '@mik/contracts/liquid'

import { aFuelRecord, anOilRecord, aPaidFuelRecord } from '../../test/fixtures/liquid'
import { describeRecord, formatCost, formatLitres, formatPricePerLitre } from './liquidFormat'

/**
 * The presentation-only subset the admin screens use — see the header comment
 * on `liquidFormat.ts` for why this duplicates rather than imports
 * `apps/frontend`'s `liquidHelpers.ts`. Cases are adapted from
 * `apps/frontend/src/sections/liquid/liquidHelpers.test.ts`, minus
 * `lockReasonKey`/`paidPricePerLitre`/`prefillFromSearchParams`, which this
 * module doesn't have.
 */

// The harness pins English, and the app asserts real strings rather than keys,
// so this stub returns the key for the one lookup `describeRecord` makes.
const t = ((key: string) => key) as never

/** fi-FI groups thousands with a non-breaking space; assertions read better without it. */
const normaliseSpaces = (value: string) => value.replace(/ /g, ' ')

describe('formatting', () => {
  it('formats litres with the unit', () => {
    expect(formatLitres(150)).toBe('150 l')
  })

  it('keeps the three decimals a record can hold', () => {
    expect(formatLitres(0.125)).toBe('0,125 l')
  })

  it('formats a cost in its own currency, not converted', () => {
    // The group separator is normalised because fi-FI uses a non-breaking space
    // (U+00A0) — the assertion is about the currency and the decimals, and a
    // literal NBSP in the source would be invisible to the next reader.
    expect(normaliseSpaces(formatCost(4000, 'SEK')!)).toBe('4 000,00 SEK')
  })

  it('has nothing to show for a costless fuelling', () => {
    expect(formatCost(null, 'EUR')).toBeNull()
    expect(formatPricePerLitre(null)).toBeNull()
  })

  it('formats a litre price to four decimals', () => {
    expect(formatPricePerLitre(1.4286)).toBe('1,4286 €/l')
  })
})

describe('describeRecord', () => {
  it('describes a fuelling by where, what and how much', () => {
    expect(describeRecord(aPaidFuelRecord(), t)).toBe('JET A-1 · EFHK · AirBP · 200 l · 400,00 EUR')
  })

  it('leaves out the cost when there is none', () => {
    expect(describeRecord(aFuelRecord(), t)).toBe(
      'JET A-1 · EFNU · Lentokoneosakeyhtiö Lokki & Kumppanit · 150 l',
    )
  })

  it('describes club-canister oil by the canister', () => {
    expect(describeRecord(anOilRecord(), t)).toBe('MIK A 26/1 · Aeroshell · W100 · 0,5 l')
  })

  it('describes non-club oil by what it was instead', () => {
    // The canister ref is null, so a naive join would leave a leading separator.
    expect(
      describeRecord(
        anOilRecord({
          oilSource: OilSource.OTHER,
          oilCanisterId: null,
          oilCanisterRef: null,
          oilMake: 'Phillips 66',
          oilModelViscosity: 'XC 20W-50',
        }),
        t,
      ),
    ).toBe('liquid.oil.otherSourceShort · Phillips 66 · XC 20W-50 · 0,5 l')
  })
})
