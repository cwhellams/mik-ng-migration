import { z } from 'zod'

import { FlightLogStatus } from './flight-log.ts'
import { MIK_SUPPORTED_CURRENCIES } from './expenses.ts'
import {
  AuditableSchema,
  LimitOffsetSchema,
  nullableTrimmedString,
  optionalTrimmedString,
} from './schema.ts'
import { toHelsinki } from './date.ts'

/**
 * The Liquid Management System (#1119): one record per fuel or oil uplift, held
 * apart from the flight log because a member may fuel an aircraft even when the
 * planned flight is cancelled.
 *
 * Everything in this file is isomorphic on purpose. The lock rules, the tax
 * arithmetic and the away-from-home derivation are all *decisions* both sides
 * need: the server enforces them, and the UI has to disable a control rather
 * than let the member fill in a form that will be rejected. Two copies of
 * `now - createdAt > 7 days` would drift; one exported function cannot.
 *
 * What is deliberately *not* here: the `problem()` calls that react to a rule
 * failing, and the database reads the rules take as input. Those are the
 * backend's (see `routes/liquid/`).
 */

// ─── Vocabulary ───────────────────────────────────────────────────────────────

export enum LiquidType {
  FUEL = 'FUEL',
  OIL = 'OIL',
}

/** How the record came to exist — kept for reporting, never a permission input. */
export enum LiquidRecordSource {
  MANUAL = 'MANUAL',
  FLIGHT_LOG = 'FLIGHT_LOG',
  QR = 'QR',
}

export enum OilSource {
  /** A canister from the club's own inventory. */
  CANISTER = 'CANISTER',
  /** Oil from anywhere else — the club still needs make, viscosity and batch. */
  OTHER = 'OTHER',
}

export enum QrTargetType {
  OIL_CANISTER = 'OIL_CANISTER',
  FUEL_STATION = 'FUEL_STATION',
}

/**
 * The club's home base. Fuelling here is invoiced to the club directly, so the
 * member has no total cost to report; everywhere else the total is required.
 */
export const HOME_BASE_ICAO = 'EFNU'

/**
 * A member may edit or delete their own record for a week after creating it.
 *
 * Measured from creation, not from `recordedAt` — those differ when someone
 * back-dates a record, and creation is the one the member cannot move.
 */
export const LIQUID_EDIT_WINDOW_DAYS = 7

/**
 * How long another member's fuel/oil record stays offered for linking, or
 * linkable at all, without being its owner: "fuel now, fly later — maybe a
 * different person" (#1119 flight-log linking). A member's own records are
 * never subject to this — only someone else's.
 */
export const LIQUID_LINK_WINDOW_HOURS = 24

/**
 * The club's fuel types, from `@mik/contracts/aircrafts` — one vocabulary,
 * matching `flight.fuel_types`. Re-exported so the liquid UI has one import.
 *
 * For the dropdowns only. The authoritative per-aircraft list is
 * `flight.aircraft.fuel_types`, which is what the server validates against.
 */
export { FUEL_TYPES as LIQUID_FUEL_TYPES } from './aircrafts.ts'

/** The one fuel type whose Finnish tax treatment depends on where it was bought. */
export const JET_A1 = 'JET A-1'

// ─── Fuel providers ───────────────────────────────────────────────────────────

