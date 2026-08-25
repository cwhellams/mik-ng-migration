import {
  isInServiceUnitStatus,
  type ItemUnit,
  type ItemUnitListResponse,
} from '@mik/contracts/inventory-units'

import { auditFields } from './cast'

/**
 * Per-unit inventory fixtures (#1139), mirroring `sql/schema/testdata/V340`:
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

/**
 * The default `inServiceCount` is derived the way the endpoint derives it —
 * `inventory.in_service_unit_count()`, i.e. active *and* in an in-service status
 * — so a fixture cannot hand the editor a maintenance unit and a denominator
 * that counts it.
 */
export const anItemUnitListResponse = (
  units: ItemUnit[] = [anItemUnit(), anItemUnit({ unitId: 'VEST2', tag: 'LV-002' })],
  inServiceCount = units.filter((unit) => unit.isActive && isInServiceUnitStatus(unit.status))
    .length,
): ItemUnitListResponse => ({ units, inServiceCount })
