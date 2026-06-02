import { z } from 'zod'

export const EventSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  isPublic: z.boolean(),
  createdAt: z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
})

export type ClubEvent = z.infer<typeof EventSchema>

const EventDateTimeSchema = z.string().datetime({ offset: true })

const EventWriteSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  startTime: EventDateTimeSchema,
  endTime: EventDateTimeSchema,
  isPublic: z.boolean().optional(),
})

const afterStart = (data: { startTime: string; endTime: string }) =>
  new Date(data.endTime) > new Date(data.startTime)

export const EventCreateSchema = EventWriteSchema.extend({
  isPublic: z.boolean().default(false),
}).refine(afterStart, { message: 'endTime must be after startTime', path: ['endTime'] })

export type EventCreate = z.infer<typeof EventCreateSchema>

export const EventUpdateSchema = EventWriteSchema.partial().superRefine((data, ctx) => {
  if (
    data.startTime &&
    data.endTime &&
    !afterStart(data as { startTime: string; endTime: string })
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'endTime must be after startTime',
      path: ['endTime'],
    })
  }
})

export type EventUpdate = z.infer<typeof EventUpdateSchema>

export const EventListQuerySchema = z.object({
  from: EventDateTimeSchema.optional(),
  to: EventDateTimeSchema.optional(),
})

export interface EventListResponse {
  events: ClubEvent[]
}

export interface EventFilters {
  from?: string
  to?: string
  publicOnly?: boolean
  limit?: number
  offset?: number
}
