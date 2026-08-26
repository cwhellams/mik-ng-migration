import {
  LiquidRecordSource,
  LiquidType,
  OilSource,
  QrTargetType,
  type FuelProvider,
  type FuelTax,
  type LiquidRecordWithLock,
  type OilCanister,
  type QrBatch,
  type QrCode,
} from '@mik/contracts/liquid'

import {
  ADMIN_MEMBER_ID,
  AIRCRAFT_REGISTRATION,
  FIXTURE_TIMESTAMP,
  MEMBER_ID,
} from '@mik/ui/test/fixtures/cast'

/**
 * Liquid Management System fixtures (#1119).
 *
 * The same cast and the same aircraft as everywhere else: `Matti1` reports the
 * fuel, `k1mnimda` looks after the oil shelf, and `OH-STL` is the aircraft. A
 * builder returns a complete, valid entity so a test names only the field it is
 * about.
 */

const audit = {
  createdAt: FIXTURE_TIMESTAMP,
  createdBy: MEMBER_ID,
  updatedAt: FIXTURE_TIMESTAMP,
  updatedBy: MEMBER_ID,
}

/**
 * An EFNU Jet A-1 fuelling: the common case, and the one with no cost — the club
 * is invoiced directly at the home base, so there is nothing to claim.
 */
export const aFuelRecord = (
  overrides: Partial<LiquidRecordWithLock> = {},
): LiquidRecordWithLock => ({
  recordId: '11111111-1111-4111-8111-111111111111',
  liquidType: LiquidType.FUEL,
  aircraftRegistration: AIRCRAFT_REGISTRATION,
  memberId: MEMBER_ID,
  recordedAt: FIXTURE_TIMESTAMP,
  airport: 'EFNU',
  airportName: 'Nummela Airfield',
  fuelType: 'JET A-1',
  providerId: 3,
  providerName: 'Lentokoneosakeyhtiö Lokki & Kumppanit',
  quantityLitres: 150,
  totalCost: null,
  ccy: 'EUR',
  fxRate: null,
  taxIncludedAbroad: false,
  oilSource: null,
  oilCanisterId: null,
  oilCanisterRef: null,
  oilMake: null,
  oilModelViscosity: null,
  oilBatchNumber: null,
  remainingLitres: null,
  markCanisterEmpty: false,
  flightLogId: null,
  flightLogStatus: null,
  expenseClaimId: null,
  qrId: null,
  source: LiquidRecordSource.MANUAL,
  originalPaidTotal: null,
  originalPricePerLitre: null,
  taxAdjustedPricePerLitre: null,
  fuelTaxYear: null,
  fuelTaxRateApplied: null,
  claimLinkedAt: null,
  deletedAt: null,
  deletedBy: null,
  attachmentCount: 0,
  ...audit,
  lock: { canEdit: true, canDelete: true },
  ...overrides,
})

/**
 * A fuelling the member paid for, away from the home base — the only kind that
 * can go on an expense claim.
 */
export const aPaidFuelRecord = (
  overrides: Partial<LiquidRecordWithLock> = {},
): LiquidRecordWithLock =>
  aFuelRecord({
    recordId: '22222222-2222-4222-8222-222222222222',
    airport: 'EFHK',
    airportName: 'Helsinki-Vantaa',
    providerId: 4,
    providerName: 'AirBP',
    quantityLitres: 200,
    totalCost: 400,
    ...overrides,
  })

export const anOilRecord = (overrides: Partial<LiquidRecordWithLock> = {}): LiquidRecordWithLock =>
  aFuelRecord({
    recordId: '33333333-3333-4333-8333-333333333333',
    liquidType: LiquidType.OIL,
    aircraftRegistration: 'OH-IHQ',
    airport: null,
    airportName: null,
    fuelType: null,
    providerId: null,
    providerName: null,
    quantityLitres: 0.5,
    oilSource: OilSource.CANISTER,
    oilCanisterId: '44444444-4444-4444-8444-444444444444',
    oilCanisterRef: 'MIK A 26/1',
    oilMake: 'Aeroshell',
    oilModelViscosity: 'W100',
    remainingLitres: 0.5,
    ...overrides,
  })

