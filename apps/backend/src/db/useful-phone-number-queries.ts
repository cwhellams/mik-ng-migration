import { camelDb } from './connection.ts'

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
  phoneNumber: string
  sortOrder: number
}): UsefulPhoneNumber => ({
  label: row.label,
  phoneNumber: row.phoneNumber,
  sortOrder: row.sortOrder,
})

export async function getUsefulPhoneNumbers(): Promise<UsefulPhoneNumber[]> {
  const rows = await camelDb
    .selectFrom('static.usefulPhoneNumber')
    .selectAll()
    .orderBy('sortOrder')
    .orderBy('label')
    .execute()
  return rows.map(mapRow)
}

export async function getFlightPlanCentrePhoneNumber(): Promise<UsefulPhoneNumber | undefined> {
  const row = await camelDb
    .selectFrom('static.usefulPhoneNumber')
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
  const row = await camelDb
    .insertInto('static.usefulPhoneNumber')
    .values({ label, phoneNumber: phoneNumber, sortOrder: sortOrder })
    .returningAll()
    .executeTakeFirstOrThrow()
  return mapRow(row)
}

export async function updateUsefulPhoneNumber(
  label: string,
  phoneNumber: string,
  sortOrder: number,
): Promise<UsefulPhoneNumber | undefined> {
  const row = await camelDb
    .updateTable('static.usefulPhoneNumber')
    .set({ phoneNumber: phoneNumber, sortOrder: sortOrder })
    .where('label', '=', label)
    .returningAll()
    .executeTakeFirst()
  return row ? mapRow(row) : undefined
}

export async function deleteUsefulPhoneNumber(label: string): Promise<boolean> {
  const result = await camelDb
    .deleteFrom('static.usefulPhoneNumber')
    .where('label', '=', label)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows > BigInt(0)
}
