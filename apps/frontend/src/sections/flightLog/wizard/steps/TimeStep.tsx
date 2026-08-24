import { useEffect, useState } from 'react'
import { Box, IconButton, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { useController, type Control, type UseFormTrigger } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import type { FlightLogUpsertRequest } from '@mik/contracts/flight-log'
import { TimeEntryField } from '../components/TimeEntryField'
import { calculateNext } from '@mik/ui/utils/duration'
import { vibrate } from '../../../../utils/haptics'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
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
  // false only for the very first time field in the whole flow (off-block) — its
  // "reference" is just the flight date, not a real previous time, so it must not be
  // auto-seeded from it. Every other field defaults to true.
  seedFirstFromReference?: boolean
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
  seedFirstFromReference = true,
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
              if (date) {
                vibrate()
                onFlightDateChange?.(date)
              }
              setShowDatePicker(false)
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant='subtitle1' sx={{ fontWeight: 700, color: 'text.primary' }}>
              {flightDate.isSame(dayjs(), 'day')
                ? t('flightLog.wizard.today', { date: flightDate.format('DD.MM.YYYY') })
                : flightDate.format('DD.MM.YYYY')}
            </Typography>
            <IconButton
              size='small'
              onClick={() => setShowDatePicker(true)}
              aria-label={t('flightLog.wizard.changeDate')}
            >
              <Icon icon='mdi:pencil' width={20} />
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

      <Box sx={{ width: '100%', mt: flightDate ? 3 : 0 }} />

      {fields.map((fieldConfig, index) => {
        const fieldReferenceEpoch = index === 0 ? referenceEpoch : priorFieldEpochs[index - 1]
        const refDate = fieldReferenceEpoch ? toDate(fieldReferenceEpoch) : null
        const fieldDeps = index < fields.length - 1 ? [fields[index + 1].field] : deps
        const shouldSeed = index > 0 || seedFirstFromReference

        return (
          <TimeFieldWheel
            key={fieldConfig.field}
            name={fieldConfig.field}
            label={fieldConfig.label}
            control={control}
            trigger={trigger}
            refDate={refDate}
            fieldDeps={fieldDeps}
            shouldSeed={shouldSeed}
            toDate={toDate}
          />
        )
      })}

      {showTakeoffDelta && <TakeoffDelta epoch={takeoffEpoch} utcMs={utcMs} />}
    </Box>
  )
}

interface TimeFieldWheelProps {
  name: TimeFieldName
  label: string
  control: Control<FlightLogUpsertRequest>
  trigger: UseFormTrigger<FlightLogUpsertRequest>
  // the previous field's time-of-day this field is anchored to — null if not entered
  // yet, in which case this field stays disabled.
  refDate: dayjs.Dayjs | null
  // fields outside this page to re-trigger once this field changes
  fieldDeps: TimeFieldName[]
  // whether to auto-fill this field from refDate the first time refDate becomes
  // available and the field itself is still empty.
  shouldSeed: boolean
  toDate: (epoch: string | number) => dayjs.Dayjs
}

// One field's wheel entry — off-block, takeoff, landing, or on-block. Handles both the
// forward auto-seeding from the previous time and the red error highlighting.
const TimeFieldWheel = ({
  name,
  label,
  control,
  trigger,
  refDate,
  fieldDeps,
  shouldSeed,
  toDate,
}: TimeFieldWheelProps) => {
  const { t } = useTranslation()
  const {
    field: rhfField,
    fieldState: { error },
  } = useController({ name, control })
  const currentValue = rhfField.value ? toDate(rhfField.value) : null

  // Auto-seed forward, once: the first time this field's reference becomes available
  // and the field itself has never been set, default it to a minute after the
  // reference (e.g. takeoff defaults to off-block + 1min) — a plausible, already-valid
  // starting point the user can then adjust by scrolling. Guarded on the field's own
  // value being empty, so it never overwrites a value the user (or a previous seed)
  // already set, and never cascades backward when an earlier field is edited later.
  useEffect(() => {
    if (shouldSeed && refDate && !rhfField.value) {
      const seeded = refDate.add(1, 'minute')
      rhfField.onChange(seeded.unix().toString())
      fieldDeps.forEach((dep) => trigger(dep))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refDate, shouldSeed])

  const formatError = () => {
    if (!error) return null
    if (error.type === 'too_small')
      return t('flightLog.wizard.timeMustBeAfter', {
        time: toDate(error.message ?? '0').format('HH:mm'),
      })
    if (error.type === 'too_big') {
      if (error.message?.startsWith('future:')) return t('flightLog.wizard.timeCannotBeFuture')
      return t('flightLog.wizard.timeMustBeBefore', {
        time: toDate(error.message ?? '0').format('HH:mm'),
      })
    }
    return error.message ?? error.type
  }

  // Only show validation errors once the user has actually entered a value for this
  // field — with mode:'onChange' the shared resolver re-validates the whole form on
  // every keystroke, which would otherwise surface errors for still-empty fields on
  // later steps.
  const hasError = !!error && !!currentValue

  return (
    <TimeEntryField
      label={label}
      hour={currentValue ? currentValue.hour() : null}
      minute={currentValue ? currentValue.minute() : null}
      disabled={!refDate}
      error={hasError}
      errorMessage={formatError()}
      disabledMessage={t('flightLog.wizard.enterPreviousTimeFirst')}
      onChange={(h, m) => {
        if (!refDate) return
        const time = refDate.hour(h).minute(m).second(0)
        const result = calculateNext(refDate, time)
        rhfField.onChange(result.unix().toString())
        fieldDeps.forEach((dep) => trigger(dep))
      }}
    />
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
