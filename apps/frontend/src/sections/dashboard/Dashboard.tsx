import { Box } from '@mui/material'
import { useRoles } from '../../hooks/useRoles'
import { FlightLogAdminDashboard } from './components/FlightLogAdminDashboard'
import { MemberAdminDashboard } from './components/MemberAdminDashboard'
import { BookingUserDashboard } from './components/BookingUserDashboard'
import { EquipmentFeeBanner } from './components/EquipmentFeeBanner'
import { OverdueInvoiceBanner } from './components/OverdueInvoiceBanner'
import { ReservationsSuspendedBanner } from '../../components/ReservationsSuspendedBanner'
import { MIKPermissions } from '@backend/routes/members/models'
import { Title } from '../../components/Title'
import { t } from 'i18next'

const Dashboard = () => {
  const roles = useRoles()

  return (
    <Box>
      <Title label={t('header.dashboard')} />

      <ReservationsSuspendedBanner />

      <OverdueInvoiceBanner />

      <EquipmentFeeBanner />

      {roles.hasAccess(
        MIKPermissions.BOOKING_USER,
        MIKPermissions.BOOKING_ADMIN
      ) && <BookingUserDashboard />}

      {roles.hasAccess(MIKPermissions.MEMBER_ADMIN) && <MemberAdminDashboard />}

      {roles.hasAccess(MIKPermissions.FLIGHTLOG_ADMIN) && (
        <FlightLogAdminDashboard />
      )}
    </Box>
  )
}

export default Dashboard
