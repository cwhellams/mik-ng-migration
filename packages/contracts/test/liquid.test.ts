import { describe, expect, it } from 'vitest'

import { FlightLogStatus } from '../src/flight-log.ts'
import {
  AssignQrCodeSchema,
  compareToReferencePrice,
  computeLiquidFuelPricing,
  computeLiquidRecordLock,
  CreateLiquidRecordSchema,
  CreateOilCanisterSchema,
  CreateQrBatchSchema,
  deriveTaxIncludedAbroad,
  FuelPriceComparisonQuerySchema,
  HOME_BASE_ICAO,
  isAirportOutsideFinland,
  isHomeBase,
  JET_A1,
  LIQUID_EDIT_WINDOW_DAYS,
  LiquidLockReason,
  LiquidRecordFilterSchema,
  LiquidRecordSource,
  LiquidType,
  liquidReportPath,
  OIL_MAX_LITRES,
  OilSource,
  QrCodeFilterSchema,
  qrScanPath,
  QrTargetType,
  requiresTotalCost,
  resolveHomeBaseProvider,
  round4,
  selectableProviders,
  suggestCanisterRef,
  UpdateLiquidRecordSchema,
  type FuelProvider,
  type LockActor,
  type LockInput,
} from '../src/liquid.ts'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-15T12:00:00.000Z')
const daysBefore = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

const aLockInput = (overrides: Partial<LockInput> = {}): LockInput => ({
  memberId: 'Matti1',
  expenseClaimId: null,
  flightLogStatus: null,
  createdAt: daysBefore(1),
  deletedAt: null,
  ...overrides,
})

const owner: LockActor = { memberId: 'Matti1', isLiquidAdmin: false }
const otherMember: LockActor = { memberId: 'Liisa1', isLiquidAdmin: false }
const admin: LockActor = { memberId: 'k1mnimda', isLiquidAdmin: true }

const provider = (overrides: Partial<FuelProvider> = {}): FuelProvider => ({
  providerId: 1,
  code: 'MPL',
  name: 'Moottoripurjelentäjät',
  defaultAirport: HOME_BASE_ICAO,
  fuelTypes: ['MOGAS 98E5', 'MOGAS 95E10'],
  requiresTotalCost: false,
  requiresClaim: false,
  isHomeBase: true,
  sortOrder: 10,
  isActive: true,
  ...overrides,
})

const HOME_PROVIDERS = [
  provider(),
  provider({
    providerId: 2,
    code: 'EFNU_FUEL',
    name: 'EFNU Polttoainemyynti',
    fuelTypes: ['100LL'],
    sortOrder: 20,
  }),
  provider({
    providerId: 3,
    code: 'LOKKI',
    name: 'Lentokoneosakeyhtiö Lokki & Kumppanit',
    fuelTypes: [JET_A1],
    sortOrder: 30,
  }),
]

const AWAY_PROVIDERS = [
  provider({
    providerId: 4,
    code: 'AIRBP',
    name: 'AirBP',
    defaultAirport: null,
    fuelTypes: null,
    requiresTotalCost: true,
    isHomeBase: false,
    sortOrder: 40,
  }),
  provider({
    providerId: 5,
    code: 'OTHER',
    name: 'Other / own payment',
    defaultAirport: null,
    fuelTypes: null,
    requiresTotalCost: true,
    requiresClaim: true,
    isHomeBase: false,
    sortOrder: 60,
  }),
]

const ALL_PROVIDERS = [...HOME_PROVIDERS, ...AWAY_PROVIDERS]

// ─── Lock rules ───────────────────────────────────────────────────────────────

