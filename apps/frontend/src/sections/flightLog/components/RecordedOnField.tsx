import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form'

interface RecordedOnFieldProps<T extends FieldValues> {
  control: Control<T>
  name: Path<T>
}

/**
 * The date a maintenance note's work was performed / a defect was observed, as it
 * reads in the physical journey log book (#1254).
 *
 * Shared by all four note/defect dialogs, which is the whole reason it is a component:
 * the form value is the wire format (`YYYY-MM-DD`) rather than a Dayjs, so each dialog
 * can put it straight into its POST/PATCH body, and the conversion in both directions
 * lives here once instead of four times.
 *
 * Deliberately not bounded to the past: the value is a transcription of what is written
 * in the paper book, and a rule the client half-enforces (a red field that still
 * submits) reads as a bug rather than a guard.
 */
export const RecordedOnField = <T extends FieldValues>({
  control,
  name,
}: RecordedOnFieldProps<T>) => {
  const { t } = useTranslation()

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState: { error } }) => (
        <DatePicker
          label={t('flightLog.recordedOn')}
          value={field.value ? dayjs(field.value as string) : null}
          // An incomplete or nonsense entry becomes '' rather than 'Invalid Date', which
          // is what the form schema rejects.
          onChange={(value) => field.onChange(value?.isValid() ? value.format('YYYY-MM-DD') : '')}
          slotProps={{
            textField: {
              fullWidth: true,
              required: true,
              error: !!error,
              // The only way this field can fail is a missing or nonsense date, so it
              // gets one translated message rather than zod's English internals.
              helperText: error ? t('flightLog.recordedOnRequired') : t('flightLog.recordedOnHelp'),
              onBlur: field.onBlur,
            },
          }}
        />
      )}
    />
  )
}
