import { useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormHelperText,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useTranslation } from 'react-i18next'
import { AppleTimeWheel } from './AppleTimeWheel'

interface TimeEntryFieldProps {
  label: string
  hour: number | null
  minute: number | null
  onChange: (hour: number, minute: number) => void
  disabled?: boolean
  error?: boolean
  errorMessage?: string | null
  disabledMessage?: string | null
}

// Shared "tap the big time to open a wheel picker" entry used for both clock times
// (TimeStep) and plain durations (night/instrument flying minutes in NightIfrStep) —
// the wheel itself doesn't care whether hour/minute represent a time-of-day or a
// duration, so the same component works for either.
export const TimeEntryField = ({
  label,
  hour,
  minute,
  onChange,
  disabled,
  error,
  errorMessage,
  disabledMessage,
}: TimeEntryFieldProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const displayValue =
    hour != null && minute != null
      ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      : '--:--'

  return (
    <Box sx={{ width: '100%', textAlign: 'center' }}>
      <Typography variant='h6' sx={{ fontWeight: 700, mb: 0.5 }}>
        {label}
      </Typography>
      <Box
        onClick={() => !disabled && setOpen(true)}
        sx={{
          display: 'inline-block',
          minWidth: 140,
          borderRadius: 1,
          px: 2,
          py: 1,
          bgcolor: error ? (theme) => alpha(theme.palette.error.main, 0.15) : 'action.hover',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'background-color 0.15s',
        }}
      >
        <Typography
          sx={{
            fontSize: '2.5rem',
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            color: error ? 'error.main' : 'text.primary',
            lineHeight: 1.1,
          }}
        >
          {displayValue}
        </Typography>
      </Box>
      {error && errorMessage && (
        <FormHelperText error sx={{ textAlign: 'center' }}>
          {errorMessage}
        </FormHelperText>
      )}
      {disabled && disabledMessage && (
        <FormHelperText sx={{ textAlign: 'center' }}>{disabledMessage}</FormHelperText>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth='xs' fullWidth>
        <DialogTitle>{label}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <AppleTimeWheel hour={hour} minute={minute} disabled={disabled} onChange={onChange} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant='contained' onClick={() => setOpen(false)} sx={{ minHeight: 44 }}>
            {t('common.ok')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
