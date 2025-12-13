import { IconButton, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { useRoles } from '../hooks/useRoles'
import { useThemeMode } from '../theme/ThemeContext'

const AdminToggle = () => {
  const { sudoers } = useRoles()
  const { sudo, toggleSudo } = useThemeMode()

  const { t } = useTranslation()

  if (!sudoers) {
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
