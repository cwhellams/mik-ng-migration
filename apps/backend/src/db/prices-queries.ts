import { db } from './connection.ts'
import type {
  PublicAircraftPricing,
  PublicMembershipFee,
  PublicEquipmentFee,
} from '../routes/prices/models.ts'
import {
  ART_EQUIP_FEE_CODE,
  ART_MEMBER_FEE_CODE,
  ART_JUNIOR_MEMBER_FEE_CODE,
  ART_SUPPORTING_MEMBER_FEE_CODE,
} from '../services/accounting/config.ts'

/**
 * Get current aircraft pricing (currently valid or most recent)
 * Returns only the current/active pricing for each aircraft
 */
export async function getCurrentAircraftPricing(): Promise<PublicAircraftPricing[]> {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  const results = await db
    .selectFrom('accts.aircraft_pricing')
    .select(['registration', 'price_per_min', 'valid_from', 'valid_to'])
    .where('valid_from', '<=', today)
    .where((eb: any) => eb.or([eb('valid_to', 'is', null), eb('valid_to', '>=', today)]))
    .orderBy('registration', 'asc')
    .execute()

  return results.map((row: any) => ({
    registration: row.registration,
    price_per_min: Number(row.price_per_min),
    valid_from: row.valid_from,
    valid_to: row.valid_to,
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

  return results
    .filter((result: any) => result.item)
    .map((result: any) => {
      const rawItem = result.item as Record<string, unknown>
      return {
        code: result.code,
        name: result.name,
        price: Number(rawItem.markup_value ?? 0),
        description: (rawItem.contents as string) ?? null,
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
  }
}
