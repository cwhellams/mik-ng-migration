import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useIsFormSubmitted } from '../hooks/useIsFormSubmitted'
import { formatRequiredFieldError, shouldShowFieldError } from '../utils/formErrors'
import { AirfieldAutocomplete } from './AirfieldAutocomplete'

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

  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { onChange, value }, fieldState: { error, isDirty } }) => {
        const showError = shouldShowFieldError(error, isDirty, isSubmitted)

        return (
          <AirfieldAutocomplete
            value={value}
            onChange={onChange}
            required={required}
            disabled={disabled}
            label={label}
            error={showError}
            helperText={
              showError ? formatRequiredFieldError(error, t('common.fieldRequired')) : undefined
            }
          />
        )
      }}
    />
  )
}