export const FuelProviderSchema = z.object({
  providerId: z.number().int().positive(),
  code: z.string(),
  name: z.string(),
  /** `EFNU` for the three home-base providers, null for the ones that travel. */
  defaultAirport: z.string().nullable(),
  /** null means "sells whatever the airport has". */
  fuelTypes: z.array(z.string()).nullable(),
  requiresTotalCost: z.boolean(),
  /** Whether a purchase through this provider is the member's own money, and so claimable. */
  requiresClaim: z.boolean(),
  isHomeBase: z.boolean(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
})
export type FuelProvider = z.infer<typeof FuelProviderSchema>

/**
 * At EFNU the member picks a fuel type and the provider follows from it — they
 * never see a provider dropdown. The mapping is stored on the provider rows
 * (`fuel_types`) rather than hard-coded, so this resolves against whatever the
 * database says.
 */
export const resolveHomeBaseProvider = (
  providers: FuelProvider[],
  fuelType: string,
): FuelProvider | undefined =>
  providers.find((p) => p.isHomeBase && p.isActive && (p.fuelTypes ?? []).includes(fuelType))

/** Providers a member may pick from, given where they are and what they pumped. */
export const selectableProviders = (
  providers: FuelProvider[],
  airport: string | null | undefined,
  fuelType: string | null | undefined,
): FuelProvider[] => {
  const atHomeBase = isHomeBase(airport)
  return providers
    .filter((p) => p.isActive)
    .filter((p) => p.isHomeBase === atHomeBase)
    .filter((p) => !fuelType || !p.fuelTypes || p.fuelTypes.includes(fuelType))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

// ─── Location and tax derivation ──────────────────────────────────────────────

export const isHomeBase = (airport: string | null | undefined): boolean =>
  (airport ?? '').toUpperCase() === HOME_BASE_ICAO

/**
 * Finnish ICAO codes start with `EF`. Same rule the expense claims already use
 * for `refuel_outside_finland`, lifted here so fuel records and fuel claims
 * cannot disagree about where a purchase happened.
 */
export const isAirportOutsideFinland = (icao: string | null | undefined): boolean =>
  !!icao && !icao.toUpperCase().startsWith('EF')

/**
 * "If an airport's ICAO code does not begin with EF and the fuel type is
 * Jet A-1, mark the record as tax included / fueled abroad."
 *
 * Only the default. The member may tick or untick it — a purchase can be
 * invoiced in a way the ICAO code doesn't reveal — which is why this returns a
 * suggestion rather than being folded into the tax calculation.
 */
export const deriveTaxIncludedAbroad = (
  airport: string | null | undefined,
  fuelType: string | null | undefined,
): boolean => isAirportOutsideFinland(airport) && fuelType === JET_A1

/** Away from home, the member paid, so the total is the only way to price it. */
export const requiresTotalCost = (
  liquidType: LiquidType,
  airport: string | null | undefined,
): boolean => liquidType === LiquidType.FUEL && !isHomeBase(airport)

// ─── The record ───────────────────────────────────────────────────────────────

const litres = (max: number) =>
  z
    .number()
    .positive()
    .max(max)
    // Three decimals is what the column stores. Rounding here rather than
    // letting Postgres do it keeps the value the member sees and the value the
    // price-per-litre is derived from identical.
    .transform((v) => Math.round(v * 1000) / 1000)

/**
 * A fuel tank measures in the hundreds of litres; an aircraft engine's oil
 * system does not. The deleted `OilUplift` component capped its input at 10L
 * for exactly this reason — kept here as a real validation bound (with a
 * little headroom for a full engine refill) rather than an HTML `max` nobody
 * server-side ever checked.
 */
export const OIL_MAX_LITRES = 20

export const LiquidRecordSchema = AuditableSchema.extend({
  recordId: z.string().guid(),
  liquidType: z.nativeEnum(LiquidType),
  aircraftRegistration: z.string(),
  memberId: z.string(),
  recordedAt: z.string().datetime(),

  // Fuel
  airport: z.string().nullable(),
  airportName: z.string().nullable(),
  fuelType: z.string().nullable(),
  providerId: z.number().int().nullable(),
  providerName: z.string().nullable(),
  quantityLitres: z.number(),
  totalCost: z.number().nullable(),
  ccy: z.string(),
  fxRate: z.number().nullable(),
  taxIncludedAbroad: z.boolean(),

  // Oil
  oilSource: z.nativeEnum(OilSource).nullable(),
  oilCanisterId: z.string().guid().nullable(),
  oilCanisterRef: z.string().nullable(),
  oilMake: z.string().nullable(),
  oilModelViscosity: z.string().nullable(),
  oilBatchNumber: z.string().nullable(),
  remainingLitres: z.number().nullable(),
  markCanisterEmpty: z.boolean(),

  // Links
  flightLogId: z.string().nullable(),
  /** Only set once the linked flight log has been read — null when unlinked. */
  flightLogStatus: z.nativeEnum(FlightLogStatus).nullable(),
  expenseClaimId: z.string().guid().nullable(),
  qrId: z.string().guid().nullable(),
  source: z.nativeEnum(LiquidRecordSource),

  // Frozen price audit trail (see computeLiquidFuelPricing)
  originalPaidTotal: z.number().nullable(),
  originalPricePerLitre: z.number().nullable(),
  taxAdjustedPricePerLitre: z.number().nullable(),
  fuelTaxYear: z.number().int().nullable(),
  fuelTaxRateApplied: z.number().nullable(),
  claimLinkedAt: z.string().datetime().nullable(),

  deletedAt: z.string().datetime().nullable(),
  deletedBy: z.string().nullable(),

  /** How many receipts (`LiquidRecordAttachment`) this record already carries. */
  attachmentCount: z.number().int(),
})
export type LiquidRecord = z.infer<typeof LiquidRecordSchema>

/**
 * An optional receipt captured when reporting a self-paid fuelling (provider
 * `requiresClaim`), so the member doesn't have to remember to attach it later
 * in the expense claim wizard — it's copied onto the claim built from this
 * record instead (see `ExpenseClaimAttachmentSchema.sourceLiquidAttachmentId`
 * in `@mik/contracts/expenses`).
 */
export const LiquidRecordAttachmentSchema = z.object({
  id: z.number().int(),
  recordId: z.string().guid(),
  storageKey: z.string(),
  fileName: z.string(),
  fileSize: z.number().int(),
  mimeType: z.string(),
  uploadedAt: z.string().datetime(),
})
export type LiquidRecordAttachment = z.infer<typeof LiquidRecordAttachmentSchema>

/**
 * The shape the member submits, for both liquids.
 *
 * One schema rather than a FUEL one and an OIL one because the QR/deep-link
 * entry point does not know which it is until the target resolves, and a
 * discriminated union would force the client to pick before it can.
 * `refineLiquidRecordShape` below is what makes the halves mutually exclusive.
 */
const liquidRecordFields = {
  liquidType: z.nativeEnum(LiquidType),
  aircraftRegistration: z.string().min(1),
  /** Defaults to submission time at the route; the member may edit it. */
  recordedAt: z.string().datetime().optional(),

  /**
   * Upper-cased on parse. `static.airfields.ident` is uppercase and the column
   * has a foreign key to it, so a lowercase `efnu` would miss the key and
   * surface as a 500 instead of anything the member could act on. It would also
   * read as "away from home" to `isHomeBase`, which compares case-insensitively,
   * and so demand a total cost that EFNU does not need.
   */
  airport: optionalTrimmedString(z.string().max(10))
    .transform((v) => v?.toUpperCase())
    // `.optional()` goes *after* `.transform()`: the other way round, Zod infers
    // the key itself as required (present-but-possibly-undefined) rather than
    // optional, and every caller then has to name it.
    .optional(),
  fuelType: optionalTrimmedString(z.string().max(50)),
  /** Omitted at EFNU, where the fuel type determines it. */
  providerId: z.number().int().positive().optional(),
  quantityLitres: litres(10_000),
  totalCost: z.number().min(0).max(1_000_000).optional(),
  ccy: z.enum(MIK_SUPPORTED_CURRENCIES).default('EUR'),
  fxRate: z.number().positive().optional(),
  /** Omitted lets the server derive it; sent explicitly overrides. */
  taxIncludedAbroad: z.boolean().optional(),

  oilSource: z.nativeEnum(OilSource).optional(),
  oilCanisterId: z.string().guid().optional(),
  oilMake: optionalTrimmedString(z.string().max(100)),
  oilModelViscosity: optionalTrimmedString(z.string().max(100)),
  oilBatchNumber: optionalTrimmedString(z.string().max(100)),
  remainingLitres: z.number().min(0).max(100).optional(),
  markCanisterEmpty: z.boolean().default(false),

  flightLogId: optionalTrimmedString(z.string().max(9)),
  /** The QR code scanned, so the record records how it was reported. */
  qrCode: optionalTrimmedString(z.string().max(32)),
  source: z.nativeEnum(LiquidRecordSource).default(LiquidRecordSource.MANUAL),
}

type LiquidRecordInput = {
  liquidType: LiquidType
  airport?: string | null
  fuelType?: string | null
  oilSource?: OilSource
  oilCanisterId?: string
  oilMake?: string | null
  oilModelViscosity?: string | null
  oilBatchNumber?: string | null
  totalCost?: number | null
  ccy?: string
  fxRate?: number | null
  quantityLitres?: number
}

/**
 * The FUEL/OIL split, as Zod issues rather than database check-constraint
 * violations — the same rules are also `CHECK`s in V2060, but a constraint
 * surfaces as a 500 with a Postgres message in it. These give the member a 400
 * naming the field.
 */
export const refineLiquidRecordShape = <T extends z.ZodType<LiquidRecordInput>>(schema: T) =>
  schema.superRefine((data, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })

    if (data.liquidType === LiquidType.FUEL) {
      if (!data.airport) issue('airport', 'Airport is required for a fuel record.')
      if (!data.fuelType) issue('fuelType', 'Fuel type is required for a fuel record.')
      // "Away-from-EFNU flow: require total cost."
      if (requiresTotalCost(LiquidType.FUEL, data.airport) && data.totalCost == null) {
        issue('totalCost', `Total cost is required when fuelling away from ${HOME_BASE_ICAO}.`)
      }
    }

    if (data.liquidType === LiquidType.OIL) {
      if (data.quantityLitres != null && data.quantityLitres > OIL_MAX_LITRES) {
        issue('quantityLitres', `Oil quantity cannot exceed ${OIL_MAX_LITRES} litres.`)
      }
      if (!data.oilSource) issue('oilSource', 'Oil source is required for an oil record.')
      if (data.oilSource === OilSource.CANISTER && !data.oilCanisterId) {
        issue('oilCanisterId', 'Select the canister the oil came from.')
      }
      if (data.oilSource === OilSource.OTHER) {
        if (data.oilCanisterId) {
          issue('oilCanisterId', 'Oil from another source cannot name a club canister.')
        }
        // Non-club oil still has to be traceable: the club needs to know what
        // went into the engine even when it did not come off its own shelf.
        if (!data.oilMake) issue('oilMake', 'Make is required for oil from another source.')
        if (!data.oilModelViscosity) {
          issue('oilModelViscosity', 'Model/viscosity is required for oil from another source.')
        }
        if (!data.oilBatchNumber) {
          issue('oilBatchNumber', 'Batch number is required for oil from another source.')
        }
      }
    }

    // The report and the expense claim both work in EUR, so a foreign-currency
    // purchase without a rate cannot be priced at all.
    if ((data.ccy ?? 'EUR') !== 'EUR' && data.fxRate == null) {
      issue('fxRate', 'An exchange rate is required for a non-EUR purchase.')
    }
  })

