import { describe, expect, it } from 'vitest'

import { LiquidLockReason, LiquidType, OilSource } from '@mik/contracts/liquid'

import { aFuelRecord, anOilRecord, aPaidFuelRecord } from '../../test/fixtures'
import {
  describeRecord,
  formatCost,
  formatLitres,
  formatPricePerLitre,
  lockReasonKey,
  paidPricePerLitre,
  prefillFromSearchParams,
} from './liquidHelpers'

/**
 * The presentation decisions behind the liquid screens.
 *
 * Pure functions, so they are tested without rendering anything — which is the
 * reason they are functions rather than JSX in the first place.
 */

// The harness pins English, and the app asserts real strings rather than keys,
// so this stub returns the key for the two lookups `describeRecord` makes.
const t = ((key: string) => key) as never

/** fi-FI groups thousands with a non-breaking space; assertions read better without it. */
const normaliseSpaces = (value: string) => value.replace(/\u00a0/g, ' ')

describe('lockReasonKey', () => {
  it.each([
    [LiquidLockReason.LINKED_TO_EXPENSE_CLAIM, 'liquid.lock.claimLinked'],
    [LiquidLockReason.LINKED_TO_VALIDATED_FLIGHT_LOG, 'liquid.lock.flightValidated'],
    [LiquidLockReason.EDIT_WINDOW_EXPIRED, 'liquid.lock.windowExpired'],
    [LiquidLockReason.NOT_OWNER, 'liquid.lock.notOwner'],
    [LiquidLockReason.DELETED, 'liquid.lock.deleted'],
  ])('maps %s to %s', (reason, key) => {
    expect(lockReasonKey(reason)).toBe(key)
  })

  it('has a key for every reason the server can send', () => {
    // A missing entry would render "liquid.lock.undefined" in a tooltip, which
    // is worse than no tooltip: the member would see a key where an explanation
    // should be.
    for (const reason of Object.values(LiquidLockReason)) {
      expect(lockReasonKey(reason)).not.toContain('undefined')
    }
  })
})

describe('formatting', () => {
  it('formats litres with the unit', () => {
    expect(formatLitres(150)).toBe('150 l')
  })

  it('keeps the three decimals a record can hold', () => {
    expect(formatLitres(0.125)).toBe('0,125 l')
  })

  it('formats a cost in its own currency, not converted', () => {
    // The member paid SEK; showing them euros here would be a number they never
    // saw on a receipt.
    //
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

  it('labels a non-EUR litre price with its real currency, not €', () => {
    // Showing € on a price the member paid in SEK would misreport what they
    // actually saw on their receipt (#1119 review finding B16).
    expect(formatPricePerLitre(1.4286, 'SEK')).toBe('1,4286 SEK/l')
  })
})

describe('paidPricePerLitre', () => {
  it('divides what was paid by what went in', () => {
    expect(paidPricePerLitre(aPaidFuelRecord({ totalCost: 400, quantityLitres: 200 }))).toBe(2)
  })

  it('is null for an EFNU fuelling with no cost', () => {
    expect(paidPricePerLitre(aFuelRecord({ totalCost: null }))).toBeNull()
  })

  it('rounds to the four decimals the column stores', () => {
    expect(paidPricePerLitre(aPaidFuelRecord({ totalCost: 10, quantityLitres: 7 }))).toBe(1.4286)
  })

  it('does not divide by zero', () => {
    expect(paidPricePerLitre(aPaidFuelRecord({ quantityLitres: 0 }))).toBeNull()
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

describe('prefillFromSearchParams', () => {
  const prefill = (query: string) => prefillFromSearchParams(new URLSearchParams(query))

  it('reads the deep link the issue gives as its example', () => {
    // "OH-STL + Nummela + Jet A-1 opens a form where the member only enters the
    // quantity."
    expect(prefill('ac=OH-STL&apt=EFNU&fuel=JET A-1')).toEqual({
      liquidType: LiquidType.FUEL,
      aircraftRegistration: 'OH-STL',
      airport: 'EFNU',
      fuelType: 'JET A-1',
      oilSource: undefined,
      oilCanisterId: undefined,
      label: 'OH-STL · EFNU · JET A-1',
    })
  })

  it('infers oil from a canister id, without being told', () => {
    const result = prefill('canister=44444444-4444-4444-8444-444444444444')
    expect(result).toMatchObject({
      liquidType: LiquidType.OIL,
      oilSource: OilSource.CANISTER,
      oilCanisterId: '44444444-4444-4444-8444-444444444444',
    })
    // An oil record has no airport or fuel type, so those are dropped rather
    // than carried through as dead form state.
    expect(result?.airport).toBeUndefined()
    expect(result?.fuelType).toBeUndefined()
  })

  it('honours an explicit type over the default', () => {
    expect(prefill('ac=OH-IHQ&type=OIL')?.liquidType).toBe(LiquidType.OIL)
  })

  it('drops fuel params when the link is for oil', () => {
    // Otherwise a stale ?apt= from a copied link would prefill an airport onto
    // an oil record, which has no airport at all.
    expect(prefill('ac=OH-IHQ&apt=EFNU&fuel=100LL&type=OIL')).toMatchObject({
      liquidType: LiquidType.OIL,
      airport: undefined,
      fuelType: undefined,
    })
  })

  it('is undefined when nothing usable was passed', () => {
    // A "scanned context" banner with nothing in it is worse than no banner.
    expect(prefill('')).toBeUndefined()
    expect(prefill('type=FUEL')).toBeUndefined()
    expect(prefill('unrelated=1')).toBeUndefined()
  })

  it('builds a label from only the parts it has', () => {
    expect(prefill('ac=OH-STL')?.label).toBe('OH-STL')
    expect(prefill('apt=EFNU&fuel=100LL')?.label).toBe('EFNU · 100LL')
  })
})
