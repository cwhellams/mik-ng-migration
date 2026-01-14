import { Alert, AlertTitle, Button } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMe } from '../../../hooks/useMe'

export function ProfileUpdateRequiredBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { me, isLoading } = useMe()

  if (isLoading || !me || me.updatedBy !== 'simplbks') {
    return <></>
  }

  const goToProfile = () => {
    navigate('/club/members/me')
  }

  return (
    <Alert
      severity='error'
      sx={{ mb: 2 }}
      action={
        <Button color='inherit' size='small' onClick={goToProfile}>
          {t('dashboard.navigateToProfile')}
        </Button>
      }
    >
      <AlertTitle>{t('dashboard.profileUpdateRequired')}</AlertTitle>
      {t('dashboard.profileUpdateMessage')}
    </Alert>
  )
}