export const CreateLiquidRecordSchema = refineLiquidRecordShape(z.object(liquidRecordFields))
/** What a client sends — defaults still unapplied. */
export type CreateLiquidRecordRequest = z.input<typeof CreateLiquidRecordSchema>
/** What the route receives after parsing — defaults filled in. */
export type CreateLiquidRecord = z.output<typeof CreateLiquidRecordSchema>

/**
 * A PATCH body.
 *
 * Written out as its own object rather than `CreateLiquidRecordSchema.partial()`
 * for two reasons. `.partial()` on a refined schema loses the refinement, and —
 * the sharper one — Zod's `.partial()` still applies field defaults, so a PATCH
 * that never mentioned `ccy` or `markCanisterEmpty` would silently reset them.
 * `liquidType`, `memberId` and `source` are absent because they are what the
 * record *is*, not something to edit.
 */
export const UpdateLiquidRecordSchema = z.object({
  recordedAt: z.string().datetime().optional(),
  aircraftRegistration: z.string().min(1).optional(),
  airport: nullableTrimmedString(z.string().max(10))
    // See the note on the create schema's airport for the ordering.
    .transform((v) => (v == null ? v : v.toUpperCase()))
    .optional(),
  fuelType: nullableTrimmedString(z.string().max(50)).optional(),
  providerId: z.number().int().positive().nullable().optional(),
  quantityLitres: litres(10_000).optional(),
  totalCost: z.number().min(0).max(1_000_000).nullable().optional(),
  ccy: z.enum(MIK_SUPPORTED_CURRENCIES).optional(),
  fxRate: z.number().positive().nullable().optional(),
  taxIncludedAbroad: z.boolean().optional(),
  oilCanisterId: z.string().guid().nullable().optional(),
  oilMake: nullableTrimmedString(z.string().max(100)).optional(),
  oilModelViscosity: nullableTrimmedString(z.string().max(100)).optional(),
  oilBatchNumber: nullableTrimmedString(z.string().max(100)).optional(),
  remainingLitres: z.number().min(0).max(100).nullable().optional(),
  markCanisterEmpty: z.boolean().optional(),
  flightLogId: nullableTrimmedString(z.string().max(9)).optional(),
})
export type UpdateLiquidRecordRequest = z.infer<typeof UpdateLiquidRecordSchema>

