import { IconButton, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { useRoles } from '../hooks/useRoles'
import { useThemeMode } from '../theme/ThemeContext'
import { MIKPermissions } from '@backend/routes/members/models'

const AdminToggle = () => {
  const { hasAccess } = useRoles()
  const { sudo, toggleSudo } = useThemeMode()

  const { t } = useTranslation()

  const canUseAdminMode = hasAccess(
    MIKPermissions.MEMBER_ADMIN,
    MIKPermissions.FLIGHTLOG_ADMIN,
    MIKPermissions.BOOKING_ADMIN,
    MIKPermissions.AIRCRAFT_ADMIN,
    MIKPermissions.INVOICING_ADMIN,
    MIKPermissions.ACCESS_CODES_ADMIN,
    MIKPermissions.DOCUMENT_ADMIN
  )

  if (!canUseAdminMode) {
    return <></>
  }

  return (
    <Tooltip title={t('header.toggleSudo')}>
      <IconButton
        onClick={() => toggleSudo()}
        color='inherit'
        aria-label={t('header.toggleSudo')}
        sx={{ color: 'text.primary' }}
      >
        {sudo ? (
          <Icon icon='mdi:administrator' fontSize={24} />
        ) : (
          <Icon icon='mdi:user' fontSize={24} />
        )}
      </IconButton>
    </Tooltip>
  )
}

export default AdminToggle
