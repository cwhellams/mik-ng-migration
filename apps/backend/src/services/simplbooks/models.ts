import { z } from 'zod'

import { MIKLang, type Member } from '../../routes/members/models.ts'
import { AuditableSchema } from '../../types/schema.ts'

// Regex pattern for dd-mm-yyyy
const datePattern = /^\d{2}-\d{2}-\d{4}$/ // Matches dates in the format dd-mm-yyyy
// Regex pattern for yyyy-mm-dd
//const datePatternISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // Matches dates in the format yyyy-mm-dd

export enum SimplbooksEventType {
  ADD_MEMBER = 'addMember',
  ANNUAL_MEMBERSHIP_FEE = 'membershipFee',
  NEW_MEMBER_FEES = 'newMemberFees',
  EQUIPMENT_INVOICE = 'equipmentInvoice',
  FLIGHT_INVOICE = 'flightInvoice',
  SHOP_ORDER_INVOICE = 'shopOrderInvoice',
  REIMBURSEMENT = 'reimbursement',
  SEND_INVOICE_PDF = 'sendInvoicePdf',
  CREDIT_NOTE = 'creditNote',
}

export enum SimplbooksStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

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

export enum RecurringFeeType {
  ANNUAL_FEE = 'annual_fee',
  EQUIPMENT_FEE = 'equipment_fee',
}

export enum FeeProcessingStatus {
  IN_PROGRESS = 'inProgress',
  PROCESSED = 'processed',
}

export const clientSchema = z.object({
  Client: z.object({
    name: z.string(),
    address_street: z.string(),
    address_city: z.string(),
    address_postal_code: z.string(),
    address_county: z.string().optional(),
    address_country: z.string().optional(),
    e_mail: z.string().email(),
    phone: z.string(),
    account_no: z.string().optional(),
    client_settings_language: z.string().optional(),
  }),
})

export type ClientData = z.infer<typeof clientSchema>

/**
 * Maps a MIK language code to the SimplBooks client_settings_language locale string.
 * English → en_GB, Finnish → fi_FI, Swedish → sv_FI
 */
export function mapMIKLangToSimplbooksLanguage(lang: MIKLang | string): string {
  switch (lang) {
    case MIKLang.EN:
      return 'en_GB'
    case MIKLang.FI:
      return 'fi_FI'
    case MIKLang.SV:
      return 'sv_SE'
    default:
      return 'fi_FI'
  }
}

export const clientFilterSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    address_street: z.string(),
    address_city: z.string(),
    address_postal_code: z.string(),
    address_county: z.string(),
    address_country: z.string(),
    e_mail: z.string().email(),
    phone: z.string(),
  })
  .partial()
  .strict()

export type ClientFilter = z.infer<typeof clientFilterSchema>

export const clientListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  e_mail: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address_street: z.string().nullable().optional(),
  address_city: z.string().nullable().optional(),
  address_postal_code: z.string().nullable().optional(),
  address_country: z.string().nullable().optional(),
})

export const clientListDataItemSchema = z.object({
  Client: clientListItemSchema,
})

export const clientListResponseSchema = z.object({
  data: z.array(clientListDataItemSchema).optional().default([]),
})

export type ClientListItem = z.infer<typeof clientListItemSchema>
export type ClientListResponse = z.infer<typeof clientListResponseSchema>

export const invoiceFilterSchema = z
  .object({
    id: z.number().int(),
    client_id: z.number().int(),
    invoice_number: z.string(),
    client_name: z.string(),
    created_from: z.string().regex(datePattern, 'Invalid date format. Expected dd-mm-yyyy.'),
    created_until: z.string().regex(datePattern, 'Invalid date format. Expected dd-mm-yyyy.'),
    page: z.number().int(),
    per_page: z.number().int(),
  })
  .partial()
  .strict()

export type InvoiceFilter = z.infer<typeof invoiceFilterSchema>

export function mapMemberToClient(member: Member, ibanOverride?: string | null): ClientData {
  const iban = ibanOverride ?? member.iban ?? undefined
  return {
    Client: {
      name: `${member.firstName} ${member.lastName}`,
      address_street: member.streetAddress ?? '',
      address_city: member.townCity ?? '',
      address_postal_code: member.postcode ?? '',
      address_country: 'FI',
      e_mail: member.email,
      phone: member.phoneNumber ?? '',
      ...(iban ? { account_no: iban } : {}),
      client_settings_language: mapMIKLangToSimplbooksLanguage(member.lang),
    },
  }
}

const ProjectSchema = z.object({
  code: z.string(), // Cost centre code
})

const TaskSchema = z
  .object({
    id: z.number(),
    warehouse_id: z.number(),
    article_id: z.number(),
    code: z.string(),
    name: z.string(),
    contents: z.string(),
    unit: z.string(),
    amount: z.number(),
    price_per_unit: z.number(),
    worker: z.string(),
    vat: z.number(),
    vat_type_id: z.number(),
    discount: z.number(),
    income_account_id: z.number(),
    total_sum: z.number().optional(),
    Projects: z.array(ProjectSchema).optional(),
  })
  .partial()

