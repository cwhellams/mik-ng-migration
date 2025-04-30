import { z } from 'zod'

import { MemberSchema } from '../../routes/members/models.ts'

// Regex pattern for dd-mm-yyyy
const datePattern = /^\d{2}-\d{2}-\d{4}$/ // Matches dates in the format dd-mm-yyyy
// Regex pattern for yyyy-mm-dd
const datePatternISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // Matches dates in the format yyyy-mm-dd

export enum SimplbooksEventType {
  ADD_MEMBER = 'addMember',
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

export function mapMemberToClient(
  member: z.infer<typeof MemberSchema>,
): z.infer<typeof clientSchema> {
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

const TaskSchema = z.object({
  article_id: z.number(),
  amount: z.number(),
  price_per_unit: z.number(),
  discount: z.number().default(0).optional(),
  contents: z.string(),
})

const TasksSchema = z.object({
  Task: TaskSchema,
  Projects: z.array(ProjectSchema),
})

const InvoiceSchema = z.object({
  number: z.number().optional(),
  currency_name: z.string().default('EUR').optional(),
  overdue_charge_percent: z.number(),
  created: datePatternISO, // You may want to use `z.date()` if you are working with Date objects
  transaction_date: datePatternISO,
  due: datePatternISO,
  sent: datePatternISO,
  reference: z.string().optional(),
  client_id: z.number(),
  client_location_id: z.number().optional(),
  language: z.string().optional(),
  additional_info: z.string().optional(),
})

export const InvoiceRootSchema = z.object({
  Invoice: InvoiceSchema,
  Tasks: z.array(TasksSchema),
})

export type Invoice = z.infer<typeof InvoiceRootSchema>
