import { z } from 'zod'

export const InvoiceTypeEnum = z.enum([
  'ANNUAL_FEE',
  'EQUIPMENT_FEE',
  'FLIGHT',
  'INSTRUCTION',
  'MISC',
])

export const InvoiceItemQuerySchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  status: z.enum(['paid', 'unpaid']).optional(),
  type: z
    .string()
    .optional()
    .transform(val => val?.toUpperCase())
    .pipe(InvoiceTypeEnum)
    .optional(),
  pastDue: z
    .enum(['true', 'false'])
    .transform(val => val === 'true')
    .optional(),
  id: z.number().int().optional(),
})

export type InvoiceItemQueryParams = z.infer<typeof InvoiceItemQuerySchema>

export const ItemSchema = z.object({
  id: z.number(),
  code: z.string(),
  ean: z.string(),
  name: z.string(),
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
  sent_at: z.string().date(),
  total_sum: z.string().nullable(), // PG numeric (returned as string)
  updated_at: z.string().datetime(),
  updated_by: z.string(),
})

export type Invoice = z.infer<typeof InvoiceSchema>

export const InvoiceListResponseSchema = z.object({
  invoices: z.array(InvoiceSchema),
})

export type InvoiceListResponse = z.infer<typeof InvoiceListResponseSchema>