describe('computeLiquidRecordLock', () => {
  // The whole matrix the issue specifies, as one table: four lock conditions
  // against the three kinds of actor. This is the highest-risk logic in #1119 —
  // it decides whether a member can rewrite a figure the club has already
  // invoiced on.
  const cases: {
    name: string
    record: LockInput
    actor: LockActor
    canEdit: boolean
    reason?: LiquidLockReason
  }[] = [
    {
      name: 'owner, fresh, unlinked → editable',
      record: aLockInput(),
      actor: owner,
      canEdit: true,
    },
    {
      name: 'owner, linked to a NEW flight log → still editable',
      record: aLockInput({ flightLogStatus: FlightLogStatus.NEW }),
      actor: owner,
      canEdit: true,
    },
    {
      name: 'owner, linked to a VALIDATED flight log → locked',
      record: aLockInput({ flightLogStatus: FlightLogStatus.VALIDATED }),
      actor: owner,
      canEdit: false,
      reason: LiquidLockReason.LINKED_TO_VALIDATED_FLIGHT_LOG,
    },
    {
      name: 'owner, linked to an INVOICED flight log → locked',
      record: aLockInput({ flightLogStatus: FlightLogStatus.INVOICED }),
      actor: owner,
      canEdit: false,
      reason: LiquidLockReason.LINKED_TO_VALIDATED_FLIGHT_LOG,
    },
    {
      name: 'owner, older than the edit window → locked',
      record: aLockInput({ createdAt: daysBefore(LIQUID_EDIT_WINDOW_DAYS + 1) }),
      actor: owner,
      canEdit: false,
      reason: LiquidLockReason.EDIT_WINDOW_EXPIRED,
    },
    {
      name: 'owner, claim-linked → locked',
      record: aLockInput({ expenseClaimId: 'c0000000-0000-4000-8000-000000000000' }),
      actor: owner,
      canEdit: false,
      reason: LiquidLockReason.LINKED_TO_EXPENSE_CLAIM,
    },
    {
      name: 'another member, fresh and unlinked → never',
      record: aLockInput(),
      actor: otherMember,
      canEdit: false,
      reason: LiquidLockReason.NOT_OWNER,
    },
    {
      name: 'admin, fresh → editable',
      record: aLockInput(),
      actor: admin,
      canEdit: true,
    },
    {
      name: 'admin, past the edit window → editable (that lock is the member’s)',
      record: aLockInput({ createdAt: daysBefore(90) }),
      actor: admin,
      canEdit: true,
    },
    {
      name: 'admin, linked to a VALIDATED flight log → editable',
      record: aLockInput({ flightLogStatus: FlightLogStatus.VALIDATED }),
      actor: admin,
      canEdit: true,
    },
    {
      name: 'admin, claim-linked → locked, admin or not',
      record: aLockInput({ expenseClaimId: 'c0000000-0000-4000-8000-000000000000' }),
      actor: admin,
      canEdit: false,
      reason: LiquidLockReason.LINKED_TO_EXPENSE_CLAIM,
    },
    {
      name: 'admin, already deleted → nothing left to change',
      record: aLockInput({ deletedAt: daysBefore(0.5) }),
      actor: admin,
      canEdit: false,
      reason: LiquidLockReason.DELETED,
    },
  ]

  it.each(cases)('$name', ({ record, actor, canEdit, reason }) => {
    const lock = computeLiquidRecordLock(record, actor, NOW)
    expect(lock.canEdit).toBe(canEdit)
    // Nothing in the issue lets a record be editable but undeletable, or the
    // other way round, so the two always agree.
    expect(lock.canDelete).toBe(canEdit)
    expect(lock.reason).toBe(reason)
  })

  it('locks the owner exactly one week after creation, not a day early', () => {
    const justInside = aLockInput({
      createdAt: new Date(
        NOW.getTime() - LIQUID_EDIT_WINDOW_DAYS * 86_400_000 + 1000,
      ).toISOString(),
    })
    const justOutside = aLockInput({
      createdAt: new Date(
        NOW.getTime() - LIQUID_EDIT_WINDOW_DAYS * 86_400_000 - 1000,
      ).toISOString(),
    })

    expect(computeLiquidRecordLock(justInside, owner, NOW).canEdit).toBe(true)
    expect(computeLiquidRecordLock(justOutside, owner, NOW).canEdit).toBe(false)
  })

  it('measures the window from creation, so back-dating cannot reopen it', () => {
    // recordedAt is deliberately absent from LockInput: a member who could
    // back-date a record would otherwise be handing themselves a fresh week.
    const oldRecord = aLockInput({ createdAt: daysBefore(30) })
    expect(computeLiquidRecordLock(oldRecord, owner, NOW).reason).toBe(
      LiquidLockReason.EDIT_WINDOW_EXPIRED,
    )
  })

  it('reports the claim lock ahead of every other reason', () => {
    // A claim-linked record that is also stale and on a validated flight log
    // must still say *why* it is immutable, because that reason is the one that
    // applies to admins too.
    const everything = aLockInput({
      expenseClaimId: 'c0000000-0000-4000-8000-000000000000',
      flightLogStatus: FlightLogStatus.PAID,
      createdAt: daysBefore(60),
    })
    expect(computeLiquidRecordLock(everything, admin, NOW).reason).toBe(
      LiquidLockReason.LINKED_TO_EXPENSE_CLAIM,
    )
  })
})

