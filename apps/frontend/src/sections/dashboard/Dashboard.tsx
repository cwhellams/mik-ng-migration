import { Box } from '@mui/material'
import { useRoles } from '../../hooks/useRoles'
import { FlightLogAdminDashboard } from './components/FlightLogAdminDashboard'
import { MemberAdminDashboard } from './components/MemberAdminDashboard'
import { BookingUserDashboard } from './components/BookingUserDashboard'
import { EquipmentFeeBanner } from './components/EquipmentFeeBanner'
import { MIKPermissions } from '@backend/routes/members/models'
import { Title } from '../../components/Title'
import { t } from 'i18next'

const Dashboard = () => {
  const roles = useRoles()

  return (
    <Box>
      <Title label={t('header.dashboard')} />

      <EquipmentFeeBanner />

      {roles.hasAccess(
        MIKPermissions.BOOKING_USER,
        MIKPermissions.BOOKING_ADMIN
      ) && <BookingUserDashboard />}

      {roles.isMembersAdmin && <MemberAdminDashboard />}

      {roles.isFlightLogAdmin && <FlightLogAdminDashboard />}
    </Box>
  )
}

export default Dashboard