export const LiquidRecordFilterSchema = z
  .object({
    liquidType: z.nativeEnum(LiquidType).optional(),
    aircraftRegistration: z.string().optional(),
    /** Admin-only; a member always sees their own. */
    memberId: z.string().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    /** `true` narrows to records not yet on a claim — what the wizard wants. */
    unclaimed: z.coerce.boolean().optional(),
    /** `true` narrows to records not yet on a flight log. */
    unlinked: z.coerce.boolean().optional(),
    /** One flight's records — what the flight log's own liquid section reads. */
    flightLogId: z.string().optional(),
    includeDeleted: z.coerce.boolean().optional(),
  })
  .merge(LimitOffsetSchema(100, 500))
export type LiquidRecordFilter = z.infer<typeof LiquidRecordFilterSchema>

/**
 * The record as every endpoint returns it: the row plus the lock a client needs
 * before it renders an edit button.
 *
 * Attached server-side rather than derived in the browser, so the UI can never
 * offer a control the API would reject — and so the clock that decides the
 * one-week window is the server's, not the laptop's.
 */
export type LiquidRecordWithLock = LiquidRecord & { lock: LiquidRecordLock }

export const LiquidRecordListResponseSchema = z.object({
  records: z.array(LiquidRecordSchema),
  total: z.number().int(),
})
export type LiquidRecordListResponse = Omit<
  z.infer<typeof LiquidRecordListResponseSchema>,
  'records'
> & { records: LiquidRecordWithLock[] }

export interface LinkableRecordsResponse {
  records: LiquidRecordWithLock[]
}

/** What a flight log offers when the member wants to link an existing record. */
export const LinkFlightLogSchema = z.object({
  flightLogId: z.string().min(1).max(9),
})
export type LinkFlightLogRequest = z.infer<typeof LinkFlightLogSchema>

// ─── Lock rules ───────────────────────────────────────────────────────────────

export enum LiquidLockReason {
  /** Immutable for everyone, liquid admins included. */
  LINKED_TO_EXPENSE_CLAIM = 'LINKED_TO_EXPENSE_CLAIM',
  LINKED_TO_VALIDATED_FLIGHT_LOG = 'LINKED_TO_VALIDATED_FLIGHT_LOG',
  EDIT_WINDOW_EXPIRED = 'EDIT_WINDOW_EXPIRED',
  NOT_OWNER = 'NOT_OWNER',
  DELETED = 'DELETED',
}

