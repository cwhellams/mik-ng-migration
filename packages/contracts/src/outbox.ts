import { z } from 'zod'

export const OutboxFiltersSchema = z.object({
  status: z.string().optional(),
  event_type: z.string().optional(),
  created_from: z
    .string()
    .datetime({ message: 'created_from must be an ISO 8601 datetime string' })
    .optional(),
  created_to: z
    .string()
    .datetime({ message: 'created_to must be an ISO 8601 datetime string' })
    .optional(),
  processed_from: z
    .string()
    .datetime({ message: 'processed_from must be an ISO 8601 datetime string' })
    .optional(),
  processed_to: z
    .string()
    .datetime({ message: 'processed_to must be an ISO 8601 datetime string' })
    .optional(),
})

export type OutboxFilters = z.infer<typeof OutboxFiltersSchema>

export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED' | 'SKIPPED'

export type OutboxItem = {
  id: string
  event_type: string
  status: OutboxStatus
  payload: unknown
  created_at_utc: string
  updated_at_utc: string
  processed_at: string | null
  error_message: string | null
}

export type OutboxListResponse = {
  items: OutboxItem[]
}
