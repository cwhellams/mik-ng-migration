import { db } from './connection.ts'
import type {
  PublicAircraftPricing,
  PublicMembershipFee,
  PublicEquipmentFee,
} from '@mik/contracts/prices'
import {
  ART_EQUIP_FEE_CODE,
  ART_MEMBER_FEE_CODE,
  ART_JUNIOR_MEMBER_FEE_CODE,
  ART_SUPPORTING_MEMBER_FEE_CODE,
} from '../services/accounting/config.ts'
import {
  HALF_YEAR_DISCOUNT_PERCENT,
  isAfterEquipmentFeeDiscountDate,
  isAfterMembershipFeeDiscountDate,
} from '../util/feeDiscounts.ts'

/**
 * Get current aircraft pricing (currently valid or most recent)
 * Returns only the current/active pricing for each aircraft
 */
export async function getCurrentAircraftPricing(): Promise<PublicAircraftPricing[]> {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  const results = await db
    .selectFrom('accts.aircraftPricing')
    .select(['registration', 'pricePerMin', 'validFrom', 'validTo'])
    .where('validFrom', '<=', today)
    .where((eb) => eb.or([eb('validTo', 'is', null), eb('validTo', '>=', today)]))
    .orderBy('registration', 'asc')
    .execute()

  // snake_case on the left because these are the wire contract's field names, not
  // column names — @mik/contracts/prices declares valid_from/price_per_min, as
  // invoicing and aircraft-pricing do. Renaming them would be a breaking API change.
  return results.map((row) => ({
    registration: row.registration,
    price_per_min: Number(row.pricePerMin),
    valid_from: row.validFrom,
    valid_to: row.validTo,
  }))
}

/**
 * Get membership fees from SimplBooks items
 * Returns regular, junior, and supporting member fees
 */
export async function getMembershipFees(): Promise<PublicMembershipFee[]> {
  const membershipCodes = [
    ART_MEMBER_FEE_CODE,
    ART_JUNIOR_MEMBER_FEE_CODE,
    ART_SUPPORTING_MEMBER_FEE_CODE,
  ]

  const results = await db
    .selectFrom('accts.items')
    .select(['code', 'name', 'item'])
    .where('code', 'in', membershipCodes)
    .execute()

  const seasonalDiscountPercent = isAfterMembershipFeeDiscountDate()
    ? HALF_YEAR_DISCOUNT_PERCENT
    : undefined

  return results
    .filter((result) => result.item)
    .map((result) => {
      const rawItem = result.item as Record<string, unknown>
      return {
        code: result.code,
        name: result.name,
        price: Number(rawItem.markup_value ?? 0),
        description: (rawItem.contents as string) ?? null,
        seasonalDiscountPercent,
      }
    })
}

/**
 * Get equipment fee from SimplBooks items
 */
export async function getEquipmentFee(): Promise<PublicEquipmentFee | null> {
  const result = await db
    .selectFrom('accts.items')
    .select(['code', 'name', 'item'])
    .where('code', '=', ART_EQUIP_FEE_CODE)
    .executeTakeFirst()

  if (!result?.item) {
    return null
  }

  const rawItem = result.item as Record<string, unknown>
  return {
    code: result.code,
    name: result.name,
    price: Number(rawItem.markup_value ?? 0),
    description: (rawItem.contents as string) ?? null,
    seasonalDiscountPercent: isAfterEquipmentFeeDiscountDate()
      ? HALF_YEAR_DISCOUNT_PERCENT
      : undefined,
  }
}