// ─── Location and tax derivation ──────────────────────────────────────────────

describe('location helpers', () => {
  it.each([
    ['EFNU', true],
    ['efnu', true],
    ['EFHK', false],
    [null, false],
    [undefined, false],
  ])('isHomeBase(%s) → %s', (airport, expected) => {
    expect(isHomeBase(airport)).toBe(expected)
  })

  it.each([
    ['EFNU', false],
    ['EFHK', false],
    ['esgg', true],
    ['ESGG', true],
    [null, false],
  ])('isAirportOutsideFinland(%s) → %s', (icao, expected) => {
    expect(isAirportOutsideFinland(icao)).toBe(expected)
  })

  it('requires a total cost away from home base, for fuel only', () => {
    expect(requiresTotalCost(LiquidType.FUEL, 'ESGG')).toBe(true)
    expect(requiresTotalCost(LiquidType.FUEL, 'EFNU')).toBe(false)
    // Oil is club stock wherever it is poured, so there is nothing to pay.
    expect(requiresTotalCost(LiquidType.OIL, 'ESGG')).toBe(false)
  })

  it.each([
    ['ESGG', JET_A1, true, 'Jet A-1 abroad'],
    ['EFNU', JET_A1, false, 'Jet A-1 at home'],
    ['EFHK', JET_A1, false, 'Jet A-1 elsewhere in Finland'],
    // The issue scopes the automatic flag to Jet A-1 specifically; other fuels
    // bought abroad stay unflagged unless the member ticks it.
    ['ESGG', '100LL', false, '100LL abroad'],
  ])('deriveTaxIncludedAbroad(%s, %s) → %s (%s)', (airport, fuelType, expected) => {
    expect(deriveTaxIncludedAbroad(airport, fuelType)).toBe(expected)
  })
})

// ─── Provider resolution ──────────────────────────────────────────────────────

describe('provider resolution', () => {
  it.each([
    ['MOGAS 98E5', 'MPL'],
    ['MOGAS 95E10', 'MPL'],
    ['100LL', 'EFNU_FUEL'],
    [JET_A1, 'LOKKI'],
  ])('at EFNU, %s is sold by %s', (fuelType, code) => {
    expect(resolveHomeBaseProvider(ALL_PROVIDERS, fuelType)?.code).toBe(code)
  })

  it('has no home-base provider for a fuel EFNU does not sell', () => {
    expect(resolveHomeBaseProvider(ALL_PROVIDERS, 'JP-8')).toBeUndefined()
  })

  it('ignores a deactivated home-base provider', () => {
    const deactivated = ALL_PROVIDERS.map((p) =>
      p.code === 'LOKKI' ? { ...p, isActive: false } : p,
    )
    expect(resolveHomeBaseProvider(deactivated, JET_A1)).toBeUndefined()
  })

  it('offers only home-base providers at EFNU, filtered by fuel type', () => {
    expect(selectableProviders(ALL_PROVIDERS, 'EFNU', '100LL').map((p) => p.code)).toEqual([
      'EFNU_FUEL',
    ])
  })

  it('offers only travelling providers away from home, in sort order', () => {
    expect(selectableProviders(ALL_PROVIDERS, 'ESGG', JET_A1).map((p) => p.code)).toEqual([
      'AIRBP',
      'OTHER',
    ])
  })

  it('does not filter travelling providers by fuel type — they sell what the airport has', () => {
    expect(selectableProviders(ALL_PROVIDERS, 'ESGG', 'JP-8').map((p) => p.code)).toEqual([
      'AIRBP',
      'OTHER',
    ])
  })
})

// ─── Fuel pricing ─────────────────────────────────────────────────────────────

