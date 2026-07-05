import { db } from './connection.ts'

export interface CostCentre {
  code: string
  description: string
}

export async function getCostCentres(): Promise<CostCentre[]> {
  return db.selectFrom('accts.cost_centre').selectAll().orderBy('code').execute()
}

export async function createCostCentre(code: string, description: string): Promise<CostCentre> {
  return db
    .insertInto('accts.cost_centre')
    .values({ code, description })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function updateCostCentre(
  code: string,
  description: string,
): Promise<CostCentre | undefined> {
  return db
    .updateTable('accts.cost_centre')
    .set({ description })
    .where('code', '=', code)
    .returningAll()
    .executeTakeFirst()
}

export async function deleteCostCentre(code: string): Promise<boolean> {
  const result = await db
    .deleteFrom('accts.cost_centre')
    .where('code', '=', code)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows > BigInt(0)
}
