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
import { useEffect, useState } from 'react'
import {
  FlightLog,
  FlightLogMemberRequest,
} from '@backend/routes/flight-log/models'
import dayjs from 'dayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { getTimezoneDisplay, getTimeExample } from '../utils/timezoneUtils'
import { useTranslation } from 'react-i18next'
import { TimeField } from '@mui/x-date-pickers/TimeField'
import { calculateNext } from '../utils/timeUtils'

interface FlightTimeProps {
  data?: FlightLog
  control: Control<FlightLogMemberRequest>
  getValues: UseFormGetValues<FlightLogMemberRequest>
  setValue: UseFormSetValue<FlightLogMemberRequest>
  watch: UseFormWatch<FlightLogMemberRequest>
  trigger: UseFormTrigger<FlightLogMemberRequest>
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
  const [flightDate, setFlightDate] = useState<dayjs.Dayjs>(
    dayjs().utc().startOf('day')
  )

  const [useUtcTime, setUseUtcTime] = useState<boolean>(true)

  // load the existing day
  useEffect(() => {
    if (data) {
      setFlightDate(dayjs(data.offBlockTimeUtc).startOf('day'))
    }
  }, [data])

  // if day changes, recalculate all times
  useEffect(() => {
    if (!flightDate) return

    const setTimeFromEpoch = (
      base: dayjs.Dayjs,
      field:
        | 'offBlockTimeEpoch'
        | 'takeoffTimeEpoch'
        | 'landingTimeEpoch'
        | 'onBlockTimeEpoch'
    ) => {
      const epoch = getValues(field)
      if (!epoch) {
        return null
      }

      const time = dayjs.unix(Number(getValues(field)))
      const result = calculateNext(base, time)
      setValue(field, result.unix().toString())

      return result
    }

    const offBlockTime = setTimeFromEpoch(flightDate, 'offBlockTimeEpoch')
    const takeOffTime =
      offBlockTime && setTimeFromEpoch(offBlockTime, 'takeoffTimeEpoch')

    const landingTime =
      takeOffTime && setTimeFromEpoch(takeOffTime, 'landingTimeEpoch')

    if (landingTime) {
      setTimeFromEpoch(landingTime, 'onBlockTimeEpoch')
    }
  }, [flightDate, setValue, getValues])

  return (
    <>
      <Grid size={{ xs: 12, md: 6 }}>
        <DatePicker
          label={t('flightLog.flightDate')}
          value={flightDate}
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
      <Grid size={{ xs: 12, md: 6 }}>
        <Box>
          <Typography variant='body2' gutterBottom>
            {t('flightLog.timeZone')}
          </Typography>
          <ToggleButtonGroup
            value={useUtcTime ? 'utc' : 'local'}
            exclusive
            onChange={(_, newValue) => {
              if (newValue !== null) {
                setUseUtcTime(newValue === 'utc')
              }
            }}
            aria-label='time format'
            size='small'
            sx={{ mb: 1 }}
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

          {/* Time zone information on its own row */}
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
            <Icon
              icon={
                useUtcTime
                  ? 'mdi:clock-outline'
                  : 'mdi:clock-time-eight-outline'
              }
              style={{ marginRight: '8px', fontSize: '16px' }}
            />
            <Typography variant='caption' color='text.secondary'>
              {useUtcTime
                ? t('flightLog.usingUtcTime')
                : t('flightLog.usingLocalTime')}{' '}
              {!useUtcTime && `(${getTimezoneDisplay(useUtcTime, flightDate)})`}
              {' - '}
              {t('flightLog.currentTime')}:{' '}
              {getTimeExample(useUtcTime, flightDate)}
            </Typography>
          </Box>
        </Box>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='subtitle2' gutterBottom color='text.secondary'>
          {t('flightLog.timeInputFormat')}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <TimeStringEditor
          label={t('flightLog.offBlockTime')}
          control={control}
          name='offBlockTimeEpoch'
          min={flightDate.unix().toString()}
          useUtcTime={useUtcTime}
          trigger={trigger}
          deps={getValues('takeoffTimeEpoch') ? ['takeoffTimeEpoch'] : []}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <TimeStringEditor
          label={t('flightLog.takeoffTime')}
          control={control}
          name='takeoffTimeEpoch'
          min={watch('offBlockTimeEpoch')}
          useUtcTime={useUtcTime}
          trigger={trigger}
          deps={getValues('landingTimeEpoch') ? ['landingTimeEpoch'] : []}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <TimeStringEditor
          label={t('flightLog.landingTime')}
          control={control}
          name='landingTimeEpoch'
          min={watch('takeoffTimeEpoch')}
          useUtcTime={useUtcTime}
          trigger={trigger}
          deps={getValues('onBlockTimeEpoch') ? ['onBlockTimeEpoch'] : []}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <TimeStringEditor
          label={t('flightLog.onBlockTime')}
          control={control}
          name='onBlockTimeEpoch'
          min={watch('landingTimeEpoch')}
          useUtcTime={useUtcTime}
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
  min,
  useUtcTime,
  trigger,
  deps,
}: {
  label: string
  name: keyof FlightLogMemberRequest
  control: Control<FlightLogMemberRequest>
  min: string
  useUtcTime: boolean
  trigger: UseFormTrigger<FlightLogMemberRequest>
  deps: (keyof FlightLogMemberRequest)[]
}) => {
  const { t } = useTranslation()

  const toDate = (epoch: string | number) => {
    const date = dayjs.unix(Number(epoch))
    return useUtcTime ? date.utc() : date
  }

  const formatError = (error: FieldError) => {
    if (error.type == 'too_small') {
      return `> ${toDate(error.message ?? '').format('HH:mm')}`
    }
    if (error.type == 'too_big') {
      return `<= ${toDate(error.message ?? '').format('HH:mm')}`
    }
    return error.message ?? error.type
  }

  const minDate = min ? toDate(min) : undefined

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState: { error } }) => (
        <FormControl fullWidth error={!!error}>
          <TimeField
            {...field}
            required
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
            label={
              useUtcTime
                ? `${label} (UTC)`
                : `${label} (${t('flightLog.local')})`
            }
          />
          {error && <FormHelperText>{formatError(error)}</FormHelperText>}
        </FormControl>
      )}
    />
  )
}
