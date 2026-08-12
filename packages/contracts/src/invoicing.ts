import { z } from 'zod'
import { AuditableSchema } from './schema.ts'

// The invoice type is part of the wire contract, not a SimplBooks detail:
// it is stored on accts.invoice and returned by every invoicing endpoint.
export enum MIKInvoiceType {
  JOINING_FEE = 'JOINING_FEE',
  ANNUAL_FEE = 'ANNUAL_FEE',
  EQUIPMENT_FEE = 'EQUIPMENT_FEE',
  FLIGHT = 'FLIGHT',
  INSTRUCTION = 'INSTRUCTION',
  MISC = 'MISC',
  CREDIT_NOTE = 'CREDIT_NOTE',
  SHOP_ORDER = 'SHOP_ORDER',
}

// Create a Zod enum from the TypeScript enum
export const InvoiceTypeEnum = z.nativeEnum(MIKInvoiceType)

export const InvoiceItemQuerySchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  status: z.enum(['paid', 'unpaid']).optional(),
  type: z
    .string()
    .optional()
    .transform((val) => val?.toUpperCase())
    .pipe(InvoiceTypeEnum)
    .optional(),
  pastDue: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  id: z.coerce.number().int().optional(),
  memberId: z.string().optional(),
  scope: z.enum(['personal', 'all']).optional(),
})

export type InvoiceItemQueryParams = z.infer<typeof InvoiceItemQuerySchema>

export const ItemSchema = z.object({
  id: z.number(),
  code: z.string(),
  ean: z.string(),
  name: z.string(),
  expense_claim_item: z.boolean().optional().default(false),
  is_fuel_item: z.boolean().optional().default(false),
  is_km_item: z.boolean().optional().default(false),
  is_other_item: z.boolean().optional().default(false),
  contents: z.string(),
  unit: z.string(),
  amount: z.number(),
  price_per_unit: z.number(),
  sum_with_vat: z.number(),
  markup_value: z.number(),
  markup_type: z.enum(['percent', 'fixed', 'none']).default('none'),
  is_inventory: z.boolean(),
  active: z.boolean(),
  sales_vat_type_id: z.number(),
  purchase_vat_type_id: z.number(),
  income_account_id: z.number(),
  income_account: z.string(),
  expense_account_id: z.number(),
  expense_account: z.string(),
})

export type Item = z.infer<typeof ItemSchema>

export const UpdateExpenseClaimItemSchema = z.object({
  expenseClaimItem: z.boolean(),
})

export const UpdateIsFuelItemSchema = z.object({
  isFuelItem: z.boolean(),
})

export const UpdateIsKmItemSchema = z.object({
  isKmItem: z.boolean(),
})

export const UpdateIsOtherItemSchema = z.object({
  isOtherItem: z.boolean(),
})

export const ItemListResponseSchema = z.object({
  items: z.array(ItemSchema),
})

export type ItemListResponse = z.infer<typeof ItemListResponseSchema>

export const InvoiceSchema = z.object({
  id: z.string(), // Int8 from PG as string
  created_at: z.string().datetime(),
  created_by: z.string(),
  currency: z.string().nullable(), // nullable Generated<string | null>
  description: z.string().nullable(),
  due_at: z.string().date(), // 'YYYY-MM-DD' format from PG DATE
  invoice_type: InvoiceTypeEnum,
  is_paid: z.boolean().nullable(), // Generated<boolean | null>
  member_id: z.string(),
  paid_at: z.string().datetime().nullable(),
  pmt_ref: z.string(),
  sent_at: z.string().date().nullable(), // 'YYYY-MM-DD' format, nullable
  total_sum: z.string().nullable(), // PG numeric (returned as string)
  updated_at: z.string().datetime(),
  updated_by: z.string(),
})

export type Invoice = z.infer<typeof InvoiceSchema>

export const InvoiceListResponseSchema = z.object({
  invoices: z.array(InvoiceSchema),
})

export type InvoiceListResponse = z.infer<typeof InvoiceListResponseSchema>

export const RecurringFeesProcessingSchema = AuditableSchema.extend({
  fee_type: z.enum(['annual_fee', 'equipment_fee']),
  status: z.enum(['inProgress', 'processed']),
  year: z.number(),
})

export type RecurringFeesProcessing = z.infer<typeof RecurringFeesProcessingSchema>

export const AnnualBillingResponseSchema = z.object({
  year: z.number(),
  membersProcessed: z.number(),
  status: z.string(),
})

export type AnnualBillingResponse = z.infer<typeof AnnualBillingResponseSchema>

export const EquipmentFeeStatusSchema = z.object({
  year: z.number(),
  hasPaid: z.boolean(),
})

export type EquipmentFeeStatus = z.infer<typeof EquipmentFeeStatusSchema>

export const EquipmentFeeSchema = z.object({
  code: z.string(),
  unit: z.string(),
  markup_value: z.number(),
  discount_amount: z.number(),
  seasonal_discount_percent: z.number().optional(),
})

export type EquipmentFee = z.infer<typeof EquipmentFeeSchema>

export const ArticleFeeSchema = z.object({
  id: z.number(),
  code: z.string(),
  unit: z.string().optional(),
  name: z.string(),
  contents: z.string().optional().nullable(),
  markup_value: z.number().optional(),
  markup_type: z.enum(['percent', 'fixed', 'none']).optional(),
  price_per_unit: z.number().optional(),
  amount: z.number().optional().nullable(),
})

export type ArticleFee = z.infer<typeof ArticleFeeSchema>

export const UnpaidOverdueInvoiceSchema = InvoiceSchema.extend({
  member_first_name: z.string(),
  member_last_name: z.string(),
  days_overdue: z.number().int(),
})

export type UnpaidOverdueInvoice = z.infer<typeof UnpaidOverdueInvoiceSchema>

export const UnpaidOverdueInvoiceListResponseSchema = z.object({
  invoices: z.array(UnpaidOverdueInvoiceSchema),
  total_sum: z.string().nullable(),
})

export type UnpaidOverdueInvoiceListResponse = z.infer<
  typeof UnpaidOverdueInvoiceListResponseSchema
>
