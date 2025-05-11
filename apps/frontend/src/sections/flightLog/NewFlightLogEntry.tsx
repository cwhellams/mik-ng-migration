import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Breadcrumbs,
  Link,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
} from '@mui/material'

import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  FlightLog,
  FlightLogMemberUpsertSchema,
  type FlightLogMemberRequest,
} from '@backend/routes/flight-log/models'
import useApi from '../../hooks/useApi'
import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import FlightTimeline from './components/FlightTimeline'
import { formatTimeInput, timeStringToDayjs } from './utils/timeUtils'
import { getTimeExample, getTimezoneDisplay } from './utils/timezoneUtils'
import FlightCrew from './components/FlightCrew'
import { useMe } from '../../hooks/useMe'
const flightTypes = [
  { code: 'HAR', labelKey: 'flightLog.flightTypes.practice' },
  { code: 'MAT', labelKey: 'flightLog.flightTypes.cross_country' },
  { code: 'KOU', labelKey: 'flightLog.flightTypes.instruction' },
  { code: 'TAR', labelKey: 'flightLog.flightTypes.profiniencyCheck' },
  { code: 'LEN', labelKey: 'flightLog.flightTypes.skillTest' },
  { code: 'SII', labelKey: 'flightLog.flightTypes.ferry' },
  { code: 'KOE', labelKey: 'flightLog.flightTypes.test' },
  // { code: 'TAI', labelKey: 'flightLog.flightTypes.aerobatics' },
]

