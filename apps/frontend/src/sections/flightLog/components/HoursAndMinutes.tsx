import { Box, TextField } from '@mui/material'
import { useTranslation } from 'react-i18next'

export const HoursAndMinutes = ({
  currentHours,
  currentMinutes,
  setCurrentHours,
  setCurrentMinutes,
}: {
  currentHours: number | null | undefined
  currentMinutes: number | null | undefined
  setCurrentHours: (hours: number | null) => void
  setCurrentMinutes: (minutes: number | null) => void
}) => {
  const { t } = useTranslation()

  return (
    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
      <TextField
        size='medium'
        label={t('flightLog.hours')}
        type='number'
        value={currentHours ?? ''}
        onChange={(e) => setCurrentHours(e.target.value === '' ? null : Number(e.target.value))}
        slotProps={{
          htmlInput: { min: 0 },
          inputLabel: { shrink: true },
        }}
        sx={{ width: '60%' }}
      />
      <TextField
        size='medium'
        label={t('flightLog.minutes')}
        type='number'
        value={currentMinutes}
        onChange={(e) => {
          const value = e.target.value === '' ? null : Number(e.target.value)
          if (typeof value !== 'number' || value <= 59) {
            setCurrentMinutes(value)
          }
        }}
        slotProps={{
          htmlInput: { min: 0, max: 59 },
          inputLabel: { shrink: true },
        }}
        sx={{ width: '40%' }}
      />
    </Box>
  )
}
