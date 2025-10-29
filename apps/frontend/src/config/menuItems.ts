import { MIKPermissions } from '@backend/routes/members/models'
import { ReactNode } from 'react'

export interface MenuItem {
  label: string
  path: string
  translationKey: string
  icon?: ReactNode
  requiredRoles?: MIKPermissions[]
  adminModeOnly?: boolean
}

export const menuItems: MenuItem[] = [
  {
    label: 'Schedule',
    path: '/schedule',
    translationKey: 'header.schedule',
    requiredRoles: [MIKPermissions.BOOKING_USER, MIKPermissions.BOOKING_ADMIN],
  },
  {
    label: 'Flight Logs',
    path: '/flight-logs',
    translationKey: 'header.flightLogs',
    requiredRoles: [
      MIKPermissions.FLIGHTLOG_USER,
      MIKPermissions.FLIGHTLOG_ADMIN,
    ],
  },
  {
    label: 'Mass & Balance',
    path: '/mass-balance',
    translationKey: 'header.massBalance',
  },
  {
    label: 'Aircraft',
    path: '/aircrafts',
    translationKey: 'header.aircrafts',
    requiredRoles: [
      MIKPermissions.AIRCRAFT_USER,
      MIKPermissions.AIRCRAFT_ADMIN,
    ],
  },
  {
    label: 'Billing',
    path: '/billing',
    translationKey: 'header.billing',
  },
  {
    label: 'Members',
    path: '/members',
    translationKey: 'header.members',
  },
  {
    label: 'Access codes',
    path: '/access-codes',
    translationKey: 'header.accessCodes',
    requiredRoles: [
      MIKPermissions.ACCESS_CODES_USER,
      MIKPermissions.ACCESS_CODES_ADMIN,
    ],
  },
  {
    label: 'Accounting',
    path: '/accounting/dashboard',
    translationKey: 'header.accounts',
    requiredRoles: [MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
  },
]
