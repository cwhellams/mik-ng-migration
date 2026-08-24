import { MIKPermissions } from '@mik/contracts/members'

export interface NavItem {
  /** i18n key for the label. */
  label: string
  /** Iconify icon name. */
  icon: string
  /** Absolute path within the admin app. */
  path: string
  /**
   * The item shows if the signed-in admin holds **any** of these. An empty
   * array means "any authenticated admin" — the dashboard is the only such
   * item.
   *
   * These must stay in step with the `RequirePermission` wrapper on the
   * matching route in `AppRoutes.tsx`: an item that is visible but leads to a
   * 403 is worse than no item at all. `AppRoutes.permissions.test.tsx` asserts
   * the two agree.
   */
  permissions: MIKPermissions[]
}

export interface NavGroup {
  /** i18n key for the group heading, or `null` for the ungrouped top item. */
  label: string | null
  items: NavItem[]
}

/**
 * The admin sidebar.
 *
 * Grouped by what an admin is *doing* rather than by which backend domain the
 * page happens to live in — the flat `/admin/*` submenu this replaces was the
 * specific complaint in #1233. A group renders only if at least one of its
 * items is visible to the signed-in admin.
 */
export const navGroups: NavGroup[] = [
  {
    label: null,
    items: [
      {
        label: 'admin.nav.dashboard',
        icon: 'mdi:view-dashboard',
        path: '/dashboard',
        permissions: [],
      },
    ],
  },
  {
    label: 'admin.nav.groups.membership',
    items: [
      {
        label: 'admin.nav.roles',
        icon: 'mdi:shield-account',
        path: '/members/roles',
        permissions: [MIKPermissions.MEMBER_ADMIN],
      },
      {
        label: 'admin.nav.memberTrash',
        icon: 'mdi:delete-restore',
        path: '/members/trash',
        permissions: [MIKPermissions.MEMBER_ADMIN],
      },
      {
        label: 'admin.nav.memberChangeLog',
        icon: 'mdi:history',
        path: '/members/changelog',
        permissions: [MIKPermissions.MEMBER_ADMIN],
      },
      {
        label: 'admin.nav.nonRenewals',
        icon: 'mdi:account-cancel',
        path: '/non-renewals',
        permissions: [MIKPermissions.MEMBER_ADMIN],
      },
      {
        label: 'admin.nav.meetings',
        icon: 'mdi:gavel',
        path: '/meetings',
        permissions: [MIKPermissions.MEETING_ADMIN],
      },
      {
        label: 'admin.nav.events',
        icon: 'mdi:calendar-star',
        path: '/events',
        permissions: [MIKPermissions.EVENTS_ADMIN],
      },
    ],
  },
  {
    label: 'admin.nav.groups.training',
    items: [
      {
        label: 'admin.nav.dto',
        icon: 'mdi:school',
        path: '/dto',
        permissions: [MIKPermissions.DTO_ADMIN],
      },
      {
        label: 'admin.nav.exams',
        icon: 'mdi:clipboard-text',
        path: '/exams',
        permissions: [MIKPermissions.EXAM_ADMIN],
      },
      {
        label: 'admin.nav.examAttempts',
        icon: 'mdi:clipboard-check',
        path: '/exams/attempts',
        permissions: [MIKPermissions.EXAM_ADMIN],
      },
    ],
  },
  {
    label: 'admin.nav.groups.invoicing',
    items: [
      {
        label: 'admin.nav.invoicingDashboard',
        icon: 'mdi:cash-multiple',
        path: '/accounting',
        permissions: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'admin.nav.flightInvoicing',
        icon: 'mdi:airplane-check',
        path: '/accounting/invoicing',
        permissions: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'admin.nav.invoiceItems',
        icon: 'mdi:format-list-numbered',
        path: '/accounting/items',
        permissions: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'admin.nav.unpaidOverdue',
        icon: 'mdi:cash-clock',
        path: '/accounting/unpaid-overdue',
        permissions: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'admin.nav.accountingTools',
        icon: 'mdi:tools',
        path: '/accounting/tools',
        permissions: [MIKPermissions.INVOICING_ADMIN],
      },
    ],
  },
  {
    label: 'admin.nav.groups.reports',
    items: [
      {
        label: 'admin.nav.taxReport',
        icon: 'mdi:file-percent',
        path: '/accounting/tax-report',
        permissions: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'admin.nav.traficomReport',
        icon: 'mdi:file-chart',
        path: '/accounting/traficom-report',
        permissions: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'admin.nav.upliftReport',
        icon: 'mdi:fuel',
        path: '/accounting/uplift-report',
        permissions: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'admin.nav.instructorWorktime',
        icon: 'mdi:clock-check',
        path: '/accounting/instructor-worktime',
        permissions: [MIKPermissions.INVOICING_ADMIN],
      },
      {
        label: 'admin.nav.tulorekisteriReport',
        icon: 'mdi:bank-transfer',
        path: '/accounting/tulorekisteri-report',
        permissions: [MIKPermissions.EXPENSE_HETU_ADMIN],
      },
    ],
  },
  {
    label: 'admin.nav.groups.expenses',
    items: [
      {
        label: 'admin.nav.expenseApproval',
        icon: 'mdi:receipt-text-check',
        path: '/accounting/expenses',
        permissions: [MIKPermissions.EXPENSE_ADMIN],
      },
      {
        label: 'admin.nav.mileageAllowances',
        icon: 'mdi:car',
        path: '/accounting/mileage-allowances',
        permissions: [MIKPermissions.EXPENSE_ADMIN],
      },
      {
        label: 'admin.nav.costCentres',
        icon: 'mdi:tag-multiple',
        path: '/accounting/cost-centres',
        permissions: [MIKPermissions.EXPENSE_ADMIN],
      },
    ],
  },
  {
    label: 'admin.nav.groups.shop',
    items: [
      {
        label: 'admin.nav.shopDashboard',
        icon: 'mdi:storefront',
        path: '/shop',
        permissions: [MIKPermissions.STORE_ADMIN],
      },
      {
        label: 'admin.nav.orders',
        icon: 'mdi:receipt-text',
        path: '/shop/orders',
        permissions: [MIKPermissions.STORE_ADMIN],
      },
      {
        label: 'admin.nav.products',
        icon: 'mdi:package-variant',
        path: '/shop/products',
        permissions: [MIKPermissions.STORE_ADMIN],
      },
      {
        label: 'admin.nav.categories',
        icon: 'mdi:shape',
        path: '/shop/categories',
        permissions: [MIKPermissions.STORE_ADMIN],
      },
      {
        label: 'admin.nav.discountCodes',
        icon: 'mdi:ticket-percent',
        path: '/shop/discount-codes',
        permissions: [MIKPermissions.STORE_ADMIN],
      },
      {
        label: 'admin.nav.flightPackages',
        icon: 'mdi:airplane-clock',
        path: '/shop/flight-packages',
        permissions: [MIKPermissions.STORE_ADMIN],
      },
    ],
  },
  {
    label: 'admin.nav.groups.operations',
    items: [
      {
        label: 'admin.nav.ame',
        icon: 'mdi:doctor',
        path: '/ame',
        permissions: [MIKPermissions.AME_ADMIN],
      },
      {
        label: 'admin.nav.inventory',
        icon: 'mdi:warehouse',
        path: '/inventory',
        permissions: [MIKPermissions.INVENTORY_ADMIN],
      },
    ],
  },
  {
    label: 'admin.nav.groups.system',
    items: [
      {
        label: 'admin.nav.outbox',
        icon: 'mdi:email-sync',
        path: '/outbox',
        permissions: [MIKPermissions.OUTBOX_ADMIN],
      },
      {
        label: 'admin.nav.notificationBanner',
        icon: 'mdi:bullhorn',
        path: '/notification-banner',
        permissions: [MIKPermissions.MEMBER_ADMIN],
      },
      {
        label: 'admin.nav.phoneNumbers',
        icon: 'mdi:phone-classic',
        path: '/phone-numbers',
        permissions: [MIKPermissions.MEMBER_ADMIN],
      },
    ],
  },
]
