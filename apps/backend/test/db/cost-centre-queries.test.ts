import 'dotenv/config'

import { afterAll, describe, expect, it } from '@jest/globals'

import { db } from '../../src/db/connection.ts'
import {
  createCostCentre,
  deleteCostCentre,
  getCostCentres,
  updateCostCentre,
} from '../../src/db/cost-centre-queries.ts'

describe('cost-centre-queries', () => {
  const code = `UT_CC_${Date.now()}`

  afterAll(async () => {
    await db.deleteFrom('accts.cost_centre').where('code', '=', code).execute()
  })

  it('creates, reads, updates and deletes a cost centre', async () => {
    const created = await createCostCentre(code, 'Test cost centre')
    expect(created.code).toBe(code)
    expect(created.description).toBe('Test cost centre')

    const list = await getCostCentres()
    expect(list.some((row) => row.code === code && row.description === 'Test cost centre')).toBe(
      true,
    )

    const updated = await updateCostCentre(code, 'Updated test cost centre')
    expect(updated).toBeDefined()
    expect(updated?.description).toBe('Updated test cost centre')

    const deleted = await deleteCostCentre(code)
    expect(deleted).toBe(true)

    const afterDelete = await getCostCentres()
    expect(afterDelete.some((row) => row.code === code)).toBe(false)
  })

  it('returns false when deleting a non-existing code', async () => {
    const deleted = await deleteCostCentre(`${code}_MISSING`)
    expect(deleted).toBe(false)
  })
})