export interface LiquidRecordLock {
  canEdit: boolean
  canDelete: boolean
  /** Absent when the record is editable. */
  reason?: LiquidLockReason
}

/** Just enough of a record to decide the lock — so a list view can ask cheaply. */
export interface LockInput {
  memberId: string
  expenseClaimId: string | null
  flightLogStatus: FlightLogStatus | null
  createdAt: string
  deletedAt: string | null
}

export interface LockActor {
  memberId: string
  isLiquidAdmin: boolean
}

/**
 * The single authority on who may change a liquid record, and why not.
 *
 * The issue's rules, in the order they take effect:
 *
 *   1. Linked to an expense claim → nobody, "including liquid administrators".
 *      This one is deliberately checked before the admin escape hatch: money
 *      has moved on the strength of these figures.
 *   2. A liquid admin may modify or delete any other locked record.
 *   3. Only the owning member may touch their own; other members never can.
 *   4. The owner loses the record once its flight log is validated, or a week
 *      after creating it — whichever comes first.
 *
 * `now` is a parameter rather than a `Date.now()` call so a test can pin it and
 * so the server's clock is the one that decides, not the browser's.
 */
export const computeLiquidRecordLock = (
  record: LockInput,
  actor: LockActor,
  now: Date = new Date(),
): LiquidRecordLock => {
  if (record.deletedAt) {
    return { canEdit: false, canDelete: false, reason: LiquidLockReason.DELETED }
  }

  if (record.expenseClaimId) {
    return {
      canEdit: false,
      canDelete: false,
      reason: LiquidLockReason.LINKED_TO_EXPENSE_CLAIM,
    }
  }

  if (actor.isLiquidAdmin) {
    return { canEdit: true, canDelete: true }
  }

  if (record.memberId !== actor.memberId) {
    return { canEdit: false, canDelete: false, reason: LiquidLockReason.NOT_OWNER }
  }

  if (record.flightLogStatus && record.flightLogStatus !== FlightLogStatus.NEW) {
    return {
      canEdit: false,
      canDelete: false,
      reason: LiquidLockReason.LINKED_TO_VALIDATED_FLIGHT_LOG,
    }
  }

  const ageMs = now.getTime() - new Date(record.createdAt).getTime()
  if (ageMs > LIQUID_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    return { canEdit: false, canDelete: false, reason: LiquidLockReason.EDIT_WINDOW_EXPIRED }
  }

  return { canEdit: true, canDelete: true }
}

// ─── Fuel tax ─────────────────────────────────────────────────────────────────

export const FuelTaxSchema = AuditableSchema.extend({
  id: z.number().int(),
  taxYear: z.number().int(),
  fuelType: z.string(),
  rateEurPerLitre: z.number(),
})
export type FuelTax = z.infer<typeof FuelTaxSchema>

export const UpsertFuelTaxSchema = z.object({
  taxYear: z.number().int().min(2000).max(2200),
  fuelType: z.string().min(1).max(50),
  rateEurPerLitre: z.number().min(0).max(100),
})
export type UpsertFuelTaxRequest = z.infer<typeof UpsertFuelTaxSchema>

export interface FuelPricing {
  /** Exactly what the member paid, in the currency they paid it in. */
  originalPaidTotal: number | null
  /** Their paid price per litre, same currency. */
  originalPricePerLitre: number | null
  /**
   * The EUR-per-litre figure the expense claim and the reference-price report
   * compare against: the paid price converted to EUR, plus Finnish fuel tax
   * where it applies.
   */
  taxAdjustedPricePerLitre: number | null
  /** The configuration that produced it, so a later rate change can't rewrite history. */
  fuelTaxYear: number | null
  fuelTaxRateApplied: number | null
}

/** Four decimals is what a per-litre price is stored/displayed at. */
export const round4 = (v: number) => Math.round(v * 10_000) / 10_000

/**
 * Turns "what the member paid" into "what the club compares and reimburses".
 *
 * Two things happen, in this order:
 *
 *   - **Conversion.** A non-EUR purchase is multiplied by its rate. Everything
 *     downstream — the reference-price report, the claim's balanced price cap —
 *     works in EUR, so a purchase in SEK has to arrive as EUR before any
 *     comparison is meaningful.
 *   - **Finnish fuel tax.** Added when the record is *not* flagged tax-included
 *     and a rate is configured for that year and fuel type. This is why the
 *     flag exists: Jet A-1 bought abroad already has tax in the price, and
 *     adding it again would overstate the cost. Jet A-1 bought in Finland does
 *     not, and the club owes it.
 *
 * A fuel type with no configured rate is simply unadjusted, which is what makes
 * "other fuel types unaffected" fall out of the general rule rather than needing
 * a special case: only Jet A-1 has a rate in practice.
 *
 * The result is meant to be **written onto the record** when it is linked to a
 * claim, not recomputed on read. `accts.fuel_tax` is editable, and a rate
 * corrected in March must not move a claim that was approved in February.
 */
