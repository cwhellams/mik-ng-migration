import { camelDb } from './connection.ts'

export interface CostCentre {
  code: string
  description: string
}

export async function getCostCentres(): Promise<CostCentre[]> {
  return camelDb.selectFrom('accts.costCentre').selectAll().orderBy('code').execute()
}

export async function createCostCentre(code: string, description: string): Promise<CostCentre> {
  return camelDb
    .insertInto('accts.costCentre')
    .values({ code, description })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function updateCostCentre(
  code: string,
  description: string,
): Promise<CostCentre | undefined> {
  return camelDb
    .updateTable('accts.costCentre')
    .set({ description })
    .where('code', '=', code)
    .returningAll()
    .executeTakeFirst()
}

export async function deleteCostCentre(code: string): Promise<boolean> {
  const result = await camelDb
    .deleteFrom('accts.costCentre')
    .where('code', '=', code)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows > BigInt(0)
}
