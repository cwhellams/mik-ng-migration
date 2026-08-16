import { db } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'

const FUEL_PRICES_ID = 1

export const getFuelPricesMarkdown = async (): Promise<string> => {
  const record = await db
    .selectFrom('fuelPricesContent')
    .select('markdown')
    .where('id', '=', FUEL_PRICES_ID)
    .executeTakeFirst()

  return record?.markdown ?? ''
}

export const setFuelPricesMarkdown = async (markdown: string, user: JWTUser): Promise<void> => {
  const now = new Date()
  const updateResult = await db
    .updateTable('fuelPricesContent')
    .set({
      markdown,
      updatedAt: now,
      updatedBy: user.memberId,
    })
    .where('id', '=', FUEL_PRICES_ID)
    .executeTakeFirst()

  // Migration V870__CreateFuelPricesContentAndPermissions.sql pre-populates
  // the singleton row, but keep this defensive fallback for environments
  // where data may have been manually removed.
  if (updateResult.numUpdatedRows === BigInt(0)) {
    await db
      .insertInto('fuelPricesContent')
      .values({
        id: FUEL_PRICES_ID,
        markdown,
        createdAt: now,
        updatedAt: now,
        createdBy: user.memberId,
        updatedBy: user.memberId,
      })
      .execute()
  }
}
