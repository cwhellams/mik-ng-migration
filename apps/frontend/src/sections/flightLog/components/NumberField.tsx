import { TextField, TextFieldProps } from '@mui/material'
import { t } from 'i18next'
import { Control, Controller, GlobalError } from 'react-hook-form'
import { FlightLogMemberRequest } from '@backend/routes/flight-log/models'

interface NumberFieldProps {
  control: Control<FlightLogMemberRequest>
  name: keyof FlightLogMemberRequest
  error?: GlobalError
  props: TextFieldProps
}

export const NumberField = ({
  name,
  control,
  error,
  props,
}: NumberFieldProps) => {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          onChange={({ target }) =>
            field.onChange(target.value ? Number(target.value) : null)
          }
          fullWidth
          type='number'
          label={t(`flightLog.${name}`)}
          error={!!error}
          helperText={error?.message?.toString()}
          {...props}
        />
      )}
    />
  )
}
