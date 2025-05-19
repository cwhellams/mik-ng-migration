import { z } from 'zod'

import { type MemberProfile } from '../../routes/members/models.ts'

// Regex pattern for dd-mm-yyyy
const datePattern = /^\d{2}-\d{2}-\d{4}$/ // Matches dates in the format dd-mm-yyyy
// Regex pattern for yyyy-mm-dd
//const datePatternISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // Matches dates in the format yyyy-mm-dd

export enum SimplbooksEventType {
  ADD_MEMBER = 'addMember',
  MEMBERSHIP_FEE = 'membershipFee',
  FLIGHT_INVOICE = 'flightInvoice',
  REIMBURSEMENT = 'reimbursement',
  SEND_INVOICE_PDF = 'sendInvoicePdf',
}

export enum SimplbooksStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
}

export enum MIKInvoiceType {
  ANNUAL_FEE = 'ANNUAL_FEE',
  EQUIPMENT_FEE = 'EQUIPMENT_FEE',
  FLIGHT = 'FLIGHT',
  INSTRUCTION = 'INSTRUCTION',
  MISC = 'MISC',
}

const IsoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (expected yyyy-mm-dd)')
  .refine(str => !isNaN(Date.parse(str)), 'Invalid date')

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
  }),
})

export type ClientData = z.infer<typeof clientSchema>

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

export function mapMemberToClient(member: MemberProfile): ClientData {
  return {
    Client: {
      name: `${member.firstName} ${member.lastName}`,
      address_street: member.streetAddress ?? '',
      address_city: member.townCity ?? '',
      address_postal_code: member.postcode ?? '',
      address_country: 'FI',
      e_mail: member.email,
      phone: member.phoneNumber ?? '',
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
    created: IsoDateString,
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
  created_at_utc: z.union([z.string().datetime(), z.date()]).optional(), // Generated<Timestamp>
  error_message: z.string().optional().nullable(),
  event_type: z.string(),
  id: z.string(),
  payload: z.unknown(), // Can be improved if Json shape is known
  processed_at: z.union([z.string().datetime(), z.date()]).optional().nullable(),
  status: z.enum(['FAILED', 'PENDING', 'PROCESSING', 'SYNCED']).optional(), // Generated<SimplbooksOutboxStatus>
  updated_at_utc: z.union([z.string().datetime(), z.date()]).optional(), // Generated<Timestamp>
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

// export const acctsInvoiceSchema = z.object({
//   amount: z.union([z.number(), z.string()]).nullable(), // Numeric: input can be number or string
//   created_at: z.union([z.string(), z.date()]), // Timestamp
//   created_by: z.string(),
//   currency: z.string().nullable(),
//   description: z.string().nullable(),
//   due_at: z.union([z.string(), z.date()]),
//   id: z.number().int().nonnegative(),
//   invoice_type: invoiceTypeSchema,
//   is_paid: z.boolean().nullable(),
//   member_id: z.string(),
//   paid_at: z.union([z.string(), z.date()]).nullable(),
//   pmt_ref: z.string(),
//   sent_at: z.union([z.string(), z.date()]),
//   updated_at: z.union([z.string(), z.date()]),
//   updated_by: z.string(),
// })

//export type AcctsInvoice = z.infer<typeof acctsInvoiceSchema>

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
    sum_with_vat: z.number(),
    markup_value: z.number(),
    markup_type: z.string(), // Add more values if needed
    is_inventory: z.boolean(),
    active: z.boolean(),
    sales_vat_type_id: z.number(),
    purchase_vat_type_id: z.number(),
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
