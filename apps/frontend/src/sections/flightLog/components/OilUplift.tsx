import {
  Box,
  Checkbox,
  FormControlLabel,
  FormHelperText,
  TextField,
  Typography,
} from '@mui/material'
import { Control, Controller } from 'react-hook-form'
import { FlightLogUpsertRequest } from '@backend/routes/flight-log/models'
import { useTranslation } from 'react-i18next'

interface Props {
  control: Control<FlightLogUpsertRequest>
  disabled?: boolean
}

export const OilUplift = ({ control, disabled }: Props) => {
  const { t } = useTranslation()
  return (
    <Controller
      name='oilUpliftLitres'
      control={control}
      render={({ field, fieldState: { error } }) => {
        const isNoOilAdded = field.value === 0

        return (
          <Box>
            <Typography
              variant='body2'
              color={disabled ? 'text.disabled' : 'text.primary'}
              gutterBottom
            >
              {t('flightLog.oilUpliftLitres')}
            </Typography>

            <FormControlLabel
              control={
                <Checkbox
                  checked={isNoOilAdded}
                  disabled={disabled}
                  onChange={(e) => {
                    field.onChange(e.target.checked ? 0 : null)
                  }}
                />
              }
              label={t('flightLog.noOilAdded')}
            />

            {!isNoOilAdded && (
              <TextField
                type='number'
                disabled={disabled}
                value={field.value ?? ''}
                onChange={(e) => {
                  field.onChange(e.target.value === '' ? null : Number(e.target.value))
                }}
                slotProps={{ htmlInput: { step: '0.1', min: 0, max: 10 } }}
                size='small'
                fullWidth
                error={!!error}
              />
            )}

            {error && <FormHelperText error>{error.message}</FormHelperText>}
          </Box>
        )
      }}
    />
  )
}
