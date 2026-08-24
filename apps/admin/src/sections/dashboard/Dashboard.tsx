import { Alert, Box, Stack, Typography } from '@mui/material'
import { MIKPermissions } from '@mik/contracts/members'
import { useTranslation } from 'react-i18next'
import { useMe } from '@mik/ui/hooks/useMe'
import { useRoles } from '@mik/ui/hooks/useRoles'

import { AmeAdminWidget } from './AmeAdminWidget'
import { ExpenseAdminWidget } from './ExpenseAdminWidget'
import { FlightLogAdminDashboard } from './FlightLogAdminDashboard'
import { MemberAdminDashboard } from './MemberAdminDashboard'

/**
 * The admin landing page: every queue of work waiting on this admin, and
 * nothing else.
 *
 * These four widgets sat on the *member* dashboard until #1233, mixed in with
 * weather, bookings and the member's own logbook. That was the clearest example
 * of the overload the issue describes — an admin had to scroll past their own
 * flying to find the approvals waiting for them, and a member with no admin
 * permissions still paid for the code.
 *
 * Each is permission-gated individually, so a treasurer sees expense approvals
 * and nothing else. Unlike the member dashboard there is no reordering or
 * settings modal: this is a work list, and its order is by urgency rather than
 * by preference.
 */
const Dashboard = () => {
  const { me } = useMe()
  const { hasAccess } = useRoles()
  const { t } = useTranslation()

  // One entry per queue, in the order an admin should work through them. Kept
  // as data rather than four inline `{cond && <X/>}` so that "is anything
  // waiting" is derived from the same list that renders, instead of a second
  // condition that has to be remembered when a fifth queue is added.
  const widgets = [
    { show: hasAccess(MIKPermissions.MEMBER_ADMIN), node: <MemberAdminDashboard /> },
    { show: hasAccess(MIKPermissions.EXPENSE_ADMIN), node: <ExpenseAdminWidget /> },
    { show: hasAccess(MIKPermissions.AME_ADMIN), node: <AmeAdminWidget /> },
    { show: hasAccess(MIKPermissions.FLIGHTLOG_ADMIN), node: <FlightLogAdminDashboard /> },
  ].filter((widget) => widget.show)

  return (
    <Box>
      <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
        {t('admin.dashboard.welcome', { name: me?.firstName ?? '' })}
      </Typography>
      <Typography variant='body1' color='text.secondary' sx={{ mb: 4 }}>
        {t('admin.dashboard.subtitle')}
      </Typography>

      {widgets.length === 0 ? (
        // Reachable: every route in this app is gated, so an admin whose
        // permissions cover none of these queues would otherwise land on a
        // blank page and assume it had failed to load.
        <Alert severity='info'>{t('admin.dashboard.nothingWaiting')}</Alert>
      ) : (
        <Stack spacing={3}>
          {widgets.map((widget, index) => (
            <Box key={index}>{widget.node}</Box>
          ))}
        </Stack>
      )}
    </Box>
  )
}

export default Dashboard
