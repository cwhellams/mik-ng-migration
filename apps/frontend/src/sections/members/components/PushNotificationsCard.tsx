import { Alert, Box, Card, CardContent, Switch, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FormTitle } from '@mik/ui/components/FormTitle'
import {
  disablePushNotifications,
  enablePushNotifications,
  hasActivePushSubscription,
  isIosSafariNotInstalled,
  pushNotificationsSupported,
} from '../../../utils/pushNotifications'

/**
 * Push notification opt-in card, shown only on the member's own profile
 * (browser permissions/subscriptions are per-device, so it makes no sense
 * for an admin viewing another member's profile).
 */
export const PushNotificationsCard = () => {
  const { t } = useTranslation()
  const [supported] = useState(() => pushNotificationsSupported())
  const [iosNeedsInstall] = useState(() => isIosSafariNotInstalled())
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!supported) {
      setLoading(false)
      return
    }
    hasActivePushSubscription()
      .then(setEnabled)
      .finally(() => setLoading(false))
  }, [supported])

  const handleToggle = async () => {
    setError(false)
    setBusy(true)
    if (enabled) {
      const ok = await disablePushNotifications()
      if (ok) setEnabled(false)
      else setError(true)
    } else {
      const result = await enablePushNotifications()
      if (result.ok) setEnabled(true)
      else setError(true)
    }
    setBusy(false)
  }

  return (
    <Card>
      <CardContent>
        <FormTitle title={t('member.pushNotifications.title')} icon='mdi:bell-outline' />

        {iosNeedsInstall && (
          <Alert severity='info' sx={{ mb: 2 }}>
            {t('member.pushNotifications.iosInstallPrompt')}
          </Alert>
        )}

        {!iosNeedsInstall && !supported && (
          <Typography variant='body2' sx={{ color: 'text.secondary' }}>
            {t('member.pushNotifications.unsupportedBrowser')}
          </Typography>
        )}

        {!iosNeedsInstall && supported && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant='body2'>{t('member.pushNotifications.description')}</Typography>
              <Switch checked={enabled} disabled={loading || busy} onChange={handleToggle} />
            </Box>
            {error && (
              <Alert severity='error' sx={{ mt: 2 }}>
                {t('member.pushNotifications.error')}
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
