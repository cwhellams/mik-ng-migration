import { Box, TextField, Button, ButtonGroup, Typography } from '@mui/material'
import { Control, Controller } from 'react-hook-form'
import { FlightLogUpsertRequest } from '@backend/routes/flight-log/models'
import { useTranslation } from 'react-i18next'
import { useIsFormSubmitted } from '../../../hooks/useIsFormSubmitted'
import { formatRequiredFieldError, shouldShowFieldError } from '../../../utils/formErrors'

interface Props {
  name: keyof FlightLogUpsertRequest
  control: Control<FlightLogUpsertRequest>
  min?: number
  disabled?: boolean
  required?: boolean
}

export const NumberOfLandings = ({ name, control, min = 1, disabled, required }: Props) => {
  const { t } = useTranslation()
  const isSubmitted = useIsFormSubmitted(control)
  return (
    <Controller
      name={name}
      control={control}
      disabled={disabled}
      render={({ field, fieldState: { error, isDirty } }) => {
        const isUnset = typeof field.value !== 'number' || field.value === null
        const currentValue = isUnset ? min : (field.value as number)
        const showError = shouldShowFieldError(error, isDirty, isSubmitted)

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <Typography
              variant='body2'
              color={disabled ? 'text.disabled' : 'text.primary'}
              gutterBottom
            >
              {t('flightLog.' + name)}
              {required && (
                <Box component='span' sx={{ color: 'error.main' }}>
                  {' *'}
                </Box>
              )}
            </Typography>

            <ButtonGroup
              sx={{
                mb: 3,
                width: '100%',
                ...(isUnset &&
                  !disabled && {
                    '& .MuiButtonGroup-grouped, & .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'warning.main',
                    },
                  }),
              }}
              fullWidth
              disabled={disabled}
            >
              <Button value='-' onClick={() => field.onChange(Math.max(min, currentValue - 1))}>
                -
              </Button>

              <TextField
                {...field}
                disabled={disabled}
                value={field.value ?? ''}
                onChange={({ target }) => {
                  const parsedValue = Number(target.value)
                  field.onChange(Math.max(1, Math.min(50, parsedValue)))
                }}
                margin='none'
                size='small'
                sx={{ input: { textAlign: 'center' } }}
                error={showError}
                helperText={
                  showError
                    ? formatRequiredFieldError(error, t('flightLog.error.fieldRequired'))
                    : undefined
                }
              />

              <Button
                value='+'
                onClick={() => field.onChange(isUnset ? min : Math.min(50, currentValue + 1))}
              >
                +
              </Button>
            </ButtonGroup>
          </Box>
        )
      }}
    />
  )
}
