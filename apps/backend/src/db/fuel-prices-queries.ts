import { db } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'

const FUEL_PRICES_ID = 1

export const getFuelPricesMarkdown = async (): Promise<string> => {
  const record = await db
    .selectFrom('fuel_prices_content')
    .select('markdown')
    .where('id', '=', FUEL_PRICES_ID)
    .executeTakeFirst()

  return record?.markdown ?? ''
}

export const setFuelPricesMarkdown = async (markdown: string, user: JWTUser): Promise<void> => {
  const now = new Date()
  const updateResult = await db
    .updateTable('fuel_prices_content')
    .set({
      markdown,
      updated_at: now,
      updated_by: user.memberId,
    })
    .where('id', '=', FUEL_PRICES_ID)
    .executeTakeFirst()

  // Migration V870__CreateFuelPricesContentAndPermissions.sql pre-populates
  // the singleton row, but keep this defensive fallback for environments
  // where data may have been manually removed.
  if (updateResult.numUpdatedRows === BigInt(0)) {
    await db
      .insertInto('fuel_prices_content')
      .values({
        id: FUEL_PRICES_ID,
        markdown,
        created_at: now,
        updated_at: now,
        created_by: user.memberId,
        updated_by: user.memberId,
      })
      .execute()
  }
}
