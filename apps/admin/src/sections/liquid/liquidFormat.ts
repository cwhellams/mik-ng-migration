import type { TFunction } from 'i18next'

import { LiquidType, OilSource, type LiquidRecordWithLock } from '@mik/contracts/liquid'

/**
 * The presentation-only subset of the member app's `liquidHelpers.ts`, for the
 * liquid admin screens and the fuel-price comparison report — duplicated
 * rather than imported across the app boundary, since `apps/admin` and
 * `apps/frontend` are independent bundles that share code only through
 * `@mik/ui`. Deliberately excludes `lockReasonKey`/`paidPricePerLitre`/
 * `prefillFromSearchParams`, which are member-report-form concerns this app
 * has no use for.
 */

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

/** The one-line summary of a record, for a list row. */
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
