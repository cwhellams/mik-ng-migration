import {
  Grid,
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  FormHelperText,
} from '@mui/material'
import {
  Control,
  Controller,
  FieldError,
  UseFormGetValues,
  UseFormSetValue,
  UseFormTrigger,
  UseFormWatch,
} from 'react-hook-form'
import { Icon } from '@iconify/react'
import { useEffect, useMemo, useState } from 'react'
import { useServerClock } from '../../../hooks/useServerClock'
import { formatTimeInTz, getOffsetLabelInTz } from '../../../utils/date'
import { FlightLog, FlightLogUpsertRequest } from '@backend/routes/flight-log/models'
import dayjs from 'dayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { getTimezoneDisplay } from '../utils/timezoneUtils'
import { useTranslation } from 'react-i18next'
import { TimeField } from '@mui/x-date-pickers/TimeField'
import { calculateNext } from '../utils/timeUtils'
import { useTimezone } from '../../../hooks/useTimezone'
import { useIsFormSubmitted } from '../../../hooks/useIsFormSubmitted'
import { shouldShowFieldError } from '../../../utils/formErrors'

interface FlightTimeProps {
  data?: FlightLog
  control: Control<FlightLogUpsertRequest>
  getValues: UseFormGetValues<FlightLogUpsertRequest>
  setValue: UseFormSetValue<FlightLogUpsertRequest> | undefined
  watch: UseFormWatch<FlightLogUpsertRequest>
  trigger: UseFormTrigger<FlightLogUpsertRequest>
}

export const FlightTime = ({
  data,
  control,
  getValues,
  setValue,
  watch,
  trigger,
}: FlightTimeProps) => {
  const { t } = useTranslation()

  // date and text inputs for time entries
  const [flightDate, setFlightDate] = useState<dayjs.Dayjs>(dayjs().utc().startOf('day'))

  const { timezone, setTimezone } = useTimezone()

  // load the existing day
  useEffect(() => {
    if (data) {
      setFlightDate(dayjs.utc(data.offBlockTimeUtc).startOf('day'))
    }
  }, [data])

  // if day changes, recalculate all times
  useEffect(() => {
    if (!flightDate) return

    const setTimeFromEpoch = (
      base: dayjs.Dayjs,
      field: 'offBlockTimeEpoch' | 'takeoffTimeEpoch' | 'landingTimeEpoch' | 'onBlockTimeEpoch',
    ) => {
      const epoch = getValues(field)
      if (!epoch) {
        return null
      }

      const time = dayjs.unix(Number(getValues(field))).utc()
      const result = calculateNext(base, time)
      setValue?.(field, result.unix().toString())

      return result
    }

    const offBlockTime = setTimeFromEpoch(flightDate, 'offBlockTimeEpoch')
    const takeOffTime = offBlockTime && setTimeFromEpoch(offBlockTime, 'takeoffTimeEpoch')

    const landingTime = takeOffTime && setTimeFromEpoch(takeOffTime, 'landingTimeEpoch')

    if (landingTime) {
      setTimeFromEpoch(landingTime, 'onBlockTimeEpoch')
    }
  }, [flightDate, setValue, getValues])

  const isEditable = !!setValue

  const { utcMs, synced } = useServerClock()

  const helOffset = getOffsetLabelInTz(utcMs, 'helsinki')
  const localOffset = getOffsetLabelInTz(utcMs, 'local')

  // How long ago was takeoff relative to server time (shown under the takeoff field)
  const takeoffEpoch = watch('takeoffTimeEpoch')
  const takeoffDeltaText = useMemo(() => {
    if (!takeoffEpoch || !utcMs) return null
    const diffMs = utcMs - Number(takeoffEpoch) * 1000
    if (diffMs < 0) return null // takeoff is in the future
    if (diffMs > 2 * 24 * 3600 * 1000) return null // only relevant for recent flights
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just took off'
    if (diffMins < 60) return `Takeoff ${diffMins}min ago`
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return mins === 0 ? `Takeoff ${hours}h ago` : `Takeoff ${hours}h ${mins}min ago`
  }, [utcMs, takeoffEpoch])

  return (
    <>
      <Grid size={{ xs: 12, sm: 6 }}>
        <DatePicker
          label={t('flightLog.flightDate')}
          value={flightDate}
          disabled={!isEditable}
          disableFuture={true}
          format='DD.MM.YYYY'
          onChange={(date) => setFlightDate(date ?? flightDate)}
          slotProps={{
            textField: {
              fullWidth: true,
              required: true,
              margin: 'normal',
            },
          }}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <Box>
          <Typography variant='body2' gutterBottom>
            {t('flightLog.timeZone')}
          </Typography>

          {/* Toggle + live clock side by side */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
              mb: 1,
            }}
          >
            <ToggleButtonGroup
              value={timezone}
              exclusive
              onChange={(_, newValue) => {
                if (newValue !== null) {
                  setTimezone(newValue)
                }
              }}
              aria-label='time format'
              size='small'
            >
              <ToggleButton value='utc' aria-label='UTC time'>
                <Icon icon='mdi:earth' style={{ marginRight: '8px' }} />
                {t('flightLog.utcTime')}
              </ToggleButton>
              <ToggleButton value='local' aria-label='Local time'>
                <Icon icon='mdi:map-marker' style={{ marginRight: '8px' }} />
                {t('flightLog.localTime')}
              </ToggleButton>
            </ToggleButtonGroup>

            {synced && (
              <Box
                sx={{
                  display: 'flex',
                  alignSelf: 'stretch',
                  alignItems: 'center',
                  gap: 2,
                  px: 1.5,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      lineHeight: 1.3,
                    }}
                  >
                    UTC
                  </Typography>

                  <Typography
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      lineHeight: 1.3,
                    }}
                  >
                    {formatTimeInTz(utcMs, 'utc', { showSeconds: true })}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      lineHeight: 1.3,
                    }}
                  >
                    {localOffset === helOffset ? 'HEL ' : null}
                    {localOffset}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      lineHeight: 1.3,
                    }}
                  >
                    {formatTimeInTz(utcMs, 'local', { showSeconds: true })}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>

          {/* Time zone helper text */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Icon
              icon={timezone === 'utc' ? 'mdi:clock-outline' : 'mdi:clock-time-eight-outline'}
              style={{ marginRight: '8px' }}
            />
            <Typography
              variant='caption'
              sx={{
                color: 'text.secondary',
              }}
            >
              {timezone === 'utc' ? t('flightLog.usingUtcTime') : t('flightLog.usingLocalTime')}{' '}
              {timezone !== 'utc' && `(${getTimezoneDisplay(false, flightDate)})`}
            </Typography>
          </Box>
        </Box>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography
          variant='subtitle2'
          gutterBottom
          sx={{
            color: 'text.secondary',
          }}
        >
          {t('flightLog.timeInputFormat')}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <TimeStringEditor
          label={t('flightLog.offBlockTime')}
          control={control}
          disabled={!isEditable}
          name='offBlockTimeEpoch'
          min={flightDate.unix().toString()}
          useUtcTime={timezone === 'utc'}
          trigger={trigger}
          deps={getValues('takeoffTimeEpoch') ? ['takeoffTimeEpoch'] : []}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <TimeStringEditor
          label={t('flightLog.takeoffTime')}
          control={control}
          disabled={!isEditable}
          name='takeoffTimeEpoch'
          min={watch('offBlockTimeEpoch')}
          useUtcTime={timezone === 'utc'}
          trigger={trigger}
          deps={getValues('landingTimeEpoch') ? ['landingTimeEpoch'] : []}
        />
        {takeoffDeltaText && (
          <Typography
            variant='caption'
            sx={{
              color: 'text.secondary',
              mt: 0.5,
              display: 'block',
              pl: 0.5,
            }}
          >
            {takeoffDeltaText}
          </Typography>
        )}
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <TimeStringEditor
          label={t('flightLog.landingTime')}
          control={control}
          disabled={!isEditable}
          name='landingTimeEpoch'
          min={watch('takeoffTimeEpoch')}
          useUtcTime={timezone === 'utc'}
          trigger={trigger}
          deps={getValues('onBlockTimeEpoch') ? ['onBlockTimeEpoch'] : []}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <TimeStringEditor
          label={t('flightLog.onBlockTime')}
          control={control}
          disabled={!isEditable}
          name='onBlockTimeEpoch'
          min={watch('landingTimeEpoch')}
          useUtcTime={timezone === 'utc'}
          trigger={trigger}
          deps={[]}
        />
      </Grid>
    </>
  )
}

