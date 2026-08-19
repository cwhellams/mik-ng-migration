import { z } from 'zod'
import { nullableTrimmedString } from './schema.ts'

export const NotificationBannerSeverity = z.enum(['info', 'warning', 'error', 'success'])
export type NotificationBannerSeverity = z.infer<typeof NotificationBannerSeverity>

export const NotificationBannerSchema = z.object({
  enabled: z.boolean(),
  message: nullableTrimmedString(z.string().max(500)),
  severity: NotificationBannerSeverity,
})

export type NotificationBanner = z.infer<typeof NotificationBannerSchema>

export const UpdateNotificationBannerSchema = z.object({
  enabled: z.boolean(),
  message: nullableTrimmedString(z.string().max(500)),
  severity: NotificationBannerSeverity,
})

export type UpdateNotificationBanner = z.infer<typeof UpdateNotificationBannerSchema>
