import { MIKPermissions } from '@mik/contracts/members'
import { ReactNode } from 'react'

export interface MenuItem {
  path: string
  label: string
  icon?: ReactNode
  requiredRoles?: MIKPermissions[]
  adminModeOnly?: boolean
  /**
   * When true this item is hidden for users that only have the `dto.user`
   * permission (i.e. regular members) unless they have an active DTO syllabus
   * assignment.  Instructors and admins (`dto.instructor` / `dto.admin`) are
   * always shown the item regardless of this flag.
   */
  requiresActiveDtoSyllabus?: boolean
  /**
   * When true, this item requires either `dto.instructor` OR `dto.admin` with
   * sudo mode active.  Pure admins with sudo off will NOT see the item.
   */
  requiresDtoElevatedAccess?: boolean
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
        requiredRoles: [MIKPermissions.ACCESS_CODES_USER, MIKPermissions.ACCESS_CODES_ADMIN],
      },
      {
        path: 'fuel-prices',
        label: 'header.fuelPrices',
        requiredRoles: [MIKPermissions.FUEL_PRICES_USER, MIKPermissions.FUEL_PRICES_ADMIN],
      },
    ],
  },
  {
    path: '/logs',
    label: 'header.logs',
    requiredRoles: [MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN],
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
        path: 'events',
        label: 'header.events',
        requiredRoles: [MIKPermissions.MEMBER, MIKPermissions.MEMBER_ADMIN],
      },
      {
        path: 'meetings',
        label: 'header.meetings',
        requiredRoles: [MIKPermissions.MEETING_USER, MIKPermissions.MEETING_ADMIN],
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
      {
        path: 'ame-list',
        label: 'header.ameList',
        requiredRoles: [MIKPermissions.MEMBER, MIKPermissions.MEMBER_ADMIN],
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
    path: '/inventory',
    label: 'header.inventory',
    requiredRoles: [MIKPermissions.INVENTORY_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting',
    label: 'header.accounts',
    requiredRoles: [MIKPermissions.INVOICING_USER, MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
    subItems: [
      {
        label: 'invoicing.tabs.dashboard',
        path: '',
        requiredRoles: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'invoicing.tabs.flights',
        path: 'invoicing',
        requiredRoles: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'invoicing.tabs.items',
        path: 'items',
        requiredRoles: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'invoicing.tabs.tools',
        path: 'tools',
        requiredRoles: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'invoicing.tabs.taxReport',
        path: 'tax-report',
        requiredRoles: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'invoicing.tabs.traficomReport',
        path: 'traficom-report',
        requiredRoles: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'invoicing.tabs.upliftReport',
        path: 'uplift-report',
        requiredRoles: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'invoicing.tabs.instructorWorktime',
        path: 'instructor-worktime',
        requiredRoles: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'invoicing.tabs.unpaidOverdue',
        path: 'unpaid-overdue',
        requiredRoles: [MIKPermissions.INVOICING_USER, MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'header.expenseClaims',
        path: 'expenses',
        requiredRoles: [MIKPermissions.EXPENSE_ADMIN],
        adminModeOnly: true,
      },
      {
        label: 'header.mileageAllowances',
        path: 'mileage-allowances',
        requiredRoles: [MIKPermissions.EXPENSE_ADMIN],
        adminModeOnly: true,
      },
      {
        label: 'header.tulorekisteriReport',
        path: 'tulorekisteri-report',
        requiredRoles: [MIKPermissions.EXPENSE_HETU_ADMIN],
        adminModeOnly: true,
      },
      {
        label: 'header.costCentres',
        path: 'cost-centres',
        requiredRoles: [MIKPermissions.EXPENSE_ADMIN],
        adminModeOnly: true,
      },
    ],
  },
  {
    path: '/dto',
    label: 'header.dto',
    requiredRoles: [
      MIKPermissions.DTO_USER,
      MIKPermissions.DTO_INSTRUCTOR,
      MIKPermissions.DTO_ADMIN,
    ],
    requiresActiveDtoSyllabus: true,
    subItems: [
      {
        path: 'my-training',
        label: 'header.dtoMyTraining',
        requiredRoles: [MIKPermissions.DTO_USER],
      },
      {
        path: 'verify',
        label: 'header.dtoVerify',
        requiredRoles: [MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN],
        requiresDtoElevatedAccess: true,
      },
      {
        path: 'progress',
        label: 'header.dtoProgress',
        requiredRoles: [MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN],
        requiresDtoElevatedAccess: true,
      },
    ],
  },
]