const TimeStringEditor = ({
  label,
  name,
  control,
  disabled,
  min,
  useUtcTime,
  trigger,
  deps,
}: {
  label: string
  name: keyof FlightLogUpsertRequest
  control: Control<FlightLogUpsertRequest>
  disabled: boolean
  min: string
  useUtcTime: boolean
  trigger: UseFormTrigger<FlightLogUpsertRequest>
  deps: (keyof FlightLogUpsertRequest)[]
}) => {
  const { t } = useTranslation()
  const isSubmitted = useIsFormSubmitted(control)

  const toDate = (epoch: string | number | true) => {
    const date = dayjs.unix(Number(epoch))
    return useUtcTime ? date.utc() : date
  }

  const formatError = (error: FieldError) => {
    if (error.type === 'invalid_type') {
      return t('flightLog.error.fieldRequired')
    }
    if (error.type == 'too_small') {
      return t('flightLog.wizard.timeMustBeAfter', {
        time: toDate(error.message ?? '').format('HH:mm'),
      })
    }
    if (error.type == 'too_big') {
      if (error.message?.startsWith('future:')) return t('flightLog.wizard.timeCannotBeFuture')
      return t('flightLog.wizard.timeMustBeBefore', {
        time: toDate(error.message ?? '').format('HH:mm'),
      })
    }
    return error.message ?? error.type
  }

  const minDate = min ? toDate(min) : undefined

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState: { error, isDirty } }) => {
        const showError = shouldShowFieldError(error, isDirty, isSubmitted)

        return (
          <FormControl fullWidth error={showError}>
            <TimeField
              {...field}
              required
              disabled={disabled}
              ampm={false}
              disableFuture
              inputRef={field.ref}
              disableIgnoringDatePartForTimeValidation={true}
              timezone={useUtcTime ? 'UTC' : 'system'}
              referenceDate={useUtcTime ? minDate?.utc() : minDate}
              value={field.value ? toDate(field.value) : null}
              onChange={(time) => {
                if (!time?.isValid() || !minDate) {
                  return field.onChange('')
                }
                const dateTime = calculateNext(minDate, time)
                field.onChange(dateTime.unix().toString())

                // trigger validation of dependent fields
                deps.forEach((dep) => {
                  trigger(dep)
                })
              }}
              label={useUtcTime ? `${label} (UTC)` : `${label} (${t('flightLog.local')})`}
            />
            {showError && error && <FormHelperText>{formatError(error)}</FormHelperText>}
          </FormControl>
        )
      }}
    />
  )
}
