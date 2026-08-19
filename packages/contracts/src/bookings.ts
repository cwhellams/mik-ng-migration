import { z } from 'zod'
import {
  AuditableSchema,
  BigintAsString,
  BooleanSchema,
  nullableTrimmedString,
  optionalTrimmedString,
  UpsertSchema,
} from './schema.ts'

export enum BookingType {
  MAINTENANCE = 'MAINTENANCE',
  PRIVATE = 'PRIVATE',
  TRAINING = 'TRAINING',
}

export enum BookingStatus {
  TENTATIVE = 'TENTATIVE',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

export enum CancellationReason {
  IM_SAFE_CHECKLIST = 'IM_SAFE_CHECKLIST',
  AIRCRAFT_TECHNICAL = 'AIRCRAFT_TECHNICAL',
  WEATHER_DEPARTURE = 'WEATHER_DEPARTURE',
  WEATHER_ENROUTE = 'WEATHER_ENROUTE',
  WEATHER_DESTINATION = 'WEATHER_DESTINATION',
  PERSONAL_CONFLICT = 'PERSONAL_CONFLICT',
  OTHER = 'OTHER',
  PREFER_NOT_DISCLOSE = 'PREFER_NOT_DISCLOSE',
}

export const BookingSchema = AuditableSchema.extend({
  bookingId: z.string().readonly(),
  memberId: z.string(),
  member: z
    .object({
      firstName: z.string().optional().readonly(),
      lastName: z.string().optional().readonly(),
      phoneNumber: z.string().optional().nullable().readonly(),
    })
    .optional()
    .readonly(),
  instructorMemberId: z.string().nullable().optional(),
  instructor: z
    .object({
      firstName: z.string().optional().readonly(),
      lastName: z.string().optional().readonly(),
      phoneNumber: z.string().optional().nullable().readonly(),
    })
    .optional()
    .nullable()
    .readonly(),
  registration: z.string(),
  type: z.nativeEnum(BookingType),
  status: z.nativeEnum(BookingStatus),
  startTimeEpoch: BigintAsString,
  startTime: z.string().datetime(),
  endTimeEpoch: BigintAsString,
  endTime: z.string().datetime(),
  description: optionalTrimmedString(z.string().max(500)),
  calendarSequence: z.number().int().default(0),
  cancelledBy: z.string().nullable().nullish(),
  cancelledAt: z.string().datetime().nullish(),
  cancellationReason: z.nativeEnum(CancellationReason).nullable().nullish(),
  cancellationNote: nullableTrimmedString(z.string().max(500)).nullish(),
  createdByName: z.string().nullish(),
  updatedByName: z.string().nullish(),
  cancelledByName: z.string().nullish(),
})

export type Booking = z.infer<typeof BookingSchema>

export const BookingUpsertSchema = UpsertSchema(BookingSchema)
  .pick({
    memberId: true,
    registration: true,
    type: true,
    status: true,
    startTimeEpoch: true,
    endTimeEpoch: true,
    description: true,
    instructorMemberId: true,
  })
  .strip()

export type BookingUpsertRequest = z.infer<typeof BookingUpsertSchema>

// booking list endpoint

export const BookingFiltersSchema = z
  .object({
    bookingId: z.string().optional(),
    memberId: z.string().optional(),
    registration: z.union([z.string(), z.array(z.string())]).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    showCancelled: BooleanSchema.optional(),
    limit: z.coerce.number().int().optional(),
    orderLatestFirst: BooleanSchema.optional(),
    exclusiveStartEnd: BooleanSchema.optional(),
    excludeBookingId: z.string().optional(),
  })
  .strict()

export type BookingFilters = z.infer<typeof BookingFiltersSchema>

export const BookingListResponseSchema = z.object({
  bookings: z.array(BookingSchema),
  previous: BookingSchema.optional(),
  next: BookingSchema.optional(),
})

export type BookingListResponse = z.infer<typeof BookingListResponseSchema>

export const CancellationRequestSchema = z.object({
  reason: z.nativeEnum(CancellationReason),
  note: z.string().max(500).optional(),
})

export type CancellationRequest = z.infer<typeof CancellationRequestSchema>

export const TransferBookingSchema = z.object({
  newMemberId: z.string().min(1),
})

export type TransferBookingRequest = z.infer<typeof TransferBookingSchema>