export const computeLiquidFuelPricing = (input: {
  quantityLitres: number
  totalCost: number | null | undefined
  ccy?: string | null
  fxRate?: number | null
  taxIncludedAbroad: boolean
  recordedAt: string | Date
  /** The `accts.fuel_tax` rate in force, or null when none is configured. */
  taxRateEurPerLitre?: number | null
}): FuelPricing => {
  // The Finnish tax year follows the club's own calendar, not UTC's: a
  // fuelling just after local midnight but before UTC midnight (or vice versa)
  // must freeze the rate for the year the club actually sees it in.
  const year = toHelsinki(input.recordedAt).year()
  const rate = input.taxIncludedAbroad ? null : (input.taxRateEurPerLitre ?? null)

  if (input.totalCost == null || input.quantityLitres <= 0) {
    // No cost is a legitimate state — EFNU fuelling is invoiced to the club —
    // so this is not an error, just nothing to price. The tax configuration is
    // still recorded: it is what *would* have applied, and a reader can tell
    // "not priced" from "priced at zero tax".
    return {
      originalPaidTotal: input.totalCost ?? null,
      originalPricePerLitre: null,
      taxAdjustedPricePerLitre: null,
      fuelTaxYear: rate == null ? null : year,
      fuelTaxRateApplied: rate,
    }
  }

  const paidPerLitre = round4(input.totalCost / input.quantityLitres)
  const toEur = (input.ccy ?? 'EUR') === 'EUR' ? 1 : (input.fxRate ?? 1)
  const eurPerLitre = paidPerLitre * toEur

  return {
    originalPaidTotal: round4(input.totalCost),
    originalPricePerLitre: paidPerLitre,
    taxAdjustedPricePerLitre: round4(eurPerLitre + (rate ?? 0)),
    fuelTaxYear: rate == null ? null : year,
    fuelTaxRateApplied: rate,
  }
}

// ─── Oil canister inventory ───────────────────────────────────────────────────

export const OilCanisterSchema = AuditableSchema.extend({
  canisterId: z.string().guid(),
  clubCanisterRef: z.string(),
  batchNumber: z.string(),
  manufacturingDate: z.string().nullable(),
  make: z.string(),
  modelViscosity: z.string(),
  aircraftRegistration: z.string(),
  initialLitres: z.number().nullable(),
  remainingLitres: z.number().nullable(),
  isOpened: z.boolean(),
  openedAt: z.string().datetime().nullable(),
  isEmpty: z.boolean(),
  emptiedAt: z.string().datetime().nullable(),
  /** The QR code stuck on it, when one has been assigned. */
  qrCode: z.string().nullable(),
})
export type OilCanister = z.infer<typeof OilCanisterSchema>

export const CreateOilCanisterSchema = z.object({
  /**
   * Free text. The club's answer on #1119 was that `MIK <make> <YY>/<seq>` is
   * their format but the admin has the canister in hand, so the UI pre-fills it
   * rather than the server imposing it — see `suggestCanisterRef`.
   */
  clubCanisterRef: z.string().trim().min(1).max(50),
  batchNumber: z.string().trim().min(1).max(100),
  manufacturingDate: z.string().date().optional(),
  make: z.string().trim().min(1).max(100),
  modelViscosity: z.string().trim().min(1).max(100),
  /** Permanent from here on — enforced by a trigger, not just this route. */
  aircraftRegistration: z.string().min(1).max(10),
  initialLitres: z.number().positive().max(100).optional(),
})
export type CreateOilCanisterRequest = z.infer<typeof CreateOilCanisterSchema>

/**
 * Everything an admin may change after creation. `aircraftRegistration` is
 * absent because it is permanent: an oil record already filed against the
 * canister names the aircraft the oil went into, so moving it would rewrite
 * history.
 */
export const UpdateOilCanisterSchema = z.object({
  clubCanisterRef: z.string().trim().min(1).max(50).optional(),
  batchNumber: z.string().trim().min(1).max(100).optional(),
  manufacturingDate: z.string().date().nullable().optional(),
  make: z.string().trim().min(1).max(100).optional(),
  modelViscosity: z.string().trim().min(1).max(100).optional(),
  initialLitres: z.number().positive().max(100).nullable().optional(),
  remainingLitres: z.number().min(0).max(100).nullable().optional(),
  isOpened: z.boolean().optional(),
  isEmpty: z.boolean().optional(),
})
export type UpdateOilCanisterRequest = z.infer<typeof UpdateOilCanisterSchema>

export const OilCanisterFilterSchema = z.object({
  aircraftRegistration: z.string().optional(),
  /** Default view is available stock; empties are history. */
  includeEmpty: z.coerce.boolean().default(false),
})
export type OilCanisterFilter = z.infer<typeof OilCanisterFilterSchema>

/**
 * The club's canister label, `MIK <make> <YY>/<seq>` — e.g. `MIK AS 25/3`.
 *
 * A suggestion for the admin form, never a server-side identity: the sequence
 * is "how many of this make exist already", which is only correct at the moment
 * the form is opened, and the club may well write something else on the tin.
 */