describe('computeLiquidFuelPricing', () => {
  it('adds the configured Finnish fuel tax to Jet A-1 bought in Finland', () => {
    const pricing = computeLiquidFuelPricing({
      quantityLitres: 200,
      totalCost: 400,
      taxIncludedAbroad: false,
      recordedAt: '2026-03-01T10:00:00.000Z',
      taxRateEurPerLitre: 0.1,
    })

    expect(pricing.originalPaidTotal).toBe(400)
    expect(pricing.originalPricePerLitre).toBe(2)
    expect(pricing.taxAdjustedPricePerLitre).toBe(2.1)
    expect(pricing.fuelTaxYear).toBe(2026)
    expect(pricing.fuelTaxRateApplied).toBe(0.1)
  })

  it('adds no tax to Jet A-1 bought abroad — that price already includes it', () => {
    const pricing = computeLiquidFuelPricing({
      quantityLitres: 200,
      totalCost: 400,
      taxIncludedAbroad: true,
      recordedAt: '2026-03-01T10:00:00.000Z',
      taxRateEurPerLitre: 0.1,
    })

    expect(pricing.taxAdjustedPricePerLitre).toBe(2)
    // Nothing was applied, so nothing is recorded as having been applied —
    // otherwise a reader would see a rate and assume it moved the figure.
    expect(pricing.fuelTaxRateApplied).toBeNull()
    expect(pricing.fuelTaxYear).toBeNull()
  })

  it('leaves a fuel type with no configured rate unadjusted', () => {
    // This is how "other fuel types unaffected" falls out of the general rule
    // rather than needing a branch: only Jet A-1 has a rate in practice.
    const pricing = computeLiquidFuelPricing({
      quantityLitres: 100,
      totalCost: 250,
      taxIncludedAbroad: false,
      recordedAt: '2026-03-01T10:00:00.000Z',
      taxRateEurPerLitre: null,
    })

    expect(pricing.taxAdjustedPricePerLitre).toBe(2.5)
    expect(pricing.fuelTaxRateApplied).toBeNull()
  })

  it('converts a non-EUR purchase before comparing, and keeps the paid figures intact', () => {
    const pricing = computeLiquidFuelPricing({
      quantityLitres: 100,
      totalCost: 2000, // SEK
      ccy: 'SEK',
      fxRate: 0.09,
      taxIncludedAbroad: false,
      recordedAt: '2026-03-01T10:00:00.000Z',
      taxRateEurPerLitre: 0.1,
    })

    // "Preserve the original paid amount and original paid litre price."
    expect(pricing.originalPaidTotal).toBe(2000)
    expect(pricing.originalPricePerLitre).toBe(20)
    // 20 SEK/l × 0.09 = 1.80 €/l, plus 0.10 € tax.
    expect(pricing.taxAdjustedPricePerLitre).toBe(1.9)
  })

  it('prices nothing when there is no cost, but still says which year applied', () => {
    // EFNU fuelling is invoiced to the club, so a missing total is normal.
    const pricing = computeLiquidFuelPricing({
      quantityLitres: 150,
      totalCost: null,
      taxIncludedAbroad: false,
      recordedAt: '2026-03-01T10:00:00.000Z',
      taxRateEurPerLitre: 0.1,
    })

    expect(pricing.originalPricePerLitre).toBeNull()
    expect(pricing.taxAdjustedPricePerLitre).toBeNull()
    expect(pricing.fuelTaxYear).toBe(2026)
  })

  it('takes the tax year from the record date, not from today', () => {
    // The point of freezing the year onto the record: a claim filed in January
    // for December's fuelling is taxed at December's rate.
    expect(
      computeLiquidFuelPricing({
        quantityLitres: 10,
        totalCost: 20,
        taxIncludedAbroad: false,
        recordedAt: '2025-12-15T10:00:00.000Z',
        taxRateEurPerLitre: 0.05,
      }).fuelTaxYear,
    ).toBe(2025)
  })

  it('takes the year from the club’s own Helsinki calendar, not UTC’s', () => {
    // 2025-12-31T23:00Z is already 2026-01-01 in Helsinki (UTC+2 in winter) —
    // a fuelling right around New Year must freeze the year the club actually
    // sees it in, not whichever side of midnight UTC happens to land on.
    expect(
      computeLiquidFuelPricing({
        quantityLitres: 10,
        totalCost: 20,
        taxIncludedAbroad: false,
        recordedAt: '2025-12-31T23:00:00.000Z',
        taxRateEurPerLitre: 0.05,
      }).fuelTaxYear,
    ).toBe(2026)
  })

  it('rounds to the four decimals the column stores', () => {
    const pricing = computeLiquidFuelPricing({
      quantityLitres: 7,
      totalCost: 10,
      taxIncludedAbroad: false,
      recordedAt: '2026-03-01T10:00:00.000Z',
      taxRateEurPerLitre: 0,
    })
    expect(pricing.originalPricePerLitre).toBe(1.4286)
  })
})

