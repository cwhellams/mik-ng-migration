import { db } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type { LocalFuelPrice, UpsertLocalFuelPrice } from '../routes/fuel-prices/models.ts'
import type { FuelType } from '../routes/expenses/models.ts'

const mapLocalFuelPrice = (row: {
  id: number
  fuel_type: string
  price_eur_per_litre: unknown
  valid_from: unknown
  created_by: string
  created_at: unknown
}): LocalFuelPrice => ({
  id: row.id,
  fuelType: row.fuel_type as FuelType,
  priceEurPerLitre: Number(row.price_eur_per_litre),
  validFrom: String(row.valid_from).substring(0, 10),
  createdBy: row.created_by,
  createdAt: new Date(String(row.created_at)).toISOString(),
})

export async function getLocalFuelPrices(): Promise<LocalFuelPrice[]> {
  const rows = await db
    .selectFrom('accts.local_fuel_price')
    .selectAll()
    .orderBy('fuel_type')
    .orderBy('valid_from', 'desc')
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
    .insertInto('accts.local_fuel_price')
    .values({
      fuel_type: data.fuelType,
      price_eur_per_litre: data.priceEurPerLitre,
      valid_from: data.validFrom,
      created_by: user.memberId,
    })
    .onConflict((oc) =>
      oc.columns(['fuel_type', 'valid_from']).doUpdateSet({
        price_eur_per_litre: data.priceEurPerLitre,
        created_by: user.memberId,
        created_at: new Date(),
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
    .selectFrom('accts.local_fuel_price')
    .selectAll()
    .where('fuel_type', '=', fuelType)
    .where('valid_from', '<=', date)
    .orderBy('valid_from', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row ? mapLocalFuelPrice(row) : undefined
}
