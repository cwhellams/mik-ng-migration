import 'dotenv/config'

import { afterEach, describe, expect, it } from '@jest/globals'

import { db } from '../../src/db/connection.ts'
import {
  createLocalFuelPrice,
  getEffectiveLocalFuelPrice,
} from '../../src/db/local-fuel-price-queries.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'

const user = { memberId: 'Juha1' } as JWTUser

describe('local-fuel-price-queries', () => {
  afterEach(async () => {
    await db.deleteFrom('accts.local_fuel_price').where('fuel_type', '=', 'JetA1').execute()
  })

  it('returns the most recent price effective on or before the given date', async () => {
    await createLocalFuelPrice(
      { fuelType: 'JetA1', priceEurPerLitre: 2.5, validFrom: '2026-01-01' },
      user,
    )
    await createLocalFuelPrice(
      { fuelType: 'JetA1', priceEurPerLitre: 3.0, validFrom: '2026-06-01' },
      user,
    )

    expect((await getEffectiveLocalFuelPrice('JetA1', '2026-05-31'))?.priceEurPerLitre).toBe(2.5)
    expect((await getEffectiveLocalFuelPrice('JetA1', '2026-06-01'))?.priceEurPerLitre).toBe(3.0)
    expect(await getEffectiveLocalFuelPrice('JetA1', '2025-12-31')).toBeUndefined()
  })

  // Two rows for the same (fuel_type, valid_from) would make "most recent valid_from <=
  // date" ambiguous, so the cap a claim is measured against would depend on row order.
  // (fuel_type, valid_from) is unique instead, and re-setting a date overwrites it.
  it('overwrites the existing price when the same effective date is set again', async () => {
    await createLocalFuelPrice(
      { fuelType: 'JetA1', priceEurPerLitre: 2.5, validFrom: '2026-01-01' },
      user,
    )
    const updated = await createLocalFuelPrice(
      { fuelType: 'JetA1', priceEurPerLitre: 2.75, validFrom: '2026-01-01' },
      user,
    )

    expect(updated.priceEurPerLitre).toBe(2.75)

    const rows = await db
      .selectFrom('accts.local_fuel_price')
      .selectAll()
      .where('fuel_type', '=', 'JetA1')
      .where('valid_from', '=', '2026-01-01')
      .execute()
    expect(rows).toHaveLength(1)
    expect((await getEffectiveLocalFuelPrice('JetA1', '2026-03-01'))?.priceEurPerLitre).toBe(2.75)
  })
})
