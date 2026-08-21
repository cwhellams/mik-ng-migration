import { db } from '../../src/db/connection.ts'
import { getAuditLog } from '../../src/db/inventory-queries.ts'
import * as units from '../../src/db/item-unit-queries.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'

/**
 * The physical units of an inventory item (#1139).
 *
 * The behaviour worth pinning down is the audit trail: a unit going into
 * maintenance changes what the club can promise, so every move has to leave a
 * row in the *item's* history — the same log an admin already reads for stock
 * changes — rather than in a second place nobody thinks to look.
 */

const jwt: JWTUser = {
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: true,
}

const createdUnits: string[] = []

const createUnit = async (overrides: Partial<Parameters<typeof units.upsertUnit>[0]> = {}) => {
  const unit = await units.upsertUnit({ itemId: 'INV_O2', ...overrides }, jwt)
  createdUnits.push(unit.unitId)
  return unit
}

afterEach(async () => {
  if (createdUnits.length === 0) return
  await db.deleteFrom('inventory.itemUnits').where('unitId', 'in', createdUnits.splice(0)).execute()
})

describe('getUnitsByItemId', () => {
  it('returns every unit of an item, retired ones included, by default', async () => {
    const all = await units.getUnitsByItemId('INV_VEST')
    expect(all.map((u) => u.unitId)).toEqual(expect.arrayContaining(['VEST1', 'VEST5', 'VEST6']))
  })

  it('hides retired units when asked for the active set only', async () => {
    const active = await units.getUnitsByItemId('INV_VEST', false)
    // VEST6 is is_active = false; VEST5 is inactive-for-capacity but still a
    // real unit an admin can bring back, so it stays.
    expect(active.map((u) => u.unitId)).not.toContain('VEST6')
    expect(active.map((u) => u.unitId)).toContain('VEST5')
  })

  it('is empty for an item with no units', async () => {
    await expect(units.getUnitsByItemId('INV_PAPER')).resolves.toEqual([])
  })
})

describe('getUnitById', () => {
  it('maps a unit onto the contract shape', async () => {
    const unit = await units.getUnitById('VEST5')

    expect(unit).toEqual({
      unitId: 'VEST5',
      itemId: 'INV_VEST',
      tag: 'LV-005',
      status: 'MAINTENANCE',
      condition: 'POOR',
      notes: 'Whistle missing',
      isActive: true,
      createdAt: expect.any(String),
      createdBy: 'k1mnimda',
      updatedAt: expect.any(String),
      updatedBy: 'k1mnimda',
    })
  })

  it('returns undefined for an unknown unit', async () => {
    await expect(units.getUnitById('nope')).resolves.toBeUndefined()
  })
})

describe('upsertUnit', () => {
  it('creates a unit that starts AVAILABLE and logs the creation against the item', async () => {
    const unit = await createUnit({ tag: 'OX-TEST', condition: 'GOOD' })

    expect(unit).toMatchObject({
      itemId: 'INV_O2',
      tag: 'OX-TEST',
      status: 'AVAILABLE',
      condition: 'GOOD',
      isActive: true,
    })

    const log = await getAuditLog('INV_O2')
    expect(log[0]).toMatchObject({
      changeType: 'UNIT_CREATED',
      newValue: { unitId: unit.unitId, tag: 'OX-TEST' },
    })
  })

  it('patches only the fields it was given, and records the before/after', async () => {
    const unit = await createUnit({ tag: 'OX-TEST', condition: 'GOOD' })

    const updated = await units.upsertUnit(
      { unitId: unit.unitId, itemId: 'INV_O2', condition: 'POOR' },
      jwt,
    )

    expect(updated).toMatchObject({ tag: 'OX-TEST', condition: 'POOR' })

    const log = await getAuditLog('INV_O2')
    expect(log[0]).toMatchObject({
      changeType: 'UNIT_UPDATED',
      oldValue: { condition: 'GOOD' },
      newValue: { unitId: unit.unitId, condition: 'POOR' },
    })
  })

  it('cannot change a unit’s status, even when one is passed', async () => {
    const unit = await createUnit({ tag: 'OX-TEST' })

    await units.upsertUnit(
      // A caller reaching for `status` here is exactly what the omission in
      // ItemUnitUpsertSchema is for; the cast is how the test gets past it.
      { unitId: unit.unitId, itemId: 'INV_O2', status: 'LOST' } as Parameters<
        typeof units.upsertUnit
      >[0],
      jwt,
    )

    await expect(units.getUnitById(unit.unitId)).resolves.toMatchObject({ status: 'AVAILABLE' })
  })

  it('refuses a second unit of the same item with the same tag', async () => {
    await createUnit({ tag: 'OX-DUP' })
    await expect(createUnit({ tag: 'OX-DUP' })).rejects.toThrow(/uq_item_units_tag/)
  })

  it('allows several untagged units of one item', async () => {
    await createUnit()
    const second = await createUnit()
    expect(second.tag).toBeNull()
  })

  it('throws rather than inventing a row when the unit to patch is gone', async () => {
    await expect(
      units.upsertUnit({ unitId: 'nope', itemId: 'INV_O2', condition: 'GOOD' }, jwt),
    ).rejects.toThrow('Unit not found')
  })
})

describe('transitionUnitStatus', () => {
  it('moves the unit and records where it came from', async () => {
    const unit = await createUnit({ tag: 'OX-TEST' })

    const moved = await units.transitionUnitStatus(unit.unitId, 'MAINTENANCE', 'Valve leaking', jwt)

    expect(moved).toMatchObject({ status: 'MAINTENANCE' })

    const log = await getAuditLog('INV_O2')
    expect(log[0]).toMatchObject({
      changeType: 'UNIT_STATUS_CHANGE',
      oldValue: { unitId: unit.unitId, status: 'AVAILABLE' },
      newValue: { unitId: unit.unitId, status: 'MAINTENANCE' },
      notes: 'Valve leaking',
    })
  })

  it('takes the unit out of the capacity pool when it leaves service', async () => {
    const unit = await createUnit({ tag: 'OX-TEST' })
    await expect(units.getInServiceUnitCount('INV_O2')).resolves.toBe(3)

    await units.transitionUnitStatus(unit.unitId, 'LOST', null, jwt)

    await expect(units.getInServiceUnitCount('INV_O2')).resolves.toBe(2)
  })

  it('keeps a unit in the pool while it is merely reserved or on loan', async () => {
    const unit = await createUnit({ tag: 'OX-TEST' })

    await units.transitionUnitStatus(unit.unitId, 'ON_LOAN', null, jwt)

    // Signed out today, still reservable for next week.
    await expect(units.getInServiceUnitCount('INV_O2')).resolves.toBe(3)
  })

  it('returns undefined for an unknown unit, without writing a log entry', async () => {
    const before = await getAuditLog('INV_O2')

    await expect(units.transitionUnitStatus('nope', 'LOST', null, jwt)).resolves.toBeUndefined()

    await expect(getAuditLog('INV_O2')).resolves.toHaveLength(before.length)
  })

  it('joins an outer transaction when given one, so a failure rolls the move back', async () => {
    const unit = await createUnit({ tag: 'OX-TEST' })

    await expect(
      db.transaction().execute(async (txn) => {
        await units.transitionUnitStatus(unit.unitId, 'LOST', null, jwt, txn)
        throw new Error('caller changed its mind')
      }),
    ).rejects.toThrow('caller changed its mind')

    await expect(units.getUnitById(unit.unitId)).resolves.toMatchObject({ status: 'AVAILABLE' })
  })
})
