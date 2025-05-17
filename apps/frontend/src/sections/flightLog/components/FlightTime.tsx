import {
  Grid,
  TextField,
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import {
  FieldErrors,
  GlobalError,
  UseFormClearErrors,
  UseFormRegister,
  UseFormSetError,
  UseFormSetValue,
} from 'react-hook-form'
import { Icon } from '@iconify/react'
import { useEffect, useState } from 'react'
import {
  FlightLog,
  FlightLogMemberRequest,
} from '@backend/routes/flight-log/models'
import dayjs from 'dayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import {
  toTimeString,
  timeStringToDayjs,
  formatTimeInput,
} from '../utils/timeUtils'
import { getTimezoneDisplay, getTimeExample } from '../utils/timezoneUtils'
import { useTranslation } from 'react-i18next'

interface FlightTimeProps {
  data?: FlightLog
  register: UseFormRegister<FlightLogMemberRequest>
  setValue: UseFormSetValue<FlightLogMemberRequest>
  errors: FieldErrors<FlightLogMemberRequest>
  setError: UseFormSetError<FlightLogMemberRequest>
  clearErrors: UseFormClearErrors<FlightLogMemberRequest>
}

export const FlightTime = ({
  data,
  register,
  setValue,
  errors,
  setError,
  clearErrors,
}: FlightTimeProps) => {
  const { t } = useTranslation()

  // date and text inputs for time entries
  const [timeComponents, setTimeComponents] = useState<{
    flightDate: dayjs.Dayjs
    offBlockTime: string
    takeoffTime: string
    landingTime: string
    onBlockTime: string
    useUtcTime: boolean
  }>({
    flightDate: dayjs().startOf('day'),
    offBlockTime: '',
    takeoffTime: '',
    landingTime: '',
    onBlockTime: '',
    useUtcTime: true,
  })

  // register epoch fields but set them manually
  register('offBlockTimeEpoch')
  register('takeoffTimeEpoch')
  register('landingTimeEpoch')
  register('onBlockTimeEpoch')

  // load values for existing flight
  useEffect(() => {
    if (data) {
      setTimeComponents(({ useUtcTime }) => ({
        flightDate: dayjs(data.offBlockTimeUtc).startOf('day'),
        offBlockTime: toTimeString(dayjs(data.offBlockTimeUtc), useUtcTime),
        takeoffTime: toTimeString(dayjs(data.takeoffTimeUtc), useUtcTime),
        landingTime: toTimeString(dayjs(data.landingTimeUtc), useUtcTime),
        onBlockTime: toTimeString(dayjs(data.onBlockTimeUtc), useUtcTime),
        useUtcTime,
      }))
      console.log(data)
    }
  }, [data])

  // reprocess all timestring when any of the time inputs change
  useEffect(() => {
    const {
      flightDate,
      offBlockTime,
      takeoffTime,
      landingTime,
      onBlockTime,
      useUtcTime,
    } = timeComponents
    if (!flightDate) return

    const setTimeValues = (
      field:
        | 'offBlockTimeEpoch'
        | 'takeoffTimeEpoch'
        | 'landingTimeEpoch'
        | 'onBlockTimeEpoch',
      { date, error }: { date?: dayjs.Dayjs; error?: string }
    ) => {
      if (error) {
        setError(field, { type: 'manual', message: t(error) })
      } else {
        clearErrors(field)
      }
      setValue(field, date?.unix()?.toString() ?? '')
      return date ?? flightDate
    }

    // off block date
    const date = useUtcTime
      ? dayjs.utc(flightDate.format('YYYY-MM-DD'))
      : flightDate.clone()

    // off block time
    const offBlock = setTimeValues(
      'offBlockTimeEpoch',
      timeStringToDayjs(offBlockTime, date)
    )

    // takeoff must be within 100 minutes of off block
    const takeoff = setTimeValues(
      'takeoffTimeEpoch',
      timeStringToDayjs(takeoffTime, offBlock, 100)
    )

    // max 10 hours flight time allowed
    const landing = setTimeValues(
      'landingTimeEpoch',
      timeStringToDayjs(landingTime, takeoff, 600)
    )

    // on block time within 100 minutes of landing
    setTimeValues(
      'onBlockTimeEpoch',
      timeStringToDayjs(onBlockTime, landing, 100)
    )
  }, [timeComponents, setError, clearErrors, setValue, t])

  return (
    <>
      <Grid size={{ xs: 12, md: 6 }}>
        <DatePicker
          label={t('flightLog.flightDate')}
          value={timeComponents.flightDate}
          disableFuture={true}
          onChange={(flightDate) =>
            setTimeComponents((prev) => ({
              ...prev,
              flightDate: flightDate ?? prev.flightDate,
            }))
          }
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
            value={timeComponents.useUtcTime ? 'utc' : 'local'}
            exclusive
            onChange={(_, newValue) => {
              if (newValue !== null) {
                setTimeComponents((prev) => ({
                  ...prev,
                  useUtcTime: newValue === 'utc',
                }))
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
                timeComponents.useUtcTime
                  ? 'mdi:clock-outline'
                  : 'mdi:clock-time-eight-outline'
              }
              style={{ marginRight: '8px', fontSize: '16px' }}
            />
            <Typography variant='caption' color='text.secondary'>
              {timeComponents.useUtcTime
                ? t('flightLog.usingUtcTime')
                : t('flightLog.usingLocalTime')}{' '}
              {!timeComponents.useUtcTime &&
                `(${getTimezoneDisplay(timeComponents.useUtcTime, timeComponents.flightDate)})`}
              {' - '}
              {t('flightLog.currentTime')}:{' '}
              {getTimeExample(
                timeComponents.useUtcTime,
                timeComponents.flightDate
              )}
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
          value={timeComponents.offBlockTime}
          setValue={(offBlockTime) =>
            setTimeComponents((prev) => ({
              ...prev,
              offBlockTime,
            }))
          }
          useUtcTime={timeComponents.useUtcTime}
          error={errors.offBlockTimeEpoch}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <TimeStringEditor
          label={t('flightLog.takeoffTime')}
          value={timeComponents.takeoffTime}
          setValue={(takeoffTime) =>
            setTimeComponents((prev) => ({
              ...prev,
              takeoffTime,
            }))
          }
          useUtcTime={timeComponents.useUtcTime}
          error={errors.takeoffTimeEpoch}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <TimeStringEditor
          label={t('flightLog.landingTime')}
          value={timeComponents.landingTime}
          setValue={(landingTime) =>
            setTimeComponents((prev) => ({
              ...prev,
              landingTime,
            }))
          }
          useUtcTime={timeComponents.useUtcTime}
          error={errors.landingTimeEpoch}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <TimeStringEditor
          label={t('flightLog.onBlockTime')}
          value={timeComponents.onBlockTime}
          setValue={(onBlockTime) =>
            setTimeComponents((prev) => ({
              ...prev,
              onBlockTime,
            }))
          }
          useUtcTime={timeComponents.useUtcTime}
          error={errors.onBlockTimeEpoch}
        />
      </Grid>
    </>
  )
}

const TimeStringEditor = ({
  label,
  value,
  setValue,
  useUtcTime,
  error,
}: {
  label: string
  value: string
  setValue: (time: string) => void
  useUtcTime: boolean
  error?: GlobalError
}) => {
  const { t } = useTranslation()

  return (
    <TextField
      fullWidth
      required
      label={
        useUtcTime ? `${label} (UTC)` : `${label} (${t('flightLog.local')})`
      }
      placeholder='HHMM'
      value={value}
      onChange={({ target }) => setValue(formatTimeInput(target.value))}
      error={!!error}
      helperText={error?.message?.toString() || t('flightLog.timeFormat')}
      slotProps={{ htmlInput: { maxLength: 4, inputMode: 'number' } }}
      type='number'
    />
  )
}
