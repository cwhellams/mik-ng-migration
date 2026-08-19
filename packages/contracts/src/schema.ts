import { z } from 'zod'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'

dayjs.extend(customParseFormat)

// common audit fields
export const AuditableSchema = z
  .object({
    createdAt: z.string().datetime(),
    createdBy: z.string(),
    updatedAt: z.string().datetime(),
    updatedBy: z.string(),
  })
  .strict()

// object with auditable fields
export type Auditable = z.infer<typeof AuditableSchema>

// audit fields are not used from incoming requests
export type Upsert<T extends Auditable> = Partial<
  Pick<T, 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>
> &
  Omit<T, 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>

// audit fields are not accepted on incoming create or update requests.
//
// Note that AuditableSchema is .strict(), and .omit() preserves that: a request
// body carrying createdAt/updatedBy/etc. is *rejected* with "Unrecognized keys",
// not quietly stripped. That is deliberate — it means a client cannot believe it
// set an audit field — but it does mean a naive read-modify-write that posts a
// fetched entity straight back will 400. See test/schema.test.ts.
//
// The `as T` keeps the schema's TypeScript shape unchanged (so callers can
// still chain .extend() or the flight-log-style .pick() to select fields),
// but it means TypeScript still believes createdAt/createdBy/updatedAt/
// updatedBy are present. That's harmless for .extend()/.pick() — they only
// add or select fields — but a further .omit() to drop fields beyond the
// audit ones would inherit the same false belief and produce a type that
// still requires the (already rejected) audit fields. Domains that
// need to omit additional fields should omit everything — audit fields
// included — in one call on the original schema instead of chaining off
// UpsertSchema().
export const UpsertSchema = <T extends z.ZodObject<typeof AuditableSchema.shape>>(schema: T) =>
  schema.omit({
    createdAt: true,
    createdBy: true,
    updatedAt: true,
    updatedBy: true,
  }) as T

export const BooleanSchema = z
  .enum(['true', 'false'])
  .nullish()
  .transform((v) => v === 'true')

export const BigintAsString = z.string().regex(/^\d+$/)

// Shared by nullableTrimmedString/optionalTrimmedString: trims a string value,
// folding whitespace-only input into `empty`. Non-string, non-null input passes
// through unchanged so the wrapped schema's own type check rejects it, rather
// than this preprocessing step silently coercing it to `empty`.
const trimToEmpty = <T>(v: unknown, empty: T) => {
  if (v == null) return empty
  if (typeof v !== 'string') return v
  const trimmed = v.trim()
  return trimmed === '' ? empty : trimmed
}

// Trims free text on parse. For a field whose "no content" state is already null,
// a whitespace-only submission folds into null instead of storing padding or an
// empty string that a NOT NULL / truthiness check downstream would treat as content.
export const nullableTrimmedString = (schema: z.ZodString = z.string()) =>
  z.preprocess((v) => trimToEmpty(v, null), schema.nullable())

// Same, but folds into undefined for fields declared .optional() instead of .nullable().
export const optionalTrimmedString = (schema: z.ZodString = z.string()) =>
  z.preprocess((v) => trimToEmpty(v, undefined), schema.optional())

// {en, fi, sv} text, used everywhere a field is translated rather than free text
export const LocalisedSchema = z.object({
  en: z.string().trim(),
  fi: z.string().trim(),
  sv: z.string().trim(),
})
export type Localised = z.infer<typeof LocalisedSchema>

// YYYY-MM-DD that is also a real calendar date (rejects e.g. 2024-02-30)
const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((val) => dayjs(val, 'YYYY-MM-DD', true).isValid(), {
    message: 'Invalid calendar date',
  })

// startDate/endDate pair shared by report and history filters
export const DateRangeSchema = z.object({
  startDate: CalendarDateSchema,
  endDate: CalendarDateSchema,
})

// Attaches the two checks every report filter re-implemented by hand: endDate
// can't be in the future, and startDate can't be after endDate. Checked with
// a single superRefine (rather than two chained .refine() calls) so the
// second check short-circuits when the first already failed — matching the
// deleted per-route if/return code, which never reported both at once.
export const withDateRangeCheck = <T extends z.ZodType<{ startDate: string; endDate: string }>>(
  schema: T,
) =>
  schema.superRefine((data, ctx) => {
    if (dayjs(data.endDate).isAfter(dayjs(), 'day')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date cannot be in the future.',
        path: ['endDate'],
      })
      return
    }
    if (dayjs(data.startDate).isAfter(dayjs(data.endDate), 'day')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start date cannot be after end date.',
        path: ['startDate'],
      })
    }
  })

// page/pageSize pagination used by admin list endpoints
export const PaginationSchema = (defaultPageSize: number, maxPageSize = 100) =>
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
  })

// limit/offset pagination for list-and-fetch-more endpoints that always want a
// fixed page size. `maxLimit` closes the previously-unbounded gap so a caller
// can't ask for an unbounded result set.
export const LimitOffsetSchema = (defaultLimit: number, maxLimit = 1000) =>
  z.object({
    limit: z.coerce.number().int().positive().max(maxLimit).default(defaultLimit),
    offset: z.coerce.number().int().min(0).default(0),
  })

// Same pair, but optional — for endpoints that treat a missing limit as "no
// cap requested" rather than defaulting it.
export const OptionalLimitOffsetSchema = (maxLimit = 1000) =>
  z.object({
    limit: z.coerce.number().int().positive().max(maxLimit).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
