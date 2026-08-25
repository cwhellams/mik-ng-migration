import { z } from 'zod'
import { AuditableSchema, LocalisedSchema, nullableTrimmedString, UpsertSchema } from './schema.ts'

// Upper bound for stock quantities / thresholds / deltas. Keeps values well
// inside PostgreSQL's 32-bit INTEGER range so an oversized input is rejected as
// a 400 at validation time rather than blowing up as a DB range error (500).
const MAX_QUANTITY = 1_000_000
const MAX_SORT_ORDER = 100_000

// ── Location ──────────────────────────────────────────────────────────────────
export const InventoryLocationSchema = AuditableSchema.extend({
  locationId: z.string().max(9),
  name: LocalisedSchema,
  description: LocalisedSchema.nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(MAX_SORT_ORDER).default(0),
})
export type InventoryLocation = z.infer<typeof InventoryLocationSchema>

export const InventoryLocationUpsertSchema = UpsertSchema(InventoryLocationSchema).extend({
  locationId: z.string().max(9).optional(),
})
export type InventoryLocationUpsert = z.infer<typeof InventoryLocationUpsertSchema>

// ── Category ──────────────────────────────────────────────────────────────────
export const InventoryCategorySchema = AuditableSchema.extend({
  categoryId: z.string().max(9),
  name: LocalisedSchema,
  description: LocalisedSchema.nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(MAX_SORT_ORDER).default(0),
})
export type InventoryCategory = z.infer<typeof InventoryCategorySchema>

export const InventoryCategoryUpsertSchema = UpsertSchema(InventoryCategorySchema).extend({
  categoryId: z.string().max(9).optional(),
})
export type InventoryCategoryUpsert = z.infer<typeof InventoryCategoryUpsertSchema>

// ── Item ──────────────────────────────────────────────────────────────────────
export const ItemTypeEnum = z.enum(['ASSET', 'CONSUMABLE'])
export type ItemType = z.infer<typeof ItemTypeEnum>

export const ItemConditionEnum = z.enum(['GOOD', 'FAIR', 'POOR', 'UNKNOWN'])
export type ItemCondition = z.infer<typeof ItemConditionEnum>

export const InventoryItemSchema = AuditableSchema.extend({
  itemId: z.string().max(9),
  categoryId: z.string().max(9),
  locationId: z.string().max(9).nullable().optional(),
  itemType: ItemTypeEnum.default('CONSUMABLE'),
  name: LocalisedSchema,
  description: LocalisedSchema.nullable().optional(),
  quantity: z.number().int().nonnegative().max(MAX_QUANTITY).default(0),
  lowStockThreshold: z.number().int().nonnegative().max(MAX_QUANTITY).nullable().optional(),
  condition: ItemConditionEnum.default('UNKNOWN'),
  serialNumber: nullableTrimmedString(z.string().max(100)).optional(),
  imageUrl: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), { message: 'Image URL must use http(s)' })
    .nullable()
    .optional(),
  notes: nullableTrimmedString(z.string().max(2000)).optional(),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  // Whether the item appears in the item reservation calendar (#1139). Opt-in,
  // so a consumable tracked by quantity alone stays out of the item picker.
  isReservable: z.boolean().default(false),
  category: InventoryCategorySchema.optional(),
  location: InventoryLocationSchema.nullable().optional(),
})
export type InventoryItem = z.infer<typeof InventoryItemSchema>

export const InventoryItemUpsertSchema = InventoryItemSchema.omit({
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  category: true,
  location: true,
}).extend({
  itemId: z.string().max(9).optional(),
})
export type InventoryItemUpsert = z.infer<typeof InventoryItemUpsertSchema>

// ── Filters ───────────────────────────────────────────────────────────────────
export const InventoryFiltersSchema = z.object({
  categoryId: z.string().max(9).optional(),
  locationId: z.string().max(9).optional(),
  itemType: ItemTypeEnum.optional(),
  search: z.string().optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  // Narrows the list to items that can be reserved, which is what the item
  // reservation calendar's picker wants.
  reservableOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})
export type InventoryFilters = z.infer<typeof InventoryFiltersSchema>

// ── Audit log ─────────────────────────────────────────────────────────────────
export const InventoryAuditLogEntrySchema = z.object({
  logId: z.number().int(),
  itemId: z.string().max(9),
  memberId: z.string().max(9),
  changeType: z.string(),
  oldValue: z.record(z.string(), z.unknown()).nullable().optional(),
  newValue: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: nullableTrimmedString(z.string().max(2000)).optional(),
  createdAt: z.string().datetime(),
})
export type InventoryAuditLogEntry = z.infer<typeof InventoryAuditLogEntrySchema>

// ── Quantity adjustment ───────────────────────────────────────────────────────
export const QuantityAdjustmentSchema = z.object({
  delta: z.number().int().min(-MAX_QUANTITY).max(MAX_QUANTITY),
  notes: nullableTrimmedString(z.string().max(2000)).optional(),
})
export type QuantityAdjustment = z.infer<typeof QuantityAdjustmentSchema>
