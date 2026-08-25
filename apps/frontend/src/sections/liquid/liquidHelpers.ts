import type { TFunction } from 'i18next'

import {
  LiquidLockReason,
  LiquidType,
  OilSource,
  type LiquidPrefill,
  type LiquidRecordWithLock,
} from '@mik/contracts/liquid'

/**
 * Presentation helpers for the liquid section.
 *
 * Everything here is a pure function of its arguments, so the reporting form and
 * the two list views can be tested without rendering any of them. The *rules* are
 * not here — they are in `@mik/contracts/liquid`, shared with the server.
 */

/** Translation key for a lock reason, so the UI can say why a button is disabled. */
export const lockReasonKey = (reason: LiquidLockReason): string =>
  `liquid.lock.${
    {
      [LiquidLockReason.LINKED_TO_EXPENSE_CLAIM]: 'claimLinked',
      [LiquidLockReason.LINKED_TO_VALIDATED_FLIGHT_LOG]: 'flightValidated',
      [LiquidLockReason.EDIT_WINDOW_EXPIRED]: 'windowExpired',
      [LiquidLockReason.NOT_OWNER]: 'notOwner',
      [LiquidLockReason.DELETED]: 'deleted',
    }[reason]
  }`

const litres = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 3 })
const money = new Intl.NumberFormat('fi-FI', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const perLitre = new Intl.NumberFormat('fi-FI', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

export const formatLitres = (value: number): string => `${litres.format(value)} l`

export const formatCost = (value: number | null, ccy: string): string | null =>
  value == null ? null : `${money.format(value)} ${ccy}`

export const formatPricePerLitre = (value: number | null): string | null =>
  value == null ? null : `${perLitre.format(value)} €/l`

/**
 * The one-line summary of a record, for a list row.
 *
 * Fuel and oil have almost nothing in common to show — an airport and a provider
 * versus a canister and a viscosity — so this branches rather than trying to find
 * a shared shape.
 */
export const describeRecord = (record: LiquidRecordWithLock, t: TFunction): string => {
  if (record.liquidType === LiquidType.FUEL) {
    return [
      record.fuelType,
      record.airport,
      record.providerName,
      formatLitres(record.quantityLitres),
      formatCost(record.totalCost, record.ccy),
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return [
    record.oilSource === OilSource.CANISTER
      ? record.oilCanisterRef
      : t('liquid.oil.otherSourceShort'),
    record.oilMake,
    record.oilModelViscosity,
    formatLitres(record.quantityLitres),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * A record's paid litre price, for display only.
 *
 * Deliberately not the tax-adjusted figure: this is what the member handed over,
 * and showing them a number they never paid — because the club added fuel tax to
 * it — reads as an error in the form. The adjusted price belongs in the claim and
 * the report, which say so.
 */
export const paidPricePerLitre = (record: LiquidRecordWithLock): number | null =>
  record.totalCost == null || record.quantityLitres <= 0
    ? null
    : Math.round((record.totalCost / record.quantityLitres) * 10_000) / 10_000

/**
 * Turns the `?ac=&apt=&fuel=&canister=&type=` deep link into the same prefill
 * shape a scanned QR code resolves to, so the form has one code path for both.
 *
 * Returns undefined when nothing usable was passed, rather than an empty prefill:
 * a form with a "scanned context" banner and nothing in it is worse than no
 * banner.
 */
export const prefillFromSearchParams = (params: URLSearchParams): LiquidPrefill | undefined => {
  const aircraftRegistration = params.get('ac') ?? undefined
  const airport = params.get('apt') ?? undefined
  const fuelType = params.get('fuel') ?? undefined
  const oilCanisterId = params.get('canister') ?? undefined
  const requested = params.get('type')

  if (!aircraftRegistration && !airport && !fuelType && !oilCanisterId) return undefined

  const liquidType =
    requested === LiquidType.OIL || oilCanisterId ? LiquidType.OIL : LiquidType.FUEL

  return {
    liquidType,
    aircraftRegistration,
    airport: liquidType === LiquidType.FUEL ? airport : undefined,
    fuelType: liquidType === LiquidType.FUEL ? fuelType : undefined,
    oilSource: liquidType === LiquidType.OIL && oilCanisterId ? OilSource.CANISTER : undefined,
    oilCanisterId,
    label: [aircraftRegistration, airport, fuelType].filter(Boolean).join(' · '),
  }
}
