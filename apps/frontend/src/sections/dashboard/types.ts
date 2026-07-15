export interface DashboardComponent {
  id: string
  visible: boolean
  order: number
}

export interface DashboardSettings {
  components: DashboardComponent[]
}

export interface DashboardComponentMetadata {
  id: string
  label: string
  description: string
  icon: string
}

/**
 * Components that are always visible and excluded from user settings
 * These are critical alerts/banners that should always be shown
 */
export const ALWAYS_VISIBLE_COMPONENTS = [
  'reservationsSuspended',
  'overdueInvoice',
  'pendingReview',
  'expiryWarning',
] as const

/**
 * Metadata for all available dashboard components
 */
export const DASHBOARD_COMPONENT_METADATA: DashboardComponentMetadata[] = [
  {
    id: 'reservationsSuspended',
    label: 'Reservations Suspended',
    description: 'Banner when reservations are suspended',
    icon: '🚫',
  },
  {
    id: 'overdueInvoice',
    label: 'Overdue Invoice',
    description: 'Alert for overdue invoices',
    icon: '💰',
  },
  {
    id: 'pendingReview',
    label: 'Pending Review',
    description: 'Membership pending approval banner',
    icon: '⏳',
  },

  {
    id: 'equipmentFee',
    label: 'Equipment Fee',
    description: 'Equipment fee notifications',
    icon: '🛠️',
  },
  {
    id: 'weather',
    label: 'Weather Widget',
    description: 'EFNU ATIS weather information',
    icon: '🌤️',
  },
  {
    id: 'events',
    label: 'Club Events',
    description: 'Upcoming and recent club events',
    icon: '📆',
  },
  {
    id: 'bookingUser',
    label: 'Booking Dashboard',
    description: 'User booking information and calendar',
    icon: '📅',
  },
  {
    id: 'flightLogUser',
    label: 'Flight Log Dashboard',
    description: 'User flight log information',
    icon: '✈️',
  },
  {
    id: 'memberAdmin',
    label: 'Member Admin',
    description: 'Member administration panel',
    icon: '👥',
  },
  {
    id: 'flightLogAdmin',
    label: 'Flight Log Admin',
    description: 'Flight log administration panel',
    icon: '📋',
  },
  {
    id: 'dtoInstructor',
    label: 'DTO Verification',
    description: 'DTO flights awaiting instructor verification',
    icon: '🛩️',
  },
  {
    id: 'expenseAdmin',
    label: 'Expense Claims',
    description: 'Expense claims awaiting treasurer/chairman review',
    icon: '🧾',
  },
]

/**
 * Get metadata for customizable components only (excludes always-visible components)
 */
export const getCustomizableComponentMetadata = (): DashboardComponentMetadata[] => {
  const alwaysVisibleComponentIds: readonly string[] = ALWAYS_VISIBLE_COMPONENTS
  return DASHBOARD_COMPONENT_METADATA.filter(
    (metadata) => !alwaysVisibleComponentIds.includes(metadata.id),
  )
}
