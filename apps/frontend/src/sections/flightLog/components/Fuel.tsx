import {
  Alert,
  Box,
  FormHelperText,
  InputAdornment,
  Slider,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { Control, Controller } from 'react-hook-form'
import { FlightLogUpsertRequest } from '@backend/routes/flight-log/models'
import { useTranslation } from 'react-i18next'

interface Props {
  control: Control<FlightLogUpsertRequest>
  usableFuelLitres: number
  disabled?: boolean
}

export const Fuel = ({ control, usableFuelLitres, disabled }: Props) => {
  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  const marks = [
    {
      value: usableFuelLitres * 0.1,
      label: '10%',
    },
    isMd && {
      value: usableFuelLitres * 0.2,
      label: '20%',
    },
    {
      value: usableFuelLitres * 0.3,
      label: '30%',
    },
    isMd && {
      value: usableFuelLitres * 0.4,
      label: '40%',
    },
    {
      value: usableFuelLitres * 0.5,
      label: '50%',
    },
    isMd && {
      value: usableFuelLitres * 0.6,
      label: '60%',
    },
    {
      value: usableFuelLitres * 0.7,
      label: '70%',
    },
    isMd && {
      value: usableFuelLitres * 0.8,
      label: '80%',
    },
    {
      value: usableFuelLitres * 0.9,
      label: '90%',
    },
    isMd && {
      value: usableFuelLitres,
      label: '100%',
    },
  ].filter((m) => !!m)

  const label = (value: number) => `${Math.round(value)}L = ${Math.round(value / 3.785)}USG`

  const { t } = useTranslation()
  return (
    <Controller
      name={'fuelRemainingLitres'}
      control={control}
      disabled={disabled}
      render={({ field, fieldState }) => (
        <Box>
          <Typography
            variant='body2'
            color={disabled ? 'text.disabled' : 'text.primary'}
            gutterBottom
            sx={{
              mb: 4,
            }}
          >
            {t('flightLog.fuelRemainingLitres')}
          </Typography>

          <Slider
            value={field.value ?? 0}
            disabled={disabled}
            onChange={(_, value: number | number[]) => {
              field.onChange(value as number)
            }}
            valueLabelFormat={label}
            min={0}
            step={3.785}
            max={usableFuelLitres}
            valueLabelDisplay='on'
            marks={marks}
          />

          {/* Numeric inputs synced with slider for precise touch entry */}
          <Stack direction='row' spacing={2} sx={{ mt: 1 }}>
            <TextField
              size='small'
              type='number'
              label={t('flightLog.fuelLitres')}
              value={Math.round(field.value ?? 0)}
              disabled={disabled}
              slotProps={{
                input: { endAdornment: <InputAdornment position='end'>L</InputAdornment> },
                htmlInput: { min: 0, max: usableFuelLitres, step: 1 },
              }}
              onChange={(e) => {
                const litres = Math.min(usableFuelLitres, Math.max(0, Number(e.target.value)))
                field.onChange(Math.round(litres))
              }}
              sx={{ width: 120 }}
            />
            <TextField
              size='small'
              type='number'
              label={t('flightLog.fuelUSG')}
              value={Math.round((field.value ?? 0) / 3.785)}
              disabled={disabled}
              slotProps={{
                input: { endAdornment: <InputAdornment position='end'>USG</InputAdornment> },
                htmlInput: { min: 0, max: Math.round(usableFuelLitres / 3.785), step: 1 },
              }}
              onChange={(e) => {
                const litres = Math.min(
                  usableFuelLitres,
                  Math.max(0, Number(e.target.value) * 3.785),
                )
                field.onChange(Math.round(litres))
              }}
              sx={{ width: 120 }}
            />
          </Stack>

          {!disabled && (field.value ?? 0) === 0 && (
            <Alert severity='warning' sx={{ mt: 1 }}>
              {t('flightLog.fuelRemainingZeroWarning')}
            </Alert>
          )}

          <FormHelperText error>{fieldState.error?.message}</FormHelperText>
        </Box>
      )}
    />
  )
}
