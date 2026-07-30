import { db } from './connection.ts'

// Hardcoded primary key for the row the flight log wizard's "close your flight plan"
// reminder looks up — an admin must keep a row with this exact label for the reminder
// to have a number to show.
export const FLIGHT_PLAN_CENTER_KEY = 'FLIGHT_PLAN_CENTER'

export interface UsefulPhoneNumber {
  label: string
  phoneNumber: string
  sortOrder: number
}

const mapRow = (row: {
  label: string
  phone_number: string
  sort_order: number
}): UsefulPhoneNumber => ({
  label: row.label,
  phoneNumber: row.phone_number,
  sortOrder: row.sort_order,
})

export async function getUsefulPhoneNumbers(): Promise<UsefulPhoneNumber[]> {
  const rows = await db
    .selectFrom('static.useful_phone_number')
    .selectAll()
    .orderBy('sort_order')
    .orderBy('label')
    .execute()
  return rows.map(mapRow)
}

export async function getFlightPlanCentrePhoneNumber(): Promise<UsefulPhoneNumber | undefined> {
  const row = await db
    .selectFrom('static.useful_phone_number')
    .selectAll()
    .where('label', '=', FLIGHT_PLAN_CENTER_KEY)
    .executeTakeFirst()
  return row ? mapRow(row) : undefined
}

export async function createUsefulPhoneNumber(
  label: string,
  phoneNumber: string,
  sortOrder: number,
): Promise<UsefulPhoneNumber> {
  const row = await db
    .insertInto('static.useful_phone_number')
    .values({ label, phone_number: phoneNumber, sort_order: sortOrder })
    .returningAll()
    .executeTakeFirstOrThrow()
  return mapRow(row)
}

export async function updateUsefulPhoneNumber(
  label: string,
  phoneNumber: string,
  sortOrder: number,
): Promise<UsefulPhoneNumber | undefined> {
  const row = await db
    .updateTable('static.useful_phone_number')
    .set({ phone_number: phoneNumber, sort_order: sortOrder })
    .where('label', '=', label)
    .returningAll()
    .executeTakeFirst()
  return row ? mapRow(row) : undefined
}

export async function deleteUsefulPhoneNumber(label: string): Promise<boolean> {
  const result = await db
    .deleteFrom('static.useful_phone_number')
    .where('label', '=', label)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows > BigInt(0)
}
