import { z } from 'zod'
import { AuditableSchema, LocalisedSchema, UpsertSchema } from '../../types/schema.ts'

// ── Category ──────────────────────────────────────────────────────────────────
export const CategorySchema = AuditableSchema.extend({
  categoryId: z.string().max(9),
  name: LocalisedSchema,
  description: LocalisedSchema.nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})
export type Category = z.infer<typeof CategorySchema>

export const CategoryUpsertSchema = UpsertSchema(CategorySchema).extend({
  categoryId: z.string().max(9).optional(),
})
export type CategoryUpsert = z.infer<typeof CategoryUpsertSchema>

// ── Product property option ───────────────────────────────────────────────────
export const PropertyOptionSchema = z.object({
  optionId: z.number().int(),
  propertyId: z.number().int(),
  value: LocalisedSchema,
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  stockQuantity: z.number().int().nonnegative().nullable().optional(),
})
export type PropertyOption = z.infer<typeof PropertyOptionSchema>

// ── Product property ──────────────────────────────────────────────────────────
export const ProductPropertySchema = z.object({
  propertyId: z.number().int(),
  productId: z.string().max(9),
  name: LocalisedSchema,
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  options: z.array(PropertyOptionSchema).optional(),
})
export type ProductProperty = z.infer<typeof ProductPropertySchema>

// ── Product ───────────────────────────────────────────────────────────────────
export const ProductTypeEnum = z.enum(['STANDARD', 'FLIGHT_HOURS_PACKAGE'])
export type ProductType = z.infer<typeof ProductTypeEnum>

export const ProductSchema = AuditableSchema.extend({
  productId: z.string().max(9),
  categoryId: z.string().max(9),
  simplbooksItemId: z.string().max(100).nullable().optional(),
  productType: ProductTypeEnum.default('STANDARD'),
  name: LocalisedSchema,
  description: LocalisedSchema.nullable().optional(),
  price: z.number().nonnegative(),
  vatPercent: z.number().nonnegative().default(24),
  stockQuantity: z.number().int().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
  maxOrderQuantity: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
  isPublished: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  hasOrders: z.boolean().default(false),
  properties: z.array(ProductPropertySchema).optional(),
})
export type Product = z.infer<typeof ProductSchema>

export const ProductUpsertSchema = ProductSchema.omit({
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  hasOrders: true,
  properties: true,
}).extend({
  productId: z.string().max(9).optional(),
})
export type ProductUpsert = z.infer<typeof ProductUpsertSchema>

// ── Property upsert payload ───────────────────────────────────────────────────
export const PropertyUpsertSchema = z.object({
  propertyId: z.number().int().optional(),
  name: LocalisedSchema,
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  options: z
    .array(
      z.object({
        optionId: z.number().int().optional(),
        value: LocalisedSchema,
        sortOrder: z.number().int().default(0),
        isActive: z.boolean().default(true),
        stockQuantity: z.number().int().nonnegative().nullable().optional(),
      }),
    )
    .default([]),
})
export type PropertyUpsert = z.infer<typeof PropertyUpsertSchema>

// ── Discount code ─────────────────────────────────────────────────────────────
export const DiscountCodeSchema = AuditableSchema.extend({
  codeId: z.number().int(),
  code: z.string().max(50),
  description: z.string().nullable().optional(),
  categoryIds: z.array(z.string().max(9)).default([]),
  discountType: z.enum(['percent', 'fixed']),
  discountValue: z.number().positive(),
  minOrderAmount: z.number().nonnegative().nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  usesCount: z.number().int().nonnegative().default(0),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
})
export type DiscountCode = z.infer<typeof DiscountCodeSchema>

export const DiscountCodeUpsertSchema = DiscountCodeSchema.omit({
  codeId: true,
  usesCount: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
})
export type DiscountCodeUpsert = z.infer<typeof DiscountCodeUpsertSchema>

// ── Cart item ─────────────────────────────────────────────────────────────────
export const CartItemSchema = z.object({
  cartItemId: z.number().int(),
  cartId: z.string().max(9),
  productId: z.string().max(9),
  quantity: z.number().int().positive(),
  selectedOptions: z.record(z.string(), z.number().int()).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  product: ProductSchema.optional(),
})
export type CartItem = z.infer<typeof CartItemSchema>

export const CartItemUpsertSchema = z.object({
  productId: z.string().max(9),
  quantity: z.number().int().positive(),
  selectedOptions: z.record(z.string(), z.number().int()).nullable().optional(),
})
export type CartItemUpsert = z.infer<typeof CartItemUpsertSchema>

// ── Cart ──────────────────────────────────────────────────────────────────────
export const CartSchema = z.object({
  cartId: z.string().max(9),
  memberId: z.string().max(9),
  discountCodeId: z.number().int().nullable().optional(),
  items: z.array(CartItemSchema).default([]),
  discountCode: DiscountCodeSchema.nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Cart = z.infer<typeof CartSchema>

// ── Order ─────────────────────────────────────────────────────────────────────
export const OrderStatusEnum = z.enum([
  'PENDING',
  'PROCESSING',
  'INVOICED',
  'INVOICE_PAID',
  'CANCELLED',
  'REFUNDED',
])
export type OrderStatus = z.infer<typeof OrderStatusEnum>

export const OrderItemSchema = z.object({
  orderItemId: z.number().int(),
  orderId: z.string().max(9),
  productId: z.string().max(9),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
  selectedOptions: z.record(z.string(), z.number().int()).nullable().optional(),
  productSnapshot: z.record(z.string(), z.unknown()),
})
export type OrderItem = z.infer<typeof OrderItemSchema>

export const OrderMemberSchema = z.object({
  memberId: z.string().max(9),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phoneNumber: z.string().nullable().optional(),
})
export type OrderMember = z.infer<typeof OrderMemberSchema>

export const OrderSchema = AuditableSchema.extend({
  orderId: z.string().max(9),
  memberId: z.string().max(9),
  status: OrderStatusEnum.default('PENDING'),
  totalAmount: z.number().nonnegative(),
  discountCodeId: z.number().int().nullable().optional(),
  discountAmount: z.number().nonnegative().nullable().optional(),
  invoiceId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  member: OrderMemberSchema.optional(),
  items: z.array(OrderItemSchema).optional(),
})
export type Order = z.infer<typeof OrderSchema>

export const OrderCreateSchema = z.object({
  discountCode: z.string().max(50).optional(),
  notes: z.string().optional(),
})
export type OrderCreate = z.infer<typeof OrderCreateSchema>

// ── Filter schemas ────────────────────────────────────────────────────────────
export const ProductFiltersSchema = z.object({
  categoryId: z.string().max(9).optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  published: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})
export type ProductFilters = z.infer<typeof ProductFiltersSchema>

export const OrderFiltersSchema = z.object({
  memberId: z.string().max(9).optional(),
  status: OrderStatusEnum.optional(),
  categoryId: z.string().max(9).optional(),
  dateRange: z.enum(['7d', '1m', '3m', '6m', '1y']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})
export type OrderFilters = z.infer<typeof OrderFiltersSchema>

export const OrderListResponseSchema = z.object({
  items: z.array(OrderSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  hasMore: z.boolean(),
})
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>
