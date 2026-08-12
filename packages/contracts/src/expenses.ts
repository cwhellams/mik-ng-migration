import { z } from 'zod'
import { createMileageLegSchema, MileageLegSchema } from './expenses-mileage.ts'
import { DateRangeSchema, PaginationSchema, withDateRangeCheck } from './schema.ts'
export { MileageLegSchema, CreateMileageLegSchema } from './expenses-mileage.ts'

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

// Fuel types available at EFNU.
export const FUEL_TYPES = ['100LL', 'JetA1', 'mogas'] as const
export type FuelType = (typeof FUEL_TYPES)[number]

export const ExpenseLineItemSchema = z.object({
  id: z.number().optional(),
  itemId: z.number().int().positive().nullable().optional(),
  itemCode: z.string().nullable().optional(),
  // Not required at the schema level (a saved-but-not-yet-submitted draft may still
  // have an untouched placeholder line item) — enforced instead at submit time,
  // alongside the other submit-only checks in POST /expenses/:id/submit.
  description: z.string().max(500),
  date: z.string().date().nullable().optional(),
  quantity: z.number().positive(),
  unit: z.enum(['pcs', 'km', 'l', 'h']).default('pcs'),
  unitPrice: z.number().min(0),
  // The user-entered total for this line (e.g. total fuel cost paid), persisted alongside
  // unitPrice so it round-trips exactly on reload instead of being reconstructed as
  // quantity * unitPrice, which drifts once unitPrice is rounded to its stored precision
  // (issue #1024).
  totalCost: z.number().min(0).nullable().optional(),
  sortOrder: z.number().int().default(0),
  costCentreCode: z.string().max(50).nullable().optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  airport: z.string().max(10).nullable().optional(),
  // Fuel bought with the club's card rather than by the member (issue #955) — still
  // counts toward the trip's balanced price-cap calculation, but is never reimbursed.
  paidWithClubCard: z.boolean().default(false),
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

// ─── Multiple attachments (issue #955) ───────────────────────────────────────
// Newer than the singular receipt_* columns above, which stay in place unchanged for
// old claims. New claims use this instead — SimplBooks only accepts one attachment per
// purchase, so at approval time every attachment is merged into a single PDF.

export const ExpenseClaimAttachmentSchema = z.object({
  id: z.number(),
  claimId: z.string().guid(),
  storageKey: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  sortOrder: z.number(),
  uploadedAt: z.string(),
})
export type ExpenseClaimAttachment = z.infer<typeof ExpenseClaimAttachmentSchema>

export const ExpenseClaimMessageSchema = z.object({
  id: z.number(),
  claimId: z.string().guid(),
  senderId: z.string(),
  messageType: z.nativeEnum(ExpenseMessageType),
  body: z.string(),
  sentAt: z.string(),
})
export type ExpenseClaimMessage = z.infer<typeof ExpenseClaimMessageSchema>

// A factory, not a constant, because the mileage board-approval cap is deployment
// config (MILEAGE_MAX_KM) that only the backend can read. Callers that don't care
// about the cap can use CreateExpenseClaimSchema below.
export const createExpenseClaimSchema = (maxMileageKm?: number) =>
  z.object({
    categoryId: z.number().int().positive(),
    aircraftId: z.string().optional(),
    flightLogId: z.string().optional(),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    expenseDate: z.string().date().optional(),
    fuelLitres: z.number().positive().optional(),
    fuelType: z.enum(FUEL_TYPES).optional(),
    currency: z.enum(MIK_SUPPORTED_CURRENCIES).optional(),
    fxRate: z.number().positive().nullable().optional(),
    // Not required to be non-empty here — a claim can be saved as a draft before any
    // line items are filled in. Enforced at submit time instead (see the description
    // comment above and POST /expenses/:id/submit).
    lineItems: z.array(ExpenseLineItemSchema),
    iban: z.string().max(34).optional(),
    ibanAccountName: z.string().max(200).optional(),
    mileageLegs: z.array(createMileageLegSchema(maxMileageKm)).min(1).optional(),
    /** Finnish social security number, claim-level (one person per claim), masked on read. */
    hetu: z.string().optional(),
  })

/** The claim schema with the default mileage cap — use for types and for callers with no env. */
export const CreateExpenseClaimSchema = createExpenseClaimSchema()
export type CreateExpenseClaim = z.infer<typeof CreateExpenseClaimSchema>

export const UpdateExpenseClaimSchema = CreateExpenseClaimSchema.partial()
export type UpdateExpenseClaim = z.infer<typeof UpdateExpenseClaimSchema>

// ─── Fuel reimbursement balanced cap (issue #955) ────────────────────────────

export const FuelReimbursementSummarySchema = z.object({
  totalLitres: z.number(),
  totalCost: z.number(),
  localPriceEurPerLitre: z.number().nullable(),
  localPriceCost: z.number().nullable(),
  cappedTotal: z.number().nullable(),
  clubCardLitres: z.number(),
  clubCardCost: z.number(),
  memberReimbursement: z.number(),
  memberOwesClub: z.number(),
  capped: z.boolean(),
})
export type FuelReimbursementSummary = z.infer<typeof FuelReimbursementSummarySchema>

export const ExpenseClaimSchema = z.object({
  id: z.string().guid(),
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
  // Derived server-side from line items' airport codes (issue #1020) — not client-writable.
  refuelOutsideFinland: z.boolean().optional().default(false),
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
  attachments: z.array(ExpenseClaimAttachmentSchema).optional(),
  messages: z.array(ExpenseClaimMessageSchema).optional(),
  mileageLegs: z.array(MileageLegSchema).optional(),
  /** Returned masked from the API; full value only goes in on write */
  hetu: z.string().optional(),
  memberName: z.string().optional(),
  memberEmail: z.string().optional(),
  totalAmount: z.number().optional(),
  // Computed live from line items + the local fuel price in effect on the trip's start
  // date, only for fuel-category claims — never persisted (issue #955).
  fuelReimbursementSummary: FuelReimbursementSummarySchema.optional(),
})
export type ExpenseClaim = z.infer<typeof ExpenseClaimSchema>

export const ExpenseClaimListResponseSchema = z.object({
  claims: z.array(ExpenseClaimSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type ExpenseClaimListResponse = z.infer<typeof ExpenseClaimListResponseSchema>

export const ExpenseClaimFiltersSchema = z
  .object({
    status: z.nativeEnum(ExpenseClaimStatus).optional(),
  })
  .merge(PaginationSchema(20))
export type ExpenseClaimFilters = z.infer<typeof ExpenseClaimFiltersSchema>

export const RejectExpenseClaimSchema = z.object({
  reason: z.string().min(1).max(1000),
})

export const RequestInfoSchema = z.object({
  message: z.string().min(1).max(2000),
})

export const OverrideFuelPriceSchema = z.object({
  efnuPrice: z.number().positive(),
})

// ─── Treasurer edit (issue #1028) ────────────────────────────────────────────
// A deliberately narrow schema — a treasurer can fix small mistakes on a
// submitted/pending-info claim (wrong item code, wrong airport, etc.) without
// touching status, memberId, or anything approval-related. Every field here is
// optional/omittable so only the fields actually being corrected need to be sent;
// each changed value is diffed and logged (accts.expense_claim_edit_audit).

export const TreasurerEditLineItemSchema = z.object({
  id: z.number().int(), // required — targets an existing line item row
  itemId: z.number().int().positive().nullable().optional(),
  description: z.string().min(1).max(500).optional(),
  date: z.string().date().nullable().optional(),
  quantity: z.number().positive().optional(),
  unit: z.enum(['pcs', 'km', 'l', 'h']).optional(),
  unitPrice: z.number().min(0).optional(),
  // Sent alongside unitPrice by the treasurer's edit dialog, which (like the member's own
  // form) lets the treasurer type the known total and back-derives unitPrice from it —
  // persisting it keeps the exact figure instead of reconstructing it from the rounded
  // unit price (issue #1024).
  totalCost: z.number().min(0).nullable().optional(),
  costCentreCode: z.string().max(50).nullable().optional(),
  airport: z.string().max(10).nullable().optional(),
  paidWithClubCard: z.boolean().optional(),
})
export type TreasurerEditLineItem = z.infer<typeof TreasurerEditLineItemSchema>

export const TreasurerEditExpenseClaimSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  aircraftId: z.string().nullable().optional(),
  expenseDate: z.string().date().optional(),
  lineItems: z.array(TreasurerEditLineItemSchema).optional(),
})
export type TreasurerEditExpenseClaim = z.infer<typeof TreasurerEditExpenseClaimSchema>

export const ExpenseClaimEditAuditEntrySchema = z.object({
  fieldName: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  lineItemId: z.number().nullable(),
  editedBy: z.string(),
  editedAt: z.string(),
})
export type ExpenseClaimEditAuditEntry = z.infer<typeof ExpenseClaimEditAuditEntrySchema>

// ─── HETU reveal (issue #1022) ───────────────────────────────────────────────

export const RevealHetuResponseSchema = z.object({
  hetu: z.string(),
})
export type RevealHetuResponse = z.infer<typeof RevealHetuResponseSchema>

// ─── Tulorekisteri mileage report (issue #1022) ──────────────────────────────
// Never includes HETU — the report is a worklist; HETU is only available via the
// per-claim reveal endpoint above.

export const MileageReportFiltersSchema = withDateRangeCheck(DateRangeSchema)
export type MileageReportFilters = z.infer<typeof MileageReportFiltersSchema>

export const MileageReportRowSchema = z.object({
  claimId: z.string().guid(),
  memberId: z.string(),
  memberName: z.string(),
  journeyDate: z.string(),
  // Structured fields for legs created after issue #1021; route is the legacy
  // free-text fallback for older claims where start/end address are null.
  route: z.string().nullable(),
  startAddress: z.string().nullable(),
  endAddress: z.string().nullable(),
  distanceKm: z.number(),
  ratePerKm: z.number(),
  totalAmount: z.number(),
  approvedAt: z.string().nullable(),
})
export type MileageReportRow = z.infer<typeof MileageReportRowSchema>

export const MileageReportResponseSchema = z.object({
  data: z.array(MileageReportRowSchema),
  filters: MileageReportFiltersSchema,
})
export type MileageReportResponse = z.infer<typeof MileageReportResponseSchema>