export const InvoiceSchema = z
  .object({
    id: z.number(),
    client_id: z.number(),
    client_name: z.string(),
    client_reg_no: z.string(),
    client_vat_no: z.string(),
    client_address_street: z.string(),
    client_address_city: z.string(),
    client_address_postal_code: z.number(),
    client_address_county: z.string(),
    client_address_country: z.string(),
    contact_reference: z.string(),
    client_location_id: z.number(),
    created: z.string().date(),
    transaction_date: z.string(),
    due: z.string(),
    number: z.string(),
    reference: z.number(),
    sum: z.number(),
    vat: z.number(),
    rounding: z.number(),
    total_sum: z.number(),
    row_sum_with_vat: z.boolean(),
    currency_name: z.string(),
    currency_rate: z.number(),
    overdue_charge_percent: z.number(),
    overdue_charge_period: z.string(),
    assembler_name: z.string(),
    sent: z.string(),
    paid: z.string(),
    remnant: z.number(),
    additional_info: z.string(),
    credit_invoice_for: z.number(),
    proforma: z.boolean(),
    proforma_percent: z.number(),
    language: z.string(),
    document_template_id: z.number(),
    period_start: z.string(),
    period_end: z.string(),
  })
  .partial()

export const InvoiceResponseSchema = z.object({
  status: z.number(),
  duration: z.number(),
  data: z.object({
    Invoice: InvoiceSchema,
    Task: z.array(TaskSchema),
  }),
})

export const TasksSchema = z.object({
  Task: TaskSchema,
  Projects: z.array(ProjectSchema),
})

export type InvoiceResponse = z.infer<typeof InvoiceResponseSchema>
export type InvoiceBase = z.infer<typeof InvoiceSchema>

export const InvoicePostRootSchema = z.object({
  Invoice: InvoiceSchema,
  Tasks: z.array(TasksSchema),
})
export const InvoiceRootSchema = z.object({
  Invoice: InvoiceSchema,
  Tasks: z.array(TaskSchema),
})

export type Invoice = z.infer<typeof InvoiceRootSchema>
export type InvoicePost = z.infer<typeof InvoicePostRootSchema>
export type InvoicePostPayload = z.infer<typeof InvoiceSchema>

export const AcctsOutboxSimplbooksSchema = z.object({
  created_at_utc: z.union([z.string().datetime(), z.date()]).optional(),
  error_message: z.string().optional().nullable(),
  event_type: z.string(),
  id: z.string(),
  payload: z.unknown(), // Can be improved if Json shape is known
  processed_at: z.union([z.string().datetime(), z.date()]).optional().nullable(),
  status: z.nativeEnum(SimplbooksStatus).optional(),
  updated_at_utc: z.union([z.string().datetime(), z.date()]).optional(),
})

export type AcctsOutboxSimplbooks = z.infer<typeof AcctsOutboxSimplbooksSchema>

export const SimplBooksInsertResponseSchema = z.object({
  status: z.number().int(),
  duration: z.number(),
  inserted_id: z.number().int(),
  response: z.string(),
})

export type SimplBooksInsertResponse = z.infer<typeof SimplBooksInsertResponseSchema>

export const SimplBooksGetResponseSchema = z.object({
  status: z.number().int(),
  duration: z.number(),
  //data: z.object(),
})

export type SimplBooksGetResponse = z.infer<typeof SimplBooksGetResponseSchema>

export const InvoiceListSchema = z.object({
  id: z.number(),
  client_id: z.number(),
  client_name: z.string(),
  client_reg_no: z.string(),
  client_vat_no: z.string(),
  created: z.string(), // could also use z.coerce.date() if you want Date objects
  transaction_date: z.string(),
  due: z.string(),
  number: z.string(),
  sum: z.number(),
  vat: z.number(),
  rounding: z.number(),
  total_sum: z.number(),
  row_sum_with_vat: z.boolean(),
  currency_name: z.string(),
  currency_rate: z.number(),
  sent: z.string(),
  paid: z.string(),
  proforma: z.boolean(),
  proforma_percent: z.number(),
  credit_invoice_for: z.number(),
})

export const InvoiceListResponseSchema = z.object({
  status: z.number(),
  duration: z.number(),
  data: z.array(
    z.object({
      invoices: InvoiceListSchema,
    }),
  ),
})

export type InvoiceListResponse = z.infer<typeof InvoiceListResponseSchema>
export type InvoiceListItem = z.infer<typeof InvoiceListSchema>

export const ShopOrderInvoicePayloadSchema = z
  .object({
    orderId: z.string().min(1),
  })
  .strict()

