import { z } from 'zod'

/**
 * Schema for a single dashboard component configuration
 */
export const DashboardComponentSchema = z.object({
  id: z.string(),
  visible: z.boolean(),
  order: z.number().int().nonnegative(),
})

export type DashboardComponent = z.infer<typeof DashboardComponentSchema>

/**
 * Schema for dashboard settings
 */
export const DashboardSettingsSchema = z.object({
  components: z.array(DashboardComponentSchema),
})

export type DashboardSettings = z.infer<typeof DashboardSettingsSchema>

/**
 * Default dashboard component configuration
 * This defines all available dashboard components and their default order
 */
export const DEFAULT_DASHBOARD_COMPONENTS: DashboardComponent[] = [
  { id: 'profileUpdateRequired', visible: true, order: 0 },
  { id: 'reservationsSuspended', visible: true, order: 1 },
  { id: 'overdueInvoice', visible: true, order: 2 },
  { id: 'equipmentFee', visible: true, order: 3 },
  { id: 'pendingReview', visible: true, order: 4 },
  { id: 'weather', visible: true, order: 5 },
  { id: 'bookingUser', visible: true, order: 6 },
  { id: 'flightLogUser', visible: true, order: 7 },
  { id: 'memberAdmin', visible: true, order: 8 },
  { id: 'flightLogAdmin', visible: true, order: 9 },
]
