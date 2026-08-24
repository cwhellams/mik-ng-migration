import { IconButton, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { useRoles } from '@mik/ui/hooks/useRoles'
import { useThemeMode } from '../theme/ThemeContext'

const AdminToggle = () => {
  // `sudoers` asks the question this component actually cares about — "would
  // admin mode change anything for this member?" — by testing their permissions
  // against `downgradePermission`, the same function the backend applies to a
  // request sent with `x-sudo: false`.
  //
  // This used to be a hand-maintained list of 20 permissions, which is the same
  // list `downgradePermission` already encodes, kept in sync by hand. It had
  // drifted: CAMO_USER is downgraded (dropped) by the backend but was missing
  // here, so a member whose only sudo-relevant permission was CAMO_USER got no
  // toggle, could never turn admin mode on, and therefore could never reach the
  // CAMO occurrence endpoints their permission exists for. Deriving it fixes
  // that and cannot drift again.
  const { sudoers: canUseAdminMode } = useRoles()
  const { sudo, toggleSudo } = useThemeMode()

  const { t } = useTranslation()

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
