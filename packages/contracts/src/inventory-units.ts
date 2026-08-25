import { z } from 'zod'
import { ItemConditionEnum } from './inventory.ts'
import { AuditableSchema, nullableTrimmedString } from './schema.ts'

/**
 * The physical units of an inventory item (#1139).
 *
 * An `inventory.items` row is a group — "Life Vest", eight of them. A unit is
 * one of the eight, so a reservation can name it and capacity can be counted.
 * Items that only ever exist as one thing (a single tow bar) need no unit rows
 * until someone wants to reserve one.
 */

export const ItemUnitStatusEnum = z.enum([
  'AVAILABLE',
  'RESERVED',
  'ON_LOAN',
  'MAINTENANCE',
  'LOST',
  'RETIRED',
])
export type ItemUnitStatus = z.infer<typeof ItemUnitStatusEnum>

/**
 * The statuses that keep a unit in the reservable pool.
 *
 * RESERVED and ON_LOAN are in service — a vest signed out today is still
 * reservable for next week. The three left out have left the pool, and a
 * reservation resting on one would be a promise the club cannot keep. Mirrors
 * `inventory.in_service_unit_count()` in the database (V2030), which is the
 * authority; this copy is for the UI's "3 of 5 free" cue.
 */
export const IN_SERVICE_UNIT_STATUSES: readonly ItemUnitStatus[] = [
  'AVAILABLE',
  'RESERVED',
  'ON_LOAN',
]

export const isInServiceUnitStatus = (status: ItemUnitStatus): boolean =>
  IN_SERVICE_UNIT_STATUSES.includes(status)

export const ItemUnitSchema = AuditableSchema.extend({
  unitId: z.string().max(9),
  itemId: z.string().max(9),
  /** Serial or asset tag, unique within the item. Optional — untagged units are fine. */
  tag: nullableTrimmedString(z.string().max(100)).optional(),
  status: ItemUnitStatusEnum.default('AVAILABLE'),
  condition: ItemConditionEnum.default('UNKNOWN'),
  notes: nullableTrimmedString(z.string().max(2000)).optional(),
  isActive: z.boolean().default(true),
})
export type ItemUnit = z.infer<typeof ItemUnitSchema>

/**
 * `status` is deliberately absent: like `inventory.items.quantity`, it only
 * moves through the dedicated transition endpoint, so every change to whether a
 * unit is in service leaves an audit-log row behind. Everything omitted here in
 * one `.omit()` call rather than chaining off `UpsertSchema` — see the note on
 * `UpsertSchema` in schema.ts.
 */
export const ItemUnitUpsertSchema = ItemUnitSchema.omit({
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  status: true,
}).extend({
  unitId: z.string().max(9).optional(),
})
export type ItemUnitUpsert = z.infer<typeof ItemUnitUpsertSchema>

export const ItemUnitStatusTransitionSchema = z.object({
  status: ItemUnitStatusEnum,
  notes: nullableTrimmedString(z.string().max(2000)).optional(),
})
export type ItemUnitStatusTransition = z.infer<typeof ItemUnitStatusTransitionSchema>

export const ItemUnitListResponseSchema = z.object({
  units: z.array(ItemUnitSchema),
  /** How many of them count towards reservation capacity right now. */
  inServiceCount: z.number().int().nonnegative(),
})
export type ItemUnitListResponse = z.infer<typeof ItemUnitListResponseSchema>
