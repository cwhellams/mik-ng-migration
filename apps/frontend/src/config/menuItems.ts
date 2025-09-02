import { MIKPermissions } from '@backend/routes/members/models'
import { ReactNode } from 'react'

export interface MenuItem {
  label: string
  path: string
  translationKey: string
  icon?: ReactNode
  requiredRoles?: MIKPermissions[]
}

export const menuItems: MenuItem[] = [
  {
    label: 'Schedule',
    path: '/schedule',
    translationKey: 'header.schedule',
  },
  {
    label: 'Flight Logs',
    path: '/flight-logs',
    translationKey: 'header.flightLogs',
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
    label: 'Accounting',
    path: '/accounting',
    translationKey: 'header.accounts',
    requiredRoles: [MIKPermissions.INVOICING_ADMIN],
  },
]
