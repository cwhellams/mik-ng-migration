import { TextField, TextFieldProps } from '@mui/material'
import { Control, Controller } from 'react-hook-form'
import { FlightLogUpsertRequest } from '@mik/contracts/flight-log'
import { useTranslation } from 'react-i18next'
import { useIsFormSubmitted } from '../../../hooks/useIsFormSubmitted'
import { shouldShowFieldError } from '../../../utils/formErrors'

interface Props {
  control: Control<FlightLogUpsertRequest>
  name: keyof FlightLogUpsertRequest
  props: TextFieldProps
}

export const TxtField = ({ name, control, props }: Props) => {
  const { t } = useTranslation()
  const isSubmitted = useIsFormSubmitted(control)
  return (
    <Controller
      name={name}
      control={control}
      disabled={props.disabled}
      render={({ field, fieldState: { error, isDirty } }) => {
        const showError = shouldShowFieldError(error, isDirty, isSubmitted)

        return (
          <TextField
            {...field}
            value={field.value ?? ''}
            onChange={({ target }) => {
              if (props.type === 'number') {
                field.onChange(target.value ? Number(target.value) : null)
              } else {
                field.onChange(target.value)
              }
            }}
            fullWidth
            label={t(`flightLog.${name}`)}
            error={showError}
            helperText={showError ? error?.message?.toString() : undefined}
            {...props}
          />
        )
      }}
    />
  )
}
