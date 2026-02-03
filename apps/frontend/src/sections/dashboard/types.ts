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
  'profileUpdateRequired',
  'reservationsSuspended',
  'overdueInvoice',
  'pendingReview',
] as const

/**
 * Metadata for all available dashboard components
 */
export const DASHBOARD_COMPONENT_METADATA: DashboardComponentMetadata[] = [
  {
    id: 'profileUpdateRequired',
    label: 'Profile Update Required',
    description: 'Alert when profile information needs updating',
    icon: '⚠️',
  },
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
]

/**
 * Get metadata for customizable components only (excludes always-visible components)
 */
export const getCustomizableComponentMetadata =
  (): DashboardComponentMetadata[] => {
    return DASHBOARD_COMPONENT_METADATA.filter(
      (metadata) => !ALWAYS_VISIBLE_COMPONENTS.includes(metadata.id as any)
    )
  }
