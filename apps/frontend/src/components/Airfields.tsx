import { AirfieldListResponse } from '@mik/contracts/flight-log'
import { Autocomplete, TextField } from '@mui/material'
import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import useApi from '../hooks/useApi'
import { useIsFormSubmitted } from '../hooks/useIsFormSubmitted'
import { formatRequiredFieldError, shouldShowFieldError } from '../utils/formErrors'

interface AirfieldsProps<T extends FieldValues> {
  control: Control<T>
  required?: boolean
  disabled?: boolean
  name: FieldPath<T>
  label: string
}

export const Airfields = <T extends FieldValues>({
  control,
  required,
  disabled,
  name,
  label,
}: AirfieldsProps<T>) => {
  const { t } = useTranslation()
  const isSubmitted = useIsFormSubmitted(control)
  const { data } = useApi<AirfieldListResponse>(
    {
      url: 'v1/flight-logs/airfields',
    },
    {
      // airfields do not change while adding a flight
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  )

  const airfields = data?.airfields ?? []

  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { onChange, value }, fieldState: { error, isDirty } }) => {
        const showError = shouldShowFieldError(error, isDirty, isSubmitted)

        return (
          <Autocomplete
            options={airfields}
            disabled={disabled}
            value={airfields.find((airfield) => airfield.ident === value) ?? null}
            getOptionLabel={(option) => `${option.ident}: ${option.name}`}
            renderInput={(params) => (
              <TextField
                {...params}
                required={required}
                label={label}
                placeholder='ICAO'
                margin='normal'
                slotProps={{
                  ...params.slotProps,

                  inputLabel: {
                    shrink: true,
                  },
                }}
                error={showError}
                helperText={
                  showError ? formatRequiredFieldError(error, t('common.fieldRequired')) : undefined
                }
              />
            )}
            onChange={(_e, airfield) => {
              onChange(airfield?.ident ?? '')
            }}
          />
        )
      }}
    />
  )
}
