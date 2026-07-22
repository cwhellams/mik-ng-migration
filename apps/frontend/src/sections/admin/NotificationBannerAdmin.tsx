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
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useApi from '../../hooks/useApi'
import { Title } from '../../components/Title'
import type {
  NotificationBanner,
  NotificationBannerSeverity,
} from '@backend/routes/notification-banner/models'

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

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled)
      setMessage(data.message ?? '')
      setSeverity(data.severity)
    }
  }, [data])

  const handleSave = async () => {
    setSaveStatus('saving')
    try {
      await mutation.trigger('PUT', {
        enabled,
        message: message || null,
        severity,
      })
      await mutate()
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 4000)
    }
  }

  const handleClear = async () => {
    setSaveStatus('saving')
    try {
      await mutation.trigger('PUT', { enabled: false, message: null, severity })
      setEnabled(false)
      setMessage('')
      await mutate()
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 4000)
    }
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
