import { useState } from 'react'
import {
  Box,
  FormHelperText,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { NumericTimeEntry } from '../components/NumericTimeEntry'
import { calculateNext } from '../../utils/timeUtils'
import { useTimezone } from '../../../../hooks/useTimezone'
import { useServerClock } from '../../../../hooks/useServerClock'
import type { WizardFormProps } from '../types'

type TimeFieldName =
  'offBlockTimeEpoch' | 'takeoffTimeEpoch' | 'landingTimeEpoch' | 'onBlockTimeEpoch'

interface TimeFieldConfig {
  field: TimeFieldName
  label: string
}

interface Props extends WizardFormProps {
  // one or two fields shown on this page, in chronological order — each field after
  // the first chains off the previous field's own value (rather than the step-level
  // referenceEpoch, which only anchors the first field).
  fields: TimeFieldConfig[]
  // epoch seconds string the first field's time-of-day is anchored to (the previous
  // step's last field, or the flight date for off-block) — null if not entered yet,
  // in which case entry is disabled.
  referenceEpoch: string | null
  // fields outside this page to re-trigger once the last field on this page changes
  deps: TimeFieldName[]
  // only the first time page shows the date chip + timezone toggle
  flightDate?: dayjs.Dayjs
  onFlightDateChange?: (date: dayjs.Dayjs) => void
  showTakeoffDelta?: boolean
}

export const TimeStep = ({
  control,
  watch,
  trigger,
  fields,
  referenceEpoch,
  deps,
  flightDate,
  onFlightDateChange,
  showTakeoffDelta,
}: Props) => {
  const { t } = useTranslation()
  const { timezone, setTimezone } = useTimezone()
  const useUtcTime = timezone === 'utc'
  const [showDatePicker, setShowDatePicker] = useState(false)
  const { utcMs } = useServerClock()

  const toDate = (epoch: string | number) => {
    const date = dayjs.unix(Number(epoch))
    return useUtcTime ? date.utc() : date
  }

  const takeoffEpoch = watch('takeoffTimeEpoch')
  // reference for each field: the first anchors to referenceEpoch, later fields
  // chain off the current value of the previous field on this same page
  const priorFieldEpochs = watch(fields.slice(0, -1).map((f) => f.field))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {flightDate &&
        (showDatePicker ? (
          <DatePicker
            label={t('flightLog.flightDate')}
            value={flightDate}
            disableFuture
            format='DD.MM.YYYY'
            onChange={(date) => {
              if (date) onFlightDateChange?.(date)
              setShowDatePicker(false)
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
              {flightDate.isSame(dayjs(), 'day')
                ? t('flightLog.wizard.today', { date: flightDate.format('DD.MM.YYYY') })
                : flightDate.format('DD.MM.YYYY')}
            </Typography>
            <IconButton
              size='small'
              onClick={() => setShowDatePicker(true)}
              aria-label={t('flightLog.wizard.changeDate')}
            >
              <Icon icon='mdi:pencil' width={16} />
            </IconButton>
          </Box>
        ))}

      {flightDate && (
        <ToggleButtonGroup
          value={timezone}
          exclusive
          size='small'
          onChange={(_, v) => v && setTimezone(v)}
        >
          <ToggleButton value='utc' sx={{ minHeight: 44 }}>
            <Icon icon='mdi:earth' style={{ marginRight: 6 }} />
            {t('flightLog.utcTime')}
          </ToggleButton>
          <ToggleButton value='local' sx={{ minHeight: 44 }}>
            <Icon icon='mdi:map-marker' style={{ marginRight: 6 }} />
            {t('flightLog.localTime')}
          </ToggleButton>
        </ToggleButtonGroup>
      )}

      {fields.map((fieldConfig, index) => {
        const fieldReferenceEpoch = index === 0 ? referenceEpoch : priorFieldEpochs[index - 1]
        const refDate = fieldReferenceEpoch ? toDate(fieldReferenceEpoch) : null
        const fieldDeps = index < fields.length - 1 ? [fields[index + 1].field] : deps

        return (
          <Box key={fieldConfig.field} sx={{ width: '100%', textAlign: 'center' }}>
            <Typography variant='body2' sx={{ color: 'text.secondary', mb: 0.5 }}>
              {fieldConfig.label}
            </Typography>
            <Controller
              name={fieldConfig.field}
              control={control}
              render={({ field: rhfField, fieldState: { error } }) => {
                const currentValue = rhfField.value ? toDate(rhfField.value) : null

                const formatError = () => {
                  if (!error) return null
                  if (error.type === 'too_small')
                    return `${t('flightLog.wizard.timeMustBeAfter')} ${toDate(error.message ?? '0').format('HH:mm')}`
                  if (error.type === 'too_big')
                    return `${t('flightLog.wizard.timeMustBeBefore')} ${toDate(error.message ?? '0').format('HH:mm')}`
                  return error.message ?? error.type
                }

                return (
                  <Box>
                    <NumericTimeEntry
                      hour={currentValue ? currentValue.hour() : null}
                      minute={currentValue ? currentValue.minute() : null}
                      disabled={!refDate}
                      onChange={(h, m) => {
                        if (!refDate) return
                        const time = refDate.hour(h).minute(m).second(0)
                        const result = calculateNext(refDate, time)
                        rhfField.onChange(result.unix().toString())
                        fieldDeps.forEach((dep) => trigger(dep))
                      }}
                    />
                    {error && <FormHelperText error>{formatError()}</FormHelperText>}
                    {!refDate && (
                      <FormHelperText>
                        {t('flightLog.wizard.enterPreviousTimeFirst')}
                      </FormHelperText>
                    )}
                  </Box>
                )
              }}
            />
          </Box>
        )
      })}

      {showTakeoffDelta && <TakeoffDelta epoch={takeoffEpoch} utcMs={utcMs} />}
    </Box>
  )
}

// "Takeoff Xmin ago" sanity-check caption, shown once the takeoff time is entered.
const TakeoffDelta = ({ epoch, utcMs }: { epoch: string | undefined; utcMs: number }) => {
  const { t } = useTranslation()
  if (!epoch) return null
  const diffMs = utcMs - Number(epoch) * 1000
  if (diffMs < 0 || diffMs > 2 * 24 * 3600 * 1000) return null
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return null
  const hours = Math.floor(diffMins / 60)
  const mins = diffMins % 60
  const text =
    hours === 0
      ? t('flightLog.wizard.minutesAgo', { count: diffMins })
      : t('flightLog.wizard.hoursMinutesAgo', { hours, minutes: mins })
  return (
    <Typography variant='caption' sx={{ color: 'text.secondary' }}>
      {text}
    </Typography>
  )
}
