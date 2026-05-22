import { z } from 'zod'

export const NotificationBannerSeverity = z.enum(['info', 'warning', 'error', 'success'])
export type NotificationBannerSeverity = z.infer<typeof NotificationBannerSeverity>

export const NotificationBannerSchema = z.object({
  enabled: z.boolean(),
  message: z.string().nullable(),
  severity: NotificationBannerSeverity,
})

export type NotificationBanner = z.infer<typeof NotificationBannerSchema>

export const UpdateNotificationBannerSchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(500).nullable(),
  severity: NotificationBannerSeverity,
})

export type UpdateNotificationBanner = z.infer<typeof UpdateNotificationBannerSchema>