export type ShopOrderInvoicePayload = z.infer<typeof ShopOrderInvoicePayloadSchema>

export const ArticleListSchema = z
  .object({
    id: z.number(),
    code: z.string(),
    ean: z.string(),
    name: z.string(),
    contents: z.string(),
    unit: z.string(),
    amount: z.number(),
    price_per_unit: z.number(),
    markup_value: z.number(),
    markup_type: z.string(),
    is_inventory: z.boolean(),
    active: z.boolean(),
  })
  .partial()

export const ArticleDataItemSchema = z.object({
  Article: ArticleListSchema,
})

export const ItemListSchema = z.object({
  status: z.number(),
  duration: z.number(),
  data: z.array(ArticleDataItemSchema),
})

export type ItemListPayload = z.infer<typeof ItemListSchema>
export type ItemListArticle = z.infer<typeof ArticleListSchema>

export const FeeTypeEnum = z.enum(['annual_fee', 'equipment_fee'])
export type FeeType = z.infer<typeof FeeTypeEnum>

export const AnnualFeeInfoSchema = AuditableSchema.extend({
  memberId: z.string(),
  feeType: FeeTypeEnum,
  year: z.number().int().min(2024).max(2100),
  invoiceId: z.number().int().positive(),
})
export type AnnualFeeInfo = z.infer<typeof AnnualFeeInfoSchema>

export const SimplbooksSyncStatusSchema = z.enum(['PENDING', 'SYNCED', 'FAILED'])
export type SimplbooksSyncStatus = z.infer<typeof SimplbooksSyncStatusSchema>

export const SimplbooksSyncStateStatusSchema = z.enum(['SUCCESS', 'FAILED', 'IN_PROGRESS'])
export type SimplbooksSyncStateStatus = z.infer<typeof SimplbooksSyncStateStatusSchema>

export const ReceiptIncomingSchema = z.object({
  income_account_id: z.number().int().optional(),
  income_sum: z.number(),
  income_date: z.string().date(),
  description: z.string(),
  currency_name: z.string().optional(),
  currency_rate: z.number().optional(),
  client_id: z.number().int(),
})

export const ReceiptPostSchema = z.object({
  Incoming: ReceiptIncomingSchema,
  Projects: z.array(ProjectSchema).optional(),
  invoice_id: z.number().int().optional(),
})

// Purchase row as required by the SimplBooks purchases/create API
// - name:    line item description
// - amount:  quantity
// - sum:     total row amount (amount * unit_price), no unit_price field available
// - Projects: optional cost-centre codes, placed inside each row (not at top level)
export const PurchaseRowProjectSchema = z.object({
  code: z.string(), // cost centre code
})

export const PurchaseRowSchema = z.object({
  name: z.string(),
  amount: z.number(),
  sum: z.number(), // row total = amount * unit_price (ex-VAT)
  vat: z.number().optional(),
  article_id: z.number().optional(),
  code: z.string().optional(),
  unit: z.string().optional(),
  vat_type_id: z.number().optional(),
  discount: z.number().optional(),
  expense_account_id: z.number().optional(),
  Projects: z.array(PurchaseRowProjectSchema).optional(),
})
export type PurchaseRow = z.infer<typeof PurchaseRowSchema>

export const PurchaseRowWrapperSchema = z.object({
  PurchaseRow: PurchaseRowSchema,
  Projects: z.array(PurchaseRowProjectSchema).default([]),
})
export type PurchaseRowWrapper = z.infer<typeof PurchaseRowWrapperSchema>

// Top-level Purchase object for purchases/create
// comments replaces description; file_type + file_contents attach the receipt document
export const PurchaseObjectSchema = z.object({
  client_id: z.number().optional(),
  created: z.string(), // yyyy-MM-dd — "Date of the purchase invoice"
  // "Accounting date of the purchase invoice" (Kirjanpidon päivämäärä) — subject to
  // period locking in SimplBooks. For expense reimbursements this is set to the
  // claim's submit date, not the (possibly much older) member-entered expense date —
  // see createExpenseReimbursement() in simplbooksOutboxHandler.ts (issue #1071).
  transaction_date: z.string().optional(),
  due: z.string().optional(),
  currency_name: z.string().default('EUR'),
  currency_rate: z.number().optional(), // required when currency_name != 'EUR'
  comments: z.string().optional(),
  file_type: z.enum(['pdf', 'png', 'jpg', 'jpeg']).optional(), // attached receipt document
  file_contents: z.string().optional(), // base64-encoded file
})

export const PurchasePostSchema = z.object({
  Purchase: PurchaseObjectSchema,
  PurchaseRows: z.array(PurchaseRowWrapperSchema),
})
export type PurchasePost = z.infer<typeof PurchasePostSchema>

export type ReceiptIncoming = z.infer<typeof ReceiptIncomingSchema>
export type ReceiptPost = z.infer<typeof ReceiptPostSchema>
