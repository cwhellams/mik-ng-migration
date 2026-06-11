import { Alert, AlertTitle, Button } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMe } from '../../../hooks/useMe'
import dayjs from 'dayjs'
import { getEffectiveMedicalExpiry } from '../../../utils/date'

const EXPIRY_WARNING_DAYS = 30

export function ExpiryWarningBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { me, isLoading } = useMe()

  if (isLoading || !me) {
    return null
  }

  const today = dayjs().startOf('day')
  const warningThreshold = today.add(EXPIRY_WARNING_DAYS, 'day')

  const licenceExpiry = me.licenceExpiry ? dayjs(me.licenceExpiry) : null

  const medicalExpiry = getEffectiveMedicalExpiry(
    me.medicalClass1Expiry,
    me.medicalClass2Expiry,
    me.medicalLaplExpiry,
    me.medicalExpiry,
  )

  const licenceExpired = licenceExpiry && licenceExpiry.isBefore(today)
  const licenceExpiringSoon =
    licenceExpiry && !licenceExpired && licenceExpiry.isBefore(warningThreshold)

  const medicalExpired = medicalExpiry && medicalExpiry.isBefore(today)
  const medicalExpiringSoon =
    medicalExpiry && !medicalExpired && medicalExpiry.isBefore(warningThreshold)

  const showLicenceWarning = licenceExpired || licenceExpiringSoon
  const showMedicalWarning = medicalExpired || medicalExpiringSoon

  if (!showLicenceWarning && !showMedicalWarning) {
    return null
  }

  const goToProfile = () => {
    navigate('/club/members/me')
  }

  const action = (
    <Button color='inherit' size='small' onClick={goToProfile}>
      {t('dashboard.navigateToProfile')}
    </Button>
  )

  return (
    <>
      {showLicenceWarning && licenceExpiry && (
        <Alert severity={licenceExpired ? 'error' : 'warning'} sx={{ mb: 2 }} action={action}>
          <AlertTitle>
            {licenceExpired ? t('dashboard.licenceExpired') : t('dashboard.licenceExpiringSoon')}
          </AlertTitle>
          {licenceExpired
            ? t('dashboard.licenceExpiredMessage', {
                date: licenceExpiry.format('DD.MM.YYYY'),
              })
            : t('dashboard.licenceExpiringSoonMessage', {
                date: licenceExpiry.format('DD.MM.YYYY'),
              })}
        </Alert>
      )}
      {showMedicalWarning && medicalExpiry && (
        <Alert severity={medicalExpired ? 'error' : 'warning'} sx={{ mb: 2 }} action={action}>
          <AlertTitle>
            {medicalExpired ? t('dashboard.medicalExpired') : t('dashboard.medicalExpiringSoon')}
          </AlertTitle>
          {medicalExpired
            ? t('dashboard.medicalExpiredMessage', {
                date: medicalExpiry.format('DD.MM.YYYY'),
              })
            : t('dashboard.medicalExpiringSoonMessage', {
                date: medicalExpiry.format('DD.MM.YYYY'),
              })}
        </Alert>
      )}
    </>
  )
}