// ─── Reference price comparison ───────────────────────────────────────────────

describe('compareToReferencePrice', () => {
  it('flags a fuelling above the reference and reports the delta', () => {
    expect(
      compareToReferencePrice({
        taxAdjustedPricePerLitre: 2.5,
        storedTaxAdjustedPricePerLitre: null,
        referencePrice: 2.1,
      }),
    ).toEqual({ comparable: true, exceedsReference: true, deltaPerLitre: 0.4 })
  })

  it('does not flag a fuelling at exactly the reference price', () => {
    expect(
      compareToReferencePrice({
        taxAdjustedPricePerLitre: 2.1,
        storedTaxAdjustedPricePerLitre: null,
        referencePrice: 2.1,
      }),
    ).toEqual({ comparable: true, exceedsReference: false, deltaPerLitre: 0 })
  })

  it('prefers the price frozen on the record over a recomputed one', () => {
    // The claim was settled on the stored figure; the report must not tell a
    // different story from the payment.
    expect(
      compareToReferencePrice({
        taxAdjustedPricePerLitre: 9.99,
        storedTaxAdjustedPricePerLitre: 2.0,
        referencePrice: 2.1,
      }),
    ).toEqual({ comparable: true, exceedsReference: false, deltaPerLitre: -0.1 })
  })

  it('is not comparable when the record has no price — an EFNU fuelling with no cost', () => {
    expect(
      compareToReferencePrice({
        taxAdjustedPricePerLitre: null,
        storedTaxAdjustedPricePerLitre: null,
        referencePrice: 2.1,
      }),
    ).toEqual({ comparable: false, exceedsReference: false, deltaPerLitre: null })
  })

  it('is not comparable when no reference price was entered for that fuel type', () => {
    expect(
      compareToReferencePrice({
        taxAdjustedPricePerLitre: 2.5,
        storedTaxAdjustedPricePerLitre: null,
        referencePrice: undefined,
      }),
    ).toEqual({ comparable: false, exceedsReference: false, deltaPerLitre: null })
  })
})

// ─── Request schemas ──────────────────────────────────────────────────────────

const aFuelRequest = (overrides: Record<string, unknown> = {}) => ({
  liquidType: LiquidType.FUEL,
  aircraftRegistration: 'OH-STL',
  airport: 'EFNU',
  fuelType: JET_A1,
  quantityLitres: 120,
  ...overrides,
})

const anOilRequest = (overrides: Record<string, unknown> = {}) => ({
  liquidType: LiquidType.OIL,
  aircraftRegistration: 'OH-IHQ',
  oilSource: OilSource.CANISTER,
  oilCanisterId: '11111111-1111-4111-8111-111111111111',
  quantityLitres: 0.5,
  ...overrides,
})

