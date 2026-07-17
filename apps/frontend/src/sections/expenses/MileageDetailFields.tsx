/**
 * Extra fields required for mileage expense claims (tax records).
 * Single route field + date (no departure/arrival times).
 * Includes HETU (encrypted server-side) and board approval checkbox above km limit.
 */
import { useTranslation } from 'react-i18next'
import { Alert, Box, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material'

export interface MileageDetailForm {
  route: string
  journeyDate: string
  distanceKm: string
  hetu: string
  boardApproved: boolean
}

export function makeMileageDetailForm(): MileageDetailForm {
  return {
    route: '',
    journeyDate: new Date().toISOString().substring(0, 10),
    distanceKm: '',
    hetu: '',
    boardApproved: false,
  }
}

interface Props {
  value: MileageDetailForm
  onChange: (v: MileageDetailForm) => void
  disabled?: boolean
  effectiveRatePerKm?: number
  maxKm?: number
}

export function MileageDetailFields({
  value,
  onChange,
  disabled,
  effectiveRatePerKm,
  maxKm = 100,
}: Props) {
  const { t } = useTranslation()

  const set = <K extends keyof MileageDetailForm>(field: K, val: MileageDetailForm[K]) =>
    onChange({ ...value, [field]: val })

  const km = Number(value.distanceKm) || 0
  const totalEur = effectiveRatePerKm && km > 0 ? (effectiveRatePerKm * km).toFixed(2) : null
  const exceedsLimit = km > maxKm

  return (
    <Stack spacing={2}>
      <Typography variant='subtitle2' color='text.secondary'>
        {t('expenses.mileage.sectionTitle')}
      </Typography>

      {/* Route */}
      <TextField
        label={t('expenses.mileage.route')}
        value={value.route}
        disabled={disabled}
        required
        fullWidth
        inputProps={{ maxLength: 500 }}
        helperText={t('expenses.mileage.routeHint')}
        onChange={(e) => set('route', e.target.value)}
      />

      {/* Date + Distance */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems='flex-start'>
        <TextField
          label={t('expenses.mileage.journeyDate')}
          type='date'
          value={value.journeyDate}
          disabled={disabled}
          required
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 180 }}
          onChange={(e) => set('journeyDate', e.target.value)}
        />
        <TextField
          label={t('expenses.mileage.distanceKm')}
          type='number'
          value={value.distanceKm}
          disabled={disabled}
          required
          sx={{ width: 180 }}
          slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
          onChange={(e) => set('distanceKm', e.target.value)}
        />
        {totalEur && effectiveRatePerKm && (
          <Box sx={{ pt: 0.5 }}>
            <Typography variant='caption' color='text.secondary'>
              {t('expenses.mileage.estimatedAmount')}
            </Typography>
            <Typography variant='body1' fontWeight='bold'>
              €{totalEur}
              <Typography component='span' variant='caption' color='text.secondary' sx={{ ml: 1 }}>
                (€{effectiveRatePerKm}/km)
              </Typography>
            </Typography>
          </Box>
        )}
      </Stack>

      {/* Board approval required above limit */}
      {exceedsLimit && (
        <Alert severity='warning'>{t('expenses.mileage.boardApprovalRequired', { maxKm })}</Alert>
      )}
      {exceedsLimit && (
        <FormControlLabel
          control={
            <Checkbox
              checked={value.boardApproved}
              disabled={disabled}
              onChange={(e) => set('boardApproved', e.target.checked)}
            />
          }
          label={t('expenses.mileage.boardApprovedLabel')}
        />
      )}

      {/* HETU — masked input, encrypted at rest */}
      <TextField
        label={t('expenses.mileage.hetu')}
        value={value.hetu}
        disabled={disabled}
        required
        fullWidth
        type='password'
        autoComplete='off'
        inputProps={{ maxLength: 11 }}
        helperText={t('expenses.mileage.hetuHint')}
        onChange={(e) => set('hetu', e.target.value)}
      />
    </Stack>
  )
}
