import { z } from 'zod'
import { MileageDetailSchema, CreateMileageDetailSchema } from './mileageModels.ts'
export { MileageDetailSchema, CreateMileageDetailSchema } from './mileageModels.ts'

export enum ExpenseClaimStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  PENDING_INFO = 'PENDING_INFO',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SYNCED = 'SYNCED',
}

export enum ExpenseMessageType {
  REQUEST_INFO = 'REQUEST_INFO',
  MEMBER_REPLY = 'MEMBER_REPLY',
  SYSTEM = 'SYSTEM',
}

export const ExpenseCategorySchema = z.object({
  id: z.number(),
  code: z.string(),
  labelEn: z.string(),
  labelFi: z.string(),
  labelSv: z.string(),
  requiresAircraft: z.boolean(),
  requiresFlight: z.boolean(),
  active: z.boolean(),
})
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>

// ISO 4217 currency codes for European countries, ordered by proximity to Finland
export const MIK_SUPPORTED_CURRENCIES = [
  'EUR', // Eurozone (Finland)
  'SEK', // Sweden
  'NOK', // Norway
  'DKK', // Denmark
  'USD', // United States
  'GBP', // United Kingdom
  'PLN', // Poland
  'CZK', // Czech Republic
  'HUF', // Hungary
  'RON', // Romania
  'UAH', // Ukraine
  'MDL', // Moldova
  'BGN', // Bulgaria
  'RSD', // Serbia
  'BAM', // Bosnia and Herzegovina
  'MKD', // North Macedonia
  'ALL', // Albania
  'CHF', // Switzerland
  'ISK', // Iceland
  'GEL', // Georgia
  'TRY', // Turkey
] as const

export type EuropeanCurrency = (typeof MIK_SUPPORTED_CURRENCIES)[number]

export const ExpenseLineItemSchema = z.object({
  id: z.number().optional(),
  itemId: z.number().int().positive().nullable().optional(),
  itemCode: z.string().nullable().optional(),
  description: z.string().min(1).max(500),
  date: z.string().date().nullable().optional(),
  quantity: z.number().positive(),
  unit: z.enum(['pcs', 'km', 'l', 'h']).default('pcs'),
  unitPrice: z.number().min(0),
  sortOrder: z.number().int().default(0),
  costCentreCode: z.string().max(50).nullable().optional(),
})
export type ExpenseLineItem = z.infer<typeof ExpenseLineItemSchema>

export const ExpenseClaimReceiptSchema = z.object({
  storageKey: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  uploadedAt: z.string(),
})
export type ExpenseClaimReceipt = z.infer<typeof ExpenseClaimReceiptSchema>

export const ExpenseClaimMessageSchema = z.object({
  id: z.number(),
  claimId: z.string().uuid(),
  senderId: z.string(),
  messageType: z.nativeEnum(ExpenseMessageType),
  body: z.string(),
  sentAt: z.string(),
})
export type ExpenseClaimMessage = z.infer<typeof ExpenseClaimMessageSchema>

export const CreateExpenseClaimSchema = z.object({
  categoryId: z.number().int().positive(),
  aircraftId: z.string().optional(),
  flightLogId: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  expenseDate: z.string().date().optional(),
  fuelLitres: z.number().positive().optional(),
  fuelType: z.enum(['98', '100LL', 'JetA1']).optional(),
  currency: z.enum(MIK_SUPPORTED_CURRENCIES).optional(),
  fxRate: z.number().positive().nullable().optional(),
  lineItems: z.array(ExpenseLineItemSchema).min(1),
  iban: z.string().max(34).optional(),
  ibanAccountName: z.string().max(200).optional(),
  mileageDetail: CreateMileageDetailSchema.optional(),
})
export type CreateExpenseClaim = z.infer<typeof CreateExpenseClaimSchema>

export const UpdateExpenseClaimSchema = CreateExpenseClaimSchema.partial()
export type UpdateExpenseClaim = z.infer<typeof UpdateExpenseClaimSchema>

export const ExpenseClaimSchema = z.object({
  id: z.string().uuid(),
  memberId: z.string(),
  categoryId: z.number(),
  categoryCode: z.string().optional(),
  aircraftId: z.string().nullable().optional(),
  flightLogId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.nativeEnum(ExpenseClaimStatus),
  fuelLitres: z.number().nullable().optional(),
  fuelType: z.string().nullable().optional(),
  expenseDate: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  ibanAccountName: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  fxRate: z.number().nullable().optional(),
  submittedAt: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  rejectedAt: z.string().nullable().optional(),
  rejectedBy: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  simplbooksPurchaseId: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lineItems: z.array(ExpenseLineItemSchema).optional(),
  receipt: ExpenseClaimReceiptSchema.optional(),
  messages: z.array(ExpenseClaimMessageSchema).optional(),
  mileageDetail: MileageDetailSchema.optional(),
  memberName: z.string().optional(),
  memberEmail: z.string().optional(),
  totalAmount: z.number().optional(),
})
export type ExpenseClaim = z.infer<typeof ExpenseClaimSchema>

export const ExpenseClaimListResponseSchema = z.object({
  claims: z.array(ExpenseClaimSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type ExpenseClaimListResponse = z.infer<typeof ExpenseClaimListResponseSchema>

export const ExpenseClaimFiltersSchema = z.object({
  status: z.nativeEnum(ExpenseClaimStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type ExpenseClaimFilters = z.infer<typeof ExpenseClaimFiltersSchema>

export const RejectExpenseClaimSchema = z.object({
  reason: z.string().min(1).max(1000),
})

export const RequestInfoSchema = z.object({
  message: z.string().min(1).max(2000),
})
