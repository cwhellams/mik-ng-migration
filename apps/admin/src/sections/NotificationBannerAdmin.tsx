import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useApi from '@mik/ui/hooks/useApi'
import { Title } from '@mik/ui/components/Title'
import type {
  NotificationBanner,
  NotificationBannerSeverity,
} from '@mik/contracts/notification-banner'

export default function NotificationBannerAdmin() {
  const { t } = useTranslation()

  const { data, isLoading, mutate } = useApi<NotificationBanner>({
    url: 'v1/notification-banner',
    allowUnauthenticated: true,
  })

  const { mutation } = useApi<NotificationBanner>({
    url: 'v1/notification-banner',
    skipFetch: true,
  })

  const [message, setMessage] = useState<string>('')
  const [severity, setSeverity] = useState<NotificationBannerSeverity>('info')
  const [enabled, setEnabled] = useState<boolean>(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Seed the form once, when the banner first arrives. Re-seeding on every
  // change of `data` fought the admin: `useSWRMutation` revalidates this key
  // after any save, so a rejected one refetched the unchanged banner and
  // overwrote whatever had just been typed.
  const seeded = useRef(false)
  useEffect(() => {
    if (!data || seeded.current) return

    seeded.current = true
    setEnabled(data.enabled)
    setMessage(data.message ?? '')
    setSeverity(data.severity)
  }, [data])

  // `trigger` resolves with `{ error }` rather than throwing, so the outcome has
  // to be inspected. Previously a `catch` here was the only error handling, which
  // meant a rejected save reported success and the refetch then wiped whatever
  // the admin had typed.
  const reportOutcome = (failed: boolean) => {
    setSaveStatus(failed ? 'error' : 'saved')
    setTimeout(() => setSaveStatus('idle'), failed ? 4000 : 3000)
    return failed
  }

  const handleSave = async () => {
    setSaveStatus('saving')
    const { error } = await mutation.trigger('PUT', {
      enabled,
      message: message || null,
      severity,
    })
    if (reportOutcome(!!error)) return

    await mutate()
  }

  const handleClear = async () => {
    setSaveStatus('saving')
    const { error } = await mutation.trigger('PUT', {
      enabled: false,
      message: null,
      severity,
    })
    if (reportOutcome(!!error)) return

    setEnabled(false)
    setMessage('')
    await mutate()
  }

  if (isLoading) return null

  return (
    <Box>
      <Title label={t('notificationBanner.admin.title')} />
      <Typography
        variant='body2'
        sx={{
          color: 'text.secondary',
          mb: 3,
        }}
      >
        {t('notificationBanner.admin.description')}
      </Typography>
      {enabled && message && (
        <Alert severity={severity} sx={{ mb: 3 }}>
          {message}
        </Alert>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 600 }}>
        <FormControlLabel
          control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
          label={t('notificationBanner.admin.enabled')}
        />

        <FormControl fullWidth>
          <InputLabel>{t('notificationBanner.admin.severity')}</InputLabel>
          <Select
            value={severity}
            label={t('notificationBanner.admin.severity')}
            onChange={(e) => setSeverity(e.target.value as NotificationBannerSeverity)}
          >
            <MenuItem value='info'>{t('notificationBanner.admin.severityInfo')}</MenuItem>
            <MenuItem value='warning'>{t('notificationBanner.admin.severityWarning')}</MenuItem>
            <MenuItem value='error'>{t('notificationBanner.admin.severityError')}</MenuItem>
            <MenuItem value='success'>{t('notificationBanner.admin.severitySuccess')}</MenuItem>
          </Select>
        </FormControl>

        <TextField
          label={t('notificationBanner.admin.message')}
          multiline
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          helperText={`${message.length}/500`}
          fullWidth
          slotProps={{
            htmlInput: { maxLength: 500 },
          }}
        />

        {saveStatus === 'saved' && (
          <Alert severity='success'>{t('notificationBanner.admin.saved')}</Alert>
        )}
        {saveStatus === 'error' && (
          <Alert severity='error'>{t('notificationBanner.admin.saveError')}</Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant='contained' onClick={handleSave} disabled={saveStatus === 'saving'}>
            {t('notificationBanner.admin.save')}
          </Button>
          {(data?.message || data?.enabled) && (
            <Button
              variant='outlined'
              color='error'
              onClick={handleClear}
              disabled={saveStatus === 'saving'}
            >
              {t('notificationBanner.admin.clear')}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  )
}
