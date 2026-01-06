import { Alert, AlertTitle, Button } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMe } from '../../../hooks/useMe'

export function ReservationsSuspendedBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { me, isLoading } = useMe()

  if (
    isLoading ||
    !me ||
    !me.isMembershipApproved ||
    me.canMakeReservations !== false
  ) {
    return null
  }

  const handleViewInvoices = () => {
    navigate('/club/billing')
  }

  return (
    <Alert
      severity='error'
      sx={{ mb: 2 }}
      action={
        <Button color='inherit' size='small' onClick={handleViewInvoices}>
          {t('dashboard.viewInvoices')}
        </Button>
      }
    >
      <AlertTitle>{t('dashboard.reservationsSuspendedTitle')}</AlertTitle>
      {t('reservationsSuspendedMessage')}
    </Alert>
  )
}
