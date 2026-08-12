import { z } from 'zod'

export const PushSubscriptionRequestSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    auth: z.string().min(1),
    p256dh: z.string().min(1),
  }),
})

export type PushSubscriptionRequest = z.infer<typeof PushSubscriptionRequestSchema>

export const PushUnsubscribeRequestSchema = z.object({
  endpoint: z.string().min(1),
})
