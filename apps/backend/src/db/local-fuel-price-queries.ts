import { db, type DbRow } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type { LocalFuelPrice, UpsertLocalFuelPrice } from '@mik/contracts/fuel-prices'
import type { FuelType } from '@mik/contracts/expenses'

// Typed from the generated schema rather than hand-declared: the old signature
// spelled four of these columns `unknown` because the snake_case row shape had to
// be written out by hand to keep the mapper compiling.
type LocalFuelPriceRow = DbRow<'accts.localFuelPrice'>

// Barely a mapper now: the plugin does the renaming and the generated types give
// real types instead of `unknown`, so the defensive String()/Number() wrappers the
// old hand-written row shape needed are gone. That matters beyond tidiness —
// `new Date(String(createdAt))` round-tripped through Date#toString(), which has no
// millisecond field, so every createdAt was silently truncated to the second.
const mapLocalFuelPrice = (row: LocalFuelPriceRow): LocalFuelPrice => ({
  id: row.id,
  fuelType: row.fuelType as FuelType,
  priceEurPerLitre: row.priceEurPerLitre,
  validFrom: row.validFrom.substring(0, 10),
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
})

export async function getLocalFuelPrices(): Promise<LocalFuelPrice[]> {
  const rows = await db
    .selectFrom('accts.localFuelPrice')
    .selectAll()
    .orderBy('fuelType')
    .orderBy('validFrom', 'desc')
    .execute()
  return rows.map(mapLocalFuelPrice)
}

/**
 * Sets the price for a fuel type from a given date. Re-setting a date that already has
 * a price overwrites that row rather than inserting a second one — (fuel_type,
 * valid_from) is unique (V1810), since duplicates would make the "most recent
 * valid_from <= date" lookup below ambiguous.
 */
export async function createLocalFuelPrice(
  data: UpsertLocalFuelPrice,
  user: JWTUser,
): Promise<LocalFuelPrice> {
  const row = await db
    .insertInto('accts.localFuelPrice')
    .values({
      fuelType: data.fuelType,
      priceEurPerLitre: data.priceEurPerLitre,
      validFrom: data.validFrom,
      createdBy: user.memberId,
    })
    .onConflict((oc) =>
      oc.columns(['fuelType', 'validFrom']).doUpdateSet({
        priceEurPerLitre: data.priceEurPerLitre,
        createdBy: user.memberId,
        createdAt: new Date(),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow()
  return mapLocalFuelPrice(row)
}

/**
 * The price in effect for a fuel type on a given date: the most recent row with
 * valid_from <= date. Returns undefined if no price has ever been set for that type
 * on or before that date (issue #955).
 */
export async function getEffectiveLocalFuelPrice(
  fuelType: FuelType,
  date: string,
): Promise<LocalFuelPrice | undefined> {
  const row = await db
    .selectFrom('accts.localFuelPrice')
    .selectAll()
    .where('fuelType', '=', fuelType)
    .where('validFrom', '<=', date)
    .orderBy('validFrom', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row ? mapLocalFuelPrice(row) : undefined
}