/** The six seeded providers, as the API returns them. */
export const theFuelProviders = (): FuelProvider[] => [
  {
    providerId: 1,
    code: 'MPL',
    name: 'Moottoripurjelentäjät',
    defaultAirport: 'EFNU',
    fuelTypes: ['MOGAS 98E5', 'MOGAS 95E10'],
    requiresTotalCost: false,
    requiresClaim: false,
    isHomeBase: true,
    sortOrder: 10,
    isActive: true,
  },
  {
    providerId: 2,
    code: 'EFNU_FUEL',
    name: 'EFNU Polttoainemyynti',
    defaultAirport: 'EFNU',
    fuelTypes: ['100LL'],
    requiresTotalCost: false,
    requiresClaim: false,
    isHomeBase: true,
    sortOrder: 20,
    isActive: true,
  },
  {
    providerId: 3,
    code: 'LOKKI',
    name: 'Lentokoneosakeyhtiö Lokki & Kumppanit',
    defaultAirport: 'EFNU',
    fuelTypes: ['JET A-1'],
    requiresTotalCost: false,
    requiresClaim: false,
    isHomeBase: true,
    sortOrder: 30,
    isActive: true,
  },
  {
    providerId: 4,
    code: 'AIRBP',
    name: 'AirBP',
    defaultAirport: null,
    fuelTypes: null,
    requiresTotalCost: true,
    requiresClaim: false,
    isHomeBase: false,
    sortOrder: 40,
    isActive: true,
  },
  {
    providerId: 5,
    code: 'KANAIR',
    name: 'Kanair',
    defaultAirport: null,
    fuelTypes: null,
    requiresTotalCost: true,
    requiresClaim: false,
    isHomeBase: false,
    sortOrder: 50,
    isActive: true,
  },
  {
    providerId: 6,
    code: 'OTHER',
    name: 'Other / own payment',
    defaultAirport: null,
    fuelTypes: null,
    requiresTotalCost: true,
    requiresClaim: true,
    isHomeBase: false,
    sortOrder: 60,
    isActive: true,
  },
]

export const anOilCanister = (overrides: Partial<OilCanister> = {}): OilCanister => ({
  canisterId: '44444444-4444-4444-8444-444444444444',
  clubCanisterRef: 'MIK A 26/1',
  batchNumber: 'B-2026-01',
  manufacturingDate: '2026-01-15',
  make: 'Aeroshell',
  modelViscosity: 'W100',
  aircraftRegistration: 'OH-IHQ',
  initialLitres: 1,
  remainingLitres: 1,
  isOpened: false,
  openedAt: null,
  isEmpty: false,
  emptiedAt: null,
  qrCode: null,
  ...audit,
  createdBy: ADMIN_MEMBER_ID,
  updatedBy: ADMIN_MEMBER_ID,
  ...overrides,
})

export const aQrCode = (overrides: Partial<QrCode> = {}): QrCode => ({
  qrId: '55555555-5555-4555-8555-555555555555',
  code: 'MIK-L-7F3KM',
  batchId: '66666666-6666-4666-8666-666666666666',
  batchLabel: 'Hangar shelf',
  targetType: null,
  targetId: null,
  targetLabel: null,
  assignedAt: null,
  assignedBy: null,
  ...audit,
  createdBy: ADMIN_MEMBER_ID,
  updatedBy: ADMIN_MEMBER_ID,
  ...overrides,
})

export const anAssignedQrCode = (overrides: Partial<QrCode> = {}): QrCode =>
  aQrCode({
    targetType: QrTargetType.OIL_CANISTER,
    targetId: '44444444-4444-4444-8444-444444444444',
    targetLabel: 'MIK A 26/1',
    assignedAt: FIXTURE_TIMESTAMP,
    assignedBy: ADMIN_MEMBER_ID,
    ...overrides,
  })

export const aQrBatch = (overrides: Partial<QrBatch> = {}): QrBatch => ({
  batchId: '66666666-6666-4666-8666-666666666666',
  label: 'Hangar shelf',
  codeCount: 12,
  assignedCount: 0,
  ...audit,
  createdBy: ADMIN_MEMBER_ID,
  updatedBy: ADMIN_MEMBER_ID,
  ...overrides,
})

export const aFuelTax = (overrides: Partial<FuelTax> = {}): FuelTax => ({
  id: 1,
  taxYear: 2026,
  fuelType: 'JET A-1',
  rateEurPerLitre: 0.1,
  ...audit,
  createdBy: ADMIN_MEMBER_ID,
  updatedBy: ADMIN_MEMBER_ID,
  ...overrides,
})