const NewFlightLogEntry = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [useUtcTime, setUseUtcTime] = useState(true)
  const [flightDate, setFlightDate] = useState<dayjs.Dayjs | null>(null)

  // Text input state for time entries
  const [offBlockTime, setOffBlockTime] = useState<string>('')
  const [takeoffTime, setTakeoffTime] = useState<string>('')
  const [landingTime, setLandingTime] = useState<string>('')
  const [onBlockTime, setOnBlockTime] = useState<string>('')

  const { me } = useMe()

  const { mutation } = useApi<FlightLog>({
    url: 'v1/flight-logs',
    skipFetch: true,
  })

  const { data: aircraftData } = useApi<AircraftListResponse>({
    url: 'v1/aircrafts',
  })

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
    clearErrors,
    setError,
    setValue,
    getValues,
  } = useForm<FlightLogMemberRequest>({
    mode: 'onChange',
    resolver: zodResolver(FlightLogMemberUpsertSchema),
    defaultValues: {
      numberOfLandings: 1,
      personsOnBoard: 1,

      picRole: 'PIC',
      totalTimeInService: 0,
      privOrComFlight: 'P',
      incidentOrObservations: null,

      nightFlyingMins: 0,
      instrumentFlyingMins: 0,
      fuelUpliftLitres: null,
      oilUpliftLitres: null,
    },
  })

  useEffect(() => {
    setValue('billableMemberId', me?.memberId ?? '')
    setValue('picMemberId', me?.memberId ?? '')
  }, [me, setValue])

  console.log(errors)

  const epochToDayjs = (
    field:
      | 'offBlockTimeEpoch'
      | 'takeoffTimeEpoch'
      | 'landingTimeEpoch'
      | 'onBlockTimeEpoch'
  ) => (getValues(field) ? dayjs.unix(Number(getValues(field))) : null)

  useEffect(() => {
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
      // console.log('setTimeValues', field, error, date)
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
  }, [
    flightDate,
    offBlockTime,
    takeoffTime,
    landingTime,
    onBlockTime,
    setError,
    clearErrors,
    setValue,
    t,
    useUtcTime,
  ])

  // Update onSubmit to use our dayjs objects
  const onSubmit = async (data: FlightLogMemberRequest) => {
    if (!flightDate) {
      return
    }

    const { error } = await mutation.trigger('POST', data)
    if (error) {
      console.error('Error saving flight data:', error)
      return setError('root', {
        type: error?.detail ?? error?.title ?? 'Error',
      })
    }

    navigate('/flight-logs')
  }

  const handleCancel = () => {
    navigate('/flight-logs')
  }

  return (
    <Box>
      {/* Breadcrumb navigation */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          component={RouterLink}
          to='/flight-logs'
          underline='hover'
          color='inherit'
        >
          {t('flightLog.title')}
        </Link>
        <Typography color='text.primary'>{t('flightLog.newEntry')}</Typography>
      </Breadcrumbs>
      {/* Page title */}
      <Typography variant='h2' gutterBottom>
        {t('flightLog.newEntry')}
      </Typography>

      <Paper sx={{ p: 3, mt: 2 }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>
            {/* Aircraft Information */}
            <Grid size={{ xs: 12 }}>
              <Typography variant='h6' gutterBottom>
                {t('flightLog.aircraftInfo')}
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth error={!!errors.aircraftRegistration}>
                <InputLabel>{t('flightLog.aircraft')}</InputLabel>
                <Controller
                  name='aircraftRegistration'
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      value={field.value || ''}
                      label={t('flightLog.aircraft')}
                      disabled={!aircraftData?.aircrafts}
                    >
                      {aircraftData?.aircrafts &&
                        aircraftData.aircrafts.map((aircraft) => (
                          <MenuItem
                            key={aircraft.registration}
                            value={aircraft.registration}
                          >
                            {aircraft.registration}
                          </MenuItem>
                        ))}
                    </Select>
                  )}
                />
                {errors.aircraftRegistration && (
                  <FormHelperText>
                    {errors.aircraftRegistration.message?.toString()}
                  </FormHelperText>
                )}
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth error={!!errors.flightType}>
                <InputLabel>{t('flightLog.flightType')}</InputLabel>
                <Controller
                  name='flightType'
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      value={field.value || ''}
                      label={`${t('flightLog.flightType')}`}
                    >
                      {flightTypes.map((type) => (
                        <MenuItem key={type.code} value={type.code}>
                          {t(type.labelKey)}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
                {errors.flightType && (
                  <FormHelperText>
                    {errors.flightType.message?.toString()}
                  </FormHelperText>
                )}
              </FormControl>
            </Grid>

            {/* Flight Crew */}
            <Grid size={{ xs: 12 }}>
              <Typography variant='h6' gutterBottom>
                {t('flightLog.crew')}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FlightCrew
                flightType={watch('flightType')}
                register={register}
                control={control}
                errors={errors}
              />
            </Grid>

            {/* Flight Date and Time Settings */}
            <Grid size={{ xs: 12 }}>
              <Typography variant='h6' gutterBottom>
                {t('flightLog.times')}
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <DatePicker
                label={t('flightLog.flightDate')}
                value={flightDate}
                onChange={setFlightDate}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true,
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
                    <Icon
                      icon='mdi:map-marker'
                      style={{ marginRight: '8px' }}
                    />
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
                    {!useUtcTime &&
                      `(${getTimezoneDisplay(useUtcTime, flightDate)})`}
                    {' - '}
                    {t('flightLog.currentTime')}:{' '}
                    {getTimeExample(useUtcTime, flightDate)}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Typography
                variant='subtitle2'
                gutterBottom
                color='text.secondary'
              >
                {t('flightLog.timeInputFormat')}
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                required
                label={
                  useUtcTime
                    ? `${t('flightLog.offBlockTime')} (UTC)`
                    : `${t('flightLog.offBlockTime')} (${t('flightLog.local')})`
                }
                placeholder='HHMM'
                value={offBlockTime}
                onChange={({ target }) =>
                  setOffBlockTime(formatTimeInput(target.value))
                }
                error={!!errors.offBlockTimeEpoch}
                helperText={
                  errors.offBlockTimeEpoch?.message?.toString() ||
                  t('flightLog.timeFormat')
                }
                slotProps={{ htmlInput: { maxLength: 4, inputMode: 'number' } }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                required
                label={
                  useUtcTime
                    ? `${t('flightLog.takeoffTime')} (UTC)`
                    : `${t('flightLog.takeoffTime')} (${t('flightLog.local')})`
                }
                placeholder='HHMM'
                value={takeoffTime}
                onChange={({ target }) =>
                  setTakeoffTime(formatTimeInput(target.value))
                }
                error={!!errors.takeoffTimeEpoch}
                helperText={
                  errors.takeoffTimeEpoch?.message?.toString() ||
                  t('flightLog.timeFormat')
                }
                slotProps={{ htmlInput: { maxLength: 4, inputMode: 'number' } }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                required
                label={
                  useUtcTime
                    ? `${t('flightLog.landingTime')} (UTC)`
                    : `${t('flightLog.landingTime')} (${t('flightLog.local')})`
                }
                placeholder='HHMM'
                value={landingTime}
                onChange={({ target }) =>
                  setLandingTime(formatTimeInput(target.value))
                }
                error={!!errors.landingTimeEpoch}
                helperText={
                  errors.landingTimeEpoch?.message?.toString() ||
                  t('flightLog.timeFormat')
                }
                slotProps={{ htmlInput: { maxLength: 4 } }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                required
                label={
                  useUtcTime
                    ? `${t('flightLog.onBlockTime')} (UTC)`
                    : `${t('flightLog.onBlockTime')} (${t('flightLog.local')})`
                }
                placeholder='HHMM'
                value={onBlockTime}
                onChange={({ target }) =>
                  setOnBlockTime(formatTimeInput(target.value))
                }
                error={!!errors.onBlockTimeEpoch}
                helperText={
                  errors.onBlockTimeEpoch?.message?.toString() ||
                  t('flightLog.timeFormat')
                }
                slotProps={{ htmlInput: { maxLength: 4 } }}
              />
            </Grid>

            {/* Flight Timeline Visualization */}
            <Grid size={{ xs: 12 }}>
              <FlightTimeline
                offBlockTime={epochToDayjs('offBlockTimeEpoch')}
                takeoffTime={epochToDayjs('takeoffTimeEpoch')}
                landingTime={epochToDayjs('landingTimeEpoch')}
                onBlockTime={epochToDayjs('onBlockTimeEpoch')}
              />
            </Grid>

            {/* Additional flight info */}
            <Grid size={{ xs: 12 }}>
              <Typography variant='h6' gutterBottom>
                {t('flightLog.additionalInfo')}
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                required
                label={t('flightLog.departureAirport')}
                {...register('departureAirport')}
                error={!!errors.departureAirport}
                helperText={errors.departureAirport?.message?.toString()}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                required
                label={t('flightLog.arrivalAirport')}
                {...register('arrivalAirport')}
                error={!!errors.arrivalAirport}
                helperText={errors.arrivalAirport?.message?.toString()}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                required
                type='number'
                label={t('flightLog.personsOnBoard')}
                {...register('personsOnBoard', { valueAsNumber: true })}
                error={!!errors.personsOnBoard}
                helperText={errors.personsOnBoard?.message?.toString()}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                required
                type='number'
                label={t('flightLog.numberOfLandings')}
                {...register('numberOfLandings', { valueAsNumber: true })}
                error={!!errors.numberOfLandings}
                helperText={errors.numberOfLandings?.message?.toString()}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label={t('flightLog.nightHours')}
                {...register('nightFlyingMins', { valueAsNumber: true })}
                error={!!errors.nightFlyingMins}
                helperText={errors.nightFlyingMins?.message?.toString()}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label={t('flightLog.instrumentHours')}
                {...register('instrumentFlyingMins', { valueAsNumber: true })}
                error={!!errors.instrumentFlyingMins}
                helperText={errors.instrumentFlyingMins?.message?.toString()}
              />
            </Grid>

            {/* Fuel and Oil */}

            <Grid size={{ xs: 12 }}>
              <Typography variant='h6' gutterBottom>
                {t('flightLog.fuelInfo')}
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                required
                type='number'
                label={t('flightLog.fuelRemaining')}
                {...register('fuelRemainingLitres', { valueAsNumber: true })}
                error={!!errors.fuelRemainingLitres}
                helperText={errors.fuelRemainingLitres?.message?.toString()}
                slotProps={{ htmlInput: { step: '0.1' } }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                type='number'
                label={t('flightLog.fuelUplift')}
                {...register('fuelUpliftLitres', { valueAsNumber: true })}
                error={!!errors.fuelUpliftLitres}
                helperText={errors.fuelUpliftLitres?.message?.toString()}
                slotProps={{ htmlInput: { step: '0.1' } }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                type='number'
                label={t('flightLog.oilUplift')}
                {...register('oilUpliftLitres', { valueAsNumber: true })}
                error={!!errors.oilUpliftLitres}
                helperText={errors.oilUpliftLitres?.message?.toString()}
                slotProps={{ htmlInput: { step: '0.1' } }}
              />
            </Grid>

            {/* Billing Information */}
            <Grid size={{ xs: 12 }}>
              <Typography variant='h6' gutterBottom>
                {t('flightLog.billingInfo')}
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                required
                label={t('flightLog.billableMemberId')}
                {...register('billableMemberId')}
                error={!!errors.billableMemberId}
                helperText={errors.billableMemberId?.message?.toString()}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label={t('flightLog.billingRemarks')}
                multiline
                rows={2}
                {...register('billingRemarks')}
                error={!!errors.billingRemarks}
                helperText={errors.billingRemarks?.message?.toString()}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label={t('flightLog.personalRemarks')}
                multiline
                rows={3}
                {...register('personalRemarks')}
                error={!!errors.personalRemarks}
                helperText={errors.personalRemarks?.message?.toString()}
              />
            </Grid>
          </Grid>

          {errors.root?.type && (
            <Alert severity='error' sx={{ mt: 2 }}>
              {errors.root.type}
            </Alert>
          )}

          {/* Action buttons */}
          <Stack direction='row' spacing={2} justifyContent='flex-end' mt={3}>
            <Button
              variant='outlined'
              onClick={handleCancel}
              startIcon={<Icon icon='mdi:close' />}
              disabled={mutation.isMutating}
            >
              {t('general.cancel')}
            </Button>
            <Button
              type='submit'
              variant='contained'
              color='primary'
              startIcon={<Icon icon='mdi:content-save' />}
              disabled={mutation.isMutating}
            >
              {mutation.isMutating ? t('general.saving') : t('general.save')}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  )
}

export default NewFlightLogEntry