export const suggestCanisterRef = (make: string, existingCount: number, year: number): string => {
  const initials =
    make
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0]!.toUpperCase())
      .join('')
      .slice(0, 3) || 'OIL'
  return `MIK ${initials} ${String(year % 100).padStart(2, '0')}/${existingCount + 1}`
}

// ─── QR codes and deep links ──────────────────────────────────────────────────

export const QrCodeSchema = AuditableSchema.extend({
  qrId: z.string().guid(),
  code: z.string(),
  batchId: z.string().guid().nullable(),
  batchLabel: z.string().nullable(),
  targetType: z.nativeEnum(QrTargetType).nullable(),
  targetId: z.string().nullable(),
  /** Human-readable target, resolved for the admin list. */
  targetLabel: z.string().nullable(),
  assignedAt: z.string().datetime().nullable(),
  assignedBy: z.string().nullable(),
})
export type QrCode = z.infer<typeof QrCodeSchema>

export const QrBatchSchema = AuditableSchema.extend({
  batchId: z.string().guid(),
  label: z.string(),
  codeCount: z.number().int(),
  assignedCount: z.number().int(),
})
export type QrBatch = z.infer<typeof QrBatchSchema>

export const CreateQrBatchSchema = z.object({
  label: z.string().trim().min(1).max(100),
  /**
   * Capped at 96 — eight A4 sheets of twelve. Generating identities is cheap,
   * but each one is a permanent row that somebody has to print and stick down.
   */
  count: z.number().int().positive().max(96),
})
export type CreateQrBatchRequest = z.infer<typeof CreateQrBatchSchema>

export const AssignQrCodeSchema = z.object({
  targetType: z.nativeEnum(QrTargetType),
  // Both target tables (liquid.oil_canister, liquid.fuel_station) use a UUID
  // primary key -- a malformed id should be a clean 400 here, not a Postgres
  // "invalid input syntax for type uuid" surfacing as a 500.
  targetId: z.string().guid(),
})
export type AssignQrCodeRequest = z.infer<typeof AssignQrCodeSchema>

export const QrCodeFilterSchema = z.object({
  batchId: z.string().guid().optional(),
  /** `true` for codes still waiting to be stuck on something. */
  unassignedOnly: z.coerce.boolean().default(false),
})
export type QrCodeFilter = z.infer<typeof QrCodeFilterSchema>

export enum QrResolveStatus {
  /** Assigned: `prefill` carries the reporting context. */
  ASSIGNED = 'ASSIGNED',
  /** Not yet assigned, and the scanner is a liquid admin who may assign it. */
  UNASSIGNED_ASSIGNABLE = 'UNASSIGNED_ASSIGNABLE',
  /** Not yet assigned, and the scanner may not assign it. */
  UNASSIGNED = 'UNASSIGNED',
}

/**
 * What a scanned QR code prefills. Every field is optional because a fuel-pump
 * code knows the airport and fuel type but not the aircraft, while a canister
 * code knows the aircraft but has no airport at all.
 */
export const LiquidPrefillSchema = z.object({
  liquidType: z.nativeEnum(LiquidType),
  aircraftRegistration: z.string().optional(),
  airport: z.string().optional(),
  fuelType: z.string().optional(),
  providerId: z.number().int().optional(),
  providerName: z.string().optional(),
  oilSource: z.nativeEnum(OilSource).optional(),
  oilCanisterId: z.string().guid().optional(),
  oilCanisterRef: z.string().optional(),
  /** What the member sees above the form, e.g. "OH-STL · EFNU · Jet A-1". */
  label: z.string(),
})
export type LiquidPrefill = z.infer<typeof LiquidPrefillSchema>

export const QrResolveResponseSchema = z.object({
  status: z.nativeEnum(QrResolveStatus),
  code: z.string(),
  prefill: LiquidPrefillSchema.optional(),
  /** Present for UNASSIGNED_ASSIGNABLE, so the admin console can list targets. */
  qr: QrCodeSchema.optional(),
})
export type QrResolveResponse = z.infer<typeof QrResolveResponseSchema>

/**
 * The deep link a QR image encodes.
 *
 * Only the code goes in — never the resolved target. That is what lets an
 * identity be printed today and assigned next month, and what stops a
 * re-targeted code (which the database forbids anyway) from being a silent
 * mismatch between sticker and destination.
 */
export const qrScanPath = (code: string): string => `/liquid/scan/${encodeURIComponent(code)}`

/** The reporting form's own deep link, for a prefill that isn't behind a QR code. */
export const liquidReportPath = (
  params: Partial<Record<'ac' | 'apt' | 'fuel' | 'canister' | 'type', string>>,
): string => {
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => !!entry[1]),
  ).toString()
  return query ? `/liquid/new?${query}` : '/liquid/new'
}

// ─── Fuel price comparison report ─────────────────────────────────────────────