describe('CreateLiquidRecordSchema', () => {
  it('accepts an EFNU fuelling with no total cost', () => {
    const parsed = CreateLiquidRecordSchema.parse(aFuelRequest())
    expect(parsed.ccy).toBe('EUR')
    expect(parsed.source).toBe(LiquidRecordSource.MANUAL)
    expect(parsed.markCanisterEmpty).toBe(false)
  })

  it('rejects an away-from-EFNU fuelling with no total cost', () => {
    const result = CreateLiquidRecordSchema.safeParse(
      aFuelRequest({ airport: 'ESGG', totalCost: undefined }),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('totalCost')
  })

  it('accepts an away-from-EFNU fuelling once the total cost is there', () => {
    expect(
      CreateLiquidRecordSchema.safeParse(aFuelRequest({ airport: 'ESGG', totalCost: 480 })).success,
    ).toBe(true)
  })

  it.each(['airport', 'fuelType'])('requires %s on a fuel record', (field) => {
    const result = CreateLiquidRecordSchema.safeParse(aFuelRequest({ [field]: undefined }))
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain(field)
  })

  it('accepts club-canister oil', () => {
    expect(CreateLiquidRecordSchema.safeParse(anOilRequest()).success).toBe(true)
  })

  it('requires a canister when the oil came off the club shelf', () => {
    const result = CreateLiquidRecordSchema.safeParse(anOilRequest({ oilCanisterId: undefined }))
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('oilCanisterId')
  })

  it.each(['oilMake', 'oilModelViscosity', 'oilBatchNumber'])(
    'requires %s for oil from another source',
    (field) => {
      const result = CreateLiquidRecordSchema.safeParse(
        anOilRequest({
          oilSource: OilSource.OTHER,
          oilCanisterId: undefined,
          oilMake: 'Aeroshell',
          oilModelViscosity: 'W100',
          oilBatchNumber: 'B-42',
          [field]: undefined,
        }),
      )
      expect(result.success).toBe(false)
      expect(result.error?.issues.map((i) => i.path.join('.'))).toContain(field)
    },
  )

  it('refuses to attribute non-club oil to a club canister', () => {
    const result = CreateLiquidRecordSchema.safeParse(
      anOilRequest({
        oilSource: OilSource.OTHER,
        oilMake: 'Aeroshell',
        oilModelViscosity: 'W100',
        oilBatchNumber: 'B-42',
      }),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('oilCanisterId')
  })

  it('rejects an oil quantity past the tighter oil-specific bound', () => {
    // A fuel tank measures in the hundreds of litres; an engine's oil system
    // does not. Oil used to share fuel's 10,000L bound entirely, so a 100L
    // "oil" entry passed validation everywhere.
    const result = CreateLiquidRecordSchema.safeParse(
      anOilRequest({ quantityLitres: OIL_MAX_LITRES + 1 }),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('quantityLitres')
  })

  it('accepts an oil quantity right at the bound, and never restricts fuel this way', () => {
    expect(
      CreateLiquidRecordSchema.safeParse(anOilRequest({ quantityLitres: OIL_MAX_LITRES })).success,
    ).toBe(true)
    expect(
      CreateLiquidRecordSchema.safeParse(aFuelRequest({ quantityLitres: OIL_MAX_LITRES + 1 }))
        .success,
    ).toBe(true)
  })

  it('requires an exchange rate for a non-EUR purchase', () => {
    const result = CreateLiquidRecordSchema.safeParse(
      aFuelRequest({ airport: 'ESGG', totalCost: 4800, ccy: 'SEK' }),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('fxRate')
  })

  it('rejects a non-positive quantity', () => {
    expect(CreateLiquidRecordSchema.safeParse(aFuelRequest({ quantityLitres: 0 })).success).toBe(
      false,
    )
  })

  it('rounds litres to the three decimals the column stores', () => {
    const parsed = CreateLiquidRecordSchema.parse(aFuelRequest({ quantityLitres: 120.98765 }))
    expect(parsed.quantityLitres).toBe(120.988)
  })

  it('upper-cases the airport, so it matches static.airfields', () => {
    // A lowercase code would miss the foreign key and surface as a 500, and
    // would also read as "away from home" — demanding a cost EFNU never needs.
    expect(CreateLiquidRecordSchema.parse(aFuelRequest({ airport: 'efnu' })).airport).toBe('EFNU')
  })

  it('upper-cases an away airport too, without breaking the cost rule', () => {
    const result = CreateLiquidRecordSchema.safeParse(
      aFuelRequest({ airport: 'eepu', totalCost: 400 }),
    )
    expect(result.success).toBe(true)
    expect(result.data?.airport).toBe('EEPU')
  })

  it('still requires a cost for a lower-cased away airport', () => {
    expect(CreateLiquidRecordSchema.safeParse(aFuelRequest({ airport: 'eepu' })).success).toBe(
      false,
    )
  })
})

describe('UpdateLiquidRecordSchema', () => {
  it('applies no defaults, so a PATCH cannot reset a field it never mentioned', () => {
    // The trap this schema exists to avoid: CreateLiquidRecordSchema.partial()
    // keeps its .default() calls, so a body of {quantityLitres: 5} would have
    // silently reset ccy to EUR and markCanisterEmpty to false.
    const parsed = UpdateLiquidRecordSchema.parse({ quantityLitres: 5 })
    expect(parsed).toEqual({ quantityLitres: 5 })
    expect('ccy' in parsed).toBe(false)
    expect('markCanisterEmpty' in parsed).toBe(false)
  })

  it('accepts an empty body', () => {
    expect(UpdateLiquidRecordSchema.parse({})).toEqual({})
  })

  it('lets a link be cleared with null', () => {
    expect(UpdateLiquidRecordSchema.parse({ flightLogId: null })).toEqual({ flightLogId: null })
  })

  it('upper-cases an edited airport, and leaves a cleared one null', () => {
    expect(UpdateLiquidRecordSchema.parse({ airport: 'efhk' }).airport).toBe('EFHK')
    expect(UpdateLiquidRecordSchema.parse({ airport: null }).airport).toBeNull()
  })

  it('cannot change what the record is', () => {
    const parsed = UpdateLiquidRecordSchema.parse({
      liquidType: LiquidType.OIL,
      memberId: 'Liisa1',
      source: LiquidRecordSource.QR,
    } as never)
    // Unknown keys are stripped rather than rejected, but none of the three
    // reaches the update statement.
    expect(parsed).toEqual({})
  })
})

describe('CreateOilCanisterSchema', () => {
  it('accepts a full canister', () => {
    expect(
      CreateOilCanisterSchema.safeParse({
        clubCanisterRef: 'MIK AS 26/1',
        batchNumber: 'B-123',
        make: 'Aeroshell',
        modelViscosity: 'W100',
        aircraftRegistration: 'OH-IHQ',
        initialLitres: 1,
      }).success,
    ).toBe(true)
  })

  it.each(['clubCanisterRef', 'batchNumber', 'make', 'modelViscosity', 'aircraftRegistration'])(
    'requires %s',
    (field) => {
      const body: Record<string, unknown> = {
        clubCanisterRef: 'MIK AS 26/1',
        batchNumber: 'B-123',
        make: 'Aeroshell',
        modelViscosity: 'W100',
        aircraftRegistration: 'OH-IHQ',
      }
      delete body[field]
      expect(CreateOilCanisterSchema.safeParse(body).success).toBe(false)
    },
  )
})

describe('suggestCanisterRef', () => {
  it('builds the club’s MIK <initials> <YY>/<seq> format', () => {
    expect(suggestCanisterRef('Aeroshell', 2, 2026)).toBe('MIK A 26/3')
    expect(suggestCanisterRef('Phillips 66 XC', 0, 2026)).toBe('MIK P6X 26/1')
  })

  it('falls back to OIL when the make has no letters to take initials from', () => {
    expect(suggestCanisterRef('  ', 0, 2025)).toBe('MIK OIL 25/1')
  })

  it('pads a single-digit year', () => {
    expect(suggestCanisterRef('Aeroshell', 0, 2109)).toBe('MIK A 09/1')
  })
})

describe('QR schemas and links', () => {
  it('caps a batch at eight A4 sheets', () => {
    expect(CreateQrBatchSchema.safeParse({ label: 'Hangar', count: 96 }).success).toBe(true)
    expect(CreateQrBatchSchema.safeParse({ label: 'Hangar', count: 97 }).success).toBe(false)
  })

  it('accepts only the target types that exist', () => {
    const targetId = '11111111-1111-1111-1111-111111111111'
    expect(
      AssignQrCodeSchema.safeParse({ targetType: QrTargetType.OIL_CANISTER, targetId }).success,
    ).toBe(true)
    expect(AssignQrCodeSchema.safeParse({ targetType: 'AIRCRAFT', targetId }).success).toBe(false)
  })

  it('does not treat the query string "false" as true', () => {
    // Regression: z.coerce.boolean() is Boolean(value), and Boolean('false')
    // is true — every request sent with the toggle off (a literal
    // ?unassignedOnly=false, which is what the admin console sends) would have
    // filtered to unassigned codes anyway, hiding every assigned one.
    expect(QrCodeFilterSchema.parse({ unassignedOnly: 'false' }).unassignedOnly).toBe(false)
    expect(QrCodeFilterSchema.parse({ unassignedOnly: 'true' }).unassignedOnly).toBe(true)
    expect(QrCodeFilterSchema.parse({}).unassignedOnly).toBe(false)
  })

  it('encodes only the code in the scan path, never the target', () => {
    // What makes an identity printable before it is assigned.
    expect(qrScanPath('MIK-L-7F3K')).toBe('/liquid/scan/MIK-L-7F3K')
  })

  it('escapes a code that would otherwise change the path', () => {
    expect(qrScanPath('a/b?c')).toBe('/liquid/scan/a%2Fb%3Fc')
  })

  it('builds a prefill deep link from only the params it was given', () => {
    expect(liquidReportPath({ ac: 'OH-STL', apt: 'EFNU', fuel: JET_A1 })).toBe(
      '/liquid/new?ac=OH-STL&apt=EFNU&fuel=JET+A-1',
    )
    expect(liquidReportPath({ ac: undefined })).toBe('/liquid/new')
  })
})

describe('FuelPriceComparisonQuerySchema', () => {
  it('parses one reference price per fuel type', () => {
    const parsed = FuelPriceComparisonQuerySchema.parse({
      from: '2026-01-01',
      to: '2026-06-30',
      reference: ['JET A-1:2.10', '100LL:2.95', 'MOGAS 98E5:1.85'],
    })
    expect(parsed.reference).toEqual({ 'JET A-1': 2.1, '100LL': 2.95, 'MOGAS 98E5': 1.85 })
  })

  it('accepts a single reference as a bare string', () => {
    // Express's qs parser hands back a string, not an array, for one occurrence.
    const parsed = FuelPriceComparisonQuerySchema.parse({
      from: '2026-01-01',
      to: '2026-06-30',
      reference: 'JET A-1:2.10',
    })
    expect(parsed.reference).toEqual({ 'JET A-1': 2.1 })
  })

  it('splits on the last colon, so a fuel type containing one survives', () => {
    const parsed = FuelPriceComparisonQuerySchema.parse({
      from: '2026-01-01',
      to: '2026-06-30',
      reference: 'JET A-1:SPECIAL:2.10',
    })
    expect(parsed.reference).toEqual({ 'JET A-1:SPECIAL': 2.1 })
  })

  it('runs with no reference prices at all — every row is then simply not comparable', () => {
    expect(
      FuelPriceComparisonQuerySchema.parse({ from: '2026-01-01', to: '2026-06-30' }).reference,
    ).toEqual({})
  })

  it.each(['JET A-1:abc', 'JET A-1:0', 'JET A-1:-1', ':2.10', 'no-colon'])(
    'rejects the malformed reference %s',
    (reference) => {
      const result = FuelPriceComparisonQuerySchema.safeParse({
        from: '2026-01-01',
        to: '2026-06-30',
        reference,
      })
      expect(result.success).toBe(false)
    },
  )

  it('requires real calendar dates', () => {
    expect(
      FuelPriceComparisonQuerySchema.safeParse({ from: 'yesterday', to: '2026-06-30' }).success,
    ).toBe(false)
  })
})

describe('LiquidRecordFilterSchema', () => {
  it('defaults to the shared 100/500 limit-offset pair', () => {
    // Reuses LimitOffsetSchema(100, 500) rather than hand-defining limit/offset
    // a second time — this pins the pair it now inherits.
    const parsed = LiquidRecordFilterSchema.parse({})
    expect(parsed.limit).toBe(100)
    expect(parsed.offset).toBe(0)
  })

  it('rejects a limit past the shared cap', () => {
    expect(LiquidRecordFilterSchema.safeParse({ limit: 501 }).success).toBe(false)
    expect(LiquidRecordFilterSchema.safeParse({ limit: 500 }).success).toBe(true)
  })
})

describe('round4', () => {
  it('is exported so callers price a litre the same way computeLiquidFuelPricing does', () => {
    // liquidClaimItems.ts's derived line-item price and the frontend's
    // paidPricePerLitre both used to reimplement this inline.
    expect(round4(10 / 7)).toBe(1.4286)
  })
})
