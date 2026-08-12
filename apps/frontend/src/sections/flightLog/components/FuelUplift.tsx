import {
  Box,
  Checkbox,
  FormControlLabel,
  FormHelperText,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Control, Controller } from 'react-hook-form'
import { FlightLogUpsertRequest } from '@mik/contracts/flight-log'
import { useTranslation } from 'react-i18next'
import { useIsFormSubmitted } from '../../../hooks/useIsFormSubmitted'
import { shouldShowFieldError } from '../../../utils/formErrors'

interface Props {
  control: Control<FlightLogUpsertRequest>
  disabled?: boolean
}

export const FuelUplift = ({ control, disabled }: Props) => {
  const { t } = useTranslation()
  const isSubmitted = useIsFormSubmitted(control)
  return (
    <Controller
      name='fuelUpliftLitres'
      control={control}
      render={({ field, fieldState: { error, isDirty } }) => {
        const isNoFuelAdded = field.value === 0
        const showError = shouldShowFieldError(error, isDirty, isSubmitted)

        return (
          <Box>
            <Stack
              direction='row'
              sx={{
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
              }}
            >
              <Typography
                variant='body2'
                color={disabled ? 'text.disabled' : 'text.primary'}
                gutterBottom
              >
                {t('flightLog.fuelUpliftLitres')}
                <Box component='span' sx={{ color: 'error.main' }}>
                  {' *'}
                </Box>
              </Typography>

              <FormControlLabel
                sx={{ mr: 0 }}
                control={
                  <Checkbox
                    size='small'
                    checked={isNoFuelAdded}
                    disabled={disabled}
                    onChange={(e) => {
                      field.onChange(e.target.checked ? 0 : null)
                    }}
                  />
                }
                label={t('flightLog.noFuelAdded')}
              />
            </Stack>
            {!isNoFuelAdded && (
              <TextField
                type='number'
                disabled={disabled}
                value={field.value ?? ''}
                onChange={(e) => {
                  field.onChange(e.target.value === '' ? null : Number(e.target.value))
                }}
                slotProps={{ htmlInput: { step: 1, min: 0, max: 300 } }}
                size='small'
                fullWidth
                error={showError}
              />
            )}
            {showError && <FormHelperText error>{error?.message}</FormHelperText>}
          </Box>
        )
      }}
    />
  )
}
