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
    // The union of both calendars' permissions, with each sub-item carrying its
    // own gate below. Nesting the item calendar under here must not take it away
    // from someone who may reserve equipment but not aircraft: V2010 grants
    // `inventory_reservation.user` to MEMBER as well as FLYING_MEMBER, while
    // `booking.user` only reaches the latter.
    requiredRoles: [
      MIKPermissions.BOOKING_USER,
      MIKPermissions.BOOKING_ADMIN,
      MIKPermissions.INVENTORY_RESERVATION_USER,
      MIKPermissions.INVENTORY_RESERVATION_ADMIN,
    ],
    subItems: [
      // The index tab, so clicking Schedule still lands on the aircraft
      // calendar — that is what "reservations" means to almost everyone here,
      // and the equipment calendar is the sibling you go looking for.
      {
        path: '',
        label: 'header.aircraftReservations',
        requiredRoles: [MIKPermissions.BOOKING_USER, MIKPermissions.BOOKING_ADMIN],
      },
      // Absolute rather than relative, so the page keeps the URL it already has
      // and an existing bookmark still works — the same arrangement `/exams`
      // has under `/club`.
      {
        path: '/inventory-reservations',
        label: 'header.itemReservations',
        requiredRoles: [
          MIKPermissions.INVENTORY_RESERVATION_USER,
          MIKPermissions.INVENTORY_RESERVATION_ADMIN,
        ],
      },
    ],
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
    // Was INVENTORY_ADMIN + adminModeOnly, which hid the link from the members
    // this page is for — they could only reach it by typing the URL. The route
    // has never been gated; the admin side of inventory moved to apps/admin in
    // #1233, so what is left here is the shelf list every member may read.
    path: '/inventory',
    label: 'header.inventory',
    requiredRoles: [MIKPermissions.INVENTORY_USER, MIKPermissions.INVENTORY_ADMIN],
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
