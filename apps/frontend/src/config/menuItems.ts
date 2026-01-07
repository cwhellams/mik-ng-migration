import { MIKPermissions } from '@backend/routes/members/models'
import { ReactNode } from 'react'

export interface MenuItem {
  path: string
  label: string
  icon?: ReactNode
  requiredRoles?: MIKPermissions[]
  adminModeOnly?: boolean
  subItems?: MenuItem[]
}

export const menuItems: MenuItem[] = [
  {
    path: '/schedule',
    label: 'header.schedule',
    requiredRoles: [MIKPermissions.BOOKING_USER, MIKPermissions.BOOKING_ADMIN],
  },
  {
    path: '/fly',
    label: 'header.fly',
    requiredRoles: [
      MIKPermissions.AIRCRAFT_USER,
      MIKPermissions.AIRCRAFT_ADMIN,
    ],
    subItems: [
      { label: 'header.aircrafts', path: '' },
      {
        path: 'mass-balance',
        label: 'header.massBalance',
      },
      {
        path: 'access-codes',
        label: 'header.accessCodes',
        requiredRoles: [
          MIKPermissions.ACCESS_CODES_USER,
          MIKPermissions.ACCESS_CODES_ADMIN,
        ],
      },
    ],
  },
  {
    path: '/logs',
    label: 'header.logs',
    requiredRoles: [
      MIKPermissions.FLIGHTLOG_USER,
      MIKPermissions.FLIGHTLOG_ADMIN,
    ],
    subItems: [
      {
        path: '',
        label: 'header.flightLogs',
      },
      {
        path: 'books',
        label: 'header.logbooks',
      },
      {
        path: 'occurrences',
        label: 'header.occurrences',
      },
    ],
  },
  {
    path: '/club',
    label: 'header.club',
    requiredRoles: [MIKPermissions.MEMBER, MIKPermissions.MEMBER_ADMIN],
    subItems: [
      {
        path: '',
        label: 'header.members',
      },
      {
        path: 'documents',
        label: 'header.documents',
      },
      {
        path: 'billing',
        label: 'header.billing',
      },
    ],
  },
  {
    path: '/accounting',
    label: 'header.accounts',
    requiredRoles: [MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
    subItems: [
      { label: 'invoicing.tabs.dashboard', path: '' },
      { label: 'invoicing.tabs.flights', path: 'invoicing' },
      { label: 'invoicing.tabs.items', path: 'items' },
      { label: 'invoicing.tabs.tools', path: 'tools' },
    ],
  },
]
