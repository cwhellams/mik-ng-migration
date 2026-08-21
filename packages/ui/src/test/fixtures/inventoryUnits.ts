import { type ItemUnit, type ItemUnitListResponse } from '@mik/contracts/inventory-units'

import { auditFields } from './cast'

/**
 * Per-unit inventory fixtures (#1139), mirroring `sql/schema/testdata/V300`:
 * `INV_VEST` is a group of life vests with per-unit tags.
 *
 * These live in `@mik/ui` rather than in one app because both need them — the
 * member app's reservation editor picks a unit, and the admin app's inventory
 * page manages them. The reservation builders themselves stay in
 * `apps/frontend`, which is the only app that renders a reservation.
 */

export const LIFE_VEST_ITEM_ID = 'INV_VEST'

export const anItemUnit = (overrides: Partial<ItemUnit> = {}): ItemUnit => ({
  unitId: 'VEST1',
  itemId: LIFE_VEST_ITEM_ID,
  tag: 'LV-001',
  status: 'AVAILABLE',
  condition: 'GOOD',
  notes: null,
  isActive: true,

  ...auditFields(),
  ...overrides,
})

export const anItemUnitListResponse = (
  units: ItemUnit[] = [anItemUnit(), anItemUnit({ unitId: 'VEST2', tag: 'LV-002' })],
  inServiceCount = units.filter((unit) => unit.isActive).length,
): ItemUnitListResponse => ({ units, inServiceCount })
