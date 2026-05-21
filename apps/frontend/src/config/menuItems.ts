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
      MIKPermissions.FUEL_PRICES_USER,
      MIKPermissions.FUEL_PRICES_ADMIN,
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
      {
        path: 'fuel-prices',
        label: 'header.fuelPrices',
        requiredRoles: [
          MIKPermissions.FUEL_PRICES_USER,
          MIKPermissions.FUEL_PRICES_ADMIN,
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
        path: 'members/trash',
        label: 'header.membersTrash',
        requiredRoles: [MIKPermissions.MEMBER_ADMIN],
        adminModeOnly: true,
      },
      {
        path: 'instructor-status',
        label: 'header.instructorStatus',
        requiredRoles: [MIKPermissions.MEMBER_ADMIN],
        adminModeOnly: true,
      },
      {
        path: 'documents',
        label: 'header.documents',
      },
      {
        path: '/exams',
        label: 'header.exams',
        requiredRoles: [MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN],
      },
      {
        path: 'billing',
        label: 'header.billing',
      },
      {
        path: 'stats',
        label: 'header.stats',
      },
    ],
  },
  {
    path: '/shop',
    label: 'header.shop',
    requiredRoles: [MIKPermissions.STORE_USER, MIKPermissions.STORE_ADMIN],
    subItems: [
      { path: '', label: 'header.shopBrowse' },
      { path: 'cart', label: 'header.cart' },
      { path: 'orders', label: 'header.myOrders' },
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
      { label: 'invoicing.tabs.taxReport', path: 'tax-report' },
      { label: 'invoicing.tabs.traficomReport', path: 'traficom-report' },
      { label: 'invoicing.tabs.upliftReport', path: 'uplift-report' },
      {
        label: 'invoicing.tabs.instructorWorktime',
        path: 'instructor-worktime',
      },
    ],
  },
  {
    path: '/admin',
    label: 'header.admin',
    requiredRoles: [
      MIKPermissions.OUTBOX_ADMIN,
      MIKPermissions.MEMBER_ADMIN,
      MIKPermissions.EXAM_ADMIN,
    ],
    adminModeOnly: true,
    subItems: [
      {
        label: 'header.outbox',
        path: 'outbox',
        requiredRoles: [MIKPermissions.OUTBOX_ADMIN],
        adminModeOnly: true,
      },
      {
        label: 'header.nonRenewals',
        path: 'non-renewals',
        requiredRoles: [MIKPermissions.MEMBER_ADMIN],
        adminModeOnly: true,
      },
      {
        label: 'header.shopAdmin',
        path: 'shop',
        requiredRoles: [MIKPermissions.STORE_ADMIN],
        adminModeOnly: true,
      },
      {
        label: 'header.examsAdmin',
        path: 'exams',
        requiredRoles: [MIKPermissions.EXAM_ADMIN],
        adminModeOnly: true,
      },
      {
        label: 'header.notificationBanner',
        path: 'notification-banner',
        requiredRoles: [MIKPermissions.MEMBER_ADMIN],
        adminModeOnly: true,
      },
    ],
  },
]