/**
 * Reference prices arrive as repeated `reference=<fuel type>:<price>` params —
 * one per fuel type, entered at runtime rather than stored, because the point of
 * the report is "compare what we paid against what EFNU costs *today*".
 *
 * A repeated scalar param rather than a nested object because axios serialises
 * arrays as repeated bare keys, which Express's `qs` parser hands back as a
 * string or an array of strings and nothing else.
 */
export const ReferencePriceSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value, ctx) => {
    const raw = value == null ? [] : Array.isArray(value) ? value : [value]
    const prices: Record<string, number> = {}
    for (const entry of raw) {
      const separator = entry.lastIndexOf(':')
      const fuelType = separator > 0 ? entry.slice(0, separator).trim() : ''
      const price = Number(entry.slice(separator + 1))
      if (!fuelType || !Number.isFinite(price) || price <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Reference price must be "<fuel type>:<price>", got "${entry}".`,
        })
        continue
      }
      prices[fuelType] = price
    }
    return prices
  })

export const FuelPriceComparisonQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  reference: ReferencePriceSchema,
  aircraftRegistration: z.string().optional(),
})
export type FuelPriceComparisonQuery = z.infer<typeof FuelPriceComparisonQuerySchema>

export const FuelPriceComparisonRowSchema = z.object({
  recordId: z.string().guid(),
  recordedAt: z.string().datetime(),
  aircraftRegistration: z.string(),
  memberId: z.string(),
  airport: z.string().nullable(),
  airportName: z.string().nullable(),
  fuelType: z.string().nullable(),
  providerName: z.string().nullable(),
  quantityLitres: z.number(),
  totalCost: z.number().nullable(),
  ccy: z.string(),
  taxIncludedAbroad: z.boolean(),
  /** As paid, in the purchase currency. */
  paidPricePerLitre: z.number().nullable(),
  /** EUR per litre including any Finnish fuel tax — the comparable figure. */
  taxAdjustedPricePerLitre: z.number().nullable(),
  /** Frozen on the record at claim time; null while the record is unclaimed. */
  storedTaxAdjustedPricePerLitre: z.number().nullable(),
  referencePrice: z.number().nullable(),
  /**
   * False when there is nothing to compare: an EFNU record with no cost, or a
   * fuel type the user gave no reference price for. Such rows are still listed —
   * silently dropping them would read as "nothing was over the reference".
   */
  comparable: z.boolean(),
  exceedsReference: z.boolean(),
  /** Positive when over the reference; null when not comparable. */
  deltaPerLitre: z.number().nullable(),
  expenseClaimId: z.string().guid().nullable(),
  flightLogId: z.string().nullable(),
})
export type FuelPriceComparisonRow = z.infer<typeof FuelPriceComparisonRowSchema>

export const FuelPriceComparisonResponseSchema = z.object({
  rows: z.array(FuelPriceComparisonRowSchema),
  summary: z.object({
    total: z.number().int(),
    comparable: z.number().int(),
    exceeding: z.number().int(),
    /** Litres bought above the reference price, summed. */
    exceedingLitres: z.number(),
    /** What those litres cost over the reference, in EUR. */
    excessCostEur: z.number(),
  }),
})
export type FuelPriceComparisonResponse = z.infer<typeof FuelPriceComparisonResponseSchema>

/**
 * One row's comparison. Pulled out of the query so the arithmetic — which is the
 * part the club will argue about — is testable without a database.
 *
 * The comparison uses the *stored* tax-adjusted price when the record has one,
 * because that is the figure the claim was settled on; an unclaimed record is
 * compared on a live calculation instead. Mixing the two would make a record's
 * position in the report shift the moment somebody claimed it.
 */
export const compareToReferencePrice = (input: {
  taxAdjustedPricePerLitre: number | null
  storedTaxAdjustedPricePerLitre: number | null
  referencePrice: number | null | undefined
}): Pick<FuelPriceComparisonRow, 'comparable' | 'exceedsReference' | 'deltaPerLitre'> => {
  const effective = input.storedTaxAdjustedPricePerLitre ?? input.taxAdjustedPricePerLitre
  if (effective == null || input.referencePrice == null) {
    return { comparable: false, exceedsReference: false, deltaPerLitre: null }
  }
  const delta = round4(effective - input.referencePrice)
  return { comparable: true, exceedsReference: delta > 0, deltaPerLitre: delta }
}

// ─── Dashboard prompt ─────────────────────────────────────────────────────────

/**
 * "Add a new dashboard widget that suggests a member create an expense claim if
 * they have recorded adding fuel with own / other type" (#1119 comment).
 *
 * Only fuel the member actually paid for is claimable, which is exactly the set
 * with a total cost and no claim yet.
 */
export const ClaimableFuelSummarySchema = z.object({
  count: z.number().int(),
  totalCostEur: z.number(),
  oldestRecordedAt: z.string().datetime().nullable(),
})
export type ClaimableFuelSummary = z.infer<typeof ClaimableFuelSummarySchema>
