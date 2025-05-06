import { useState, useEffect, useCallback } from 'react'
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
} from '@mui/material'

import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import 'dayjs/locale/fi'
import 'dayjs/locale/en'
import updateLocale from 'dayjs/plugin/updateLocale'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  FlightLogInsertSchema,
  type FlightLogInsertRequest,
} from '@backend/routes/flight-log/models'
import useApi from '../../hooks/useApi'
import { Aircraft } from '@backend/routes/aircrafts/models'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import FlightTimeline from './components/FlightTimeline'
import {
  formatTimeInput,
  validateTimeInput,
  timeStringToDayjs,
} from './utils/timeUtils'
import { getTimeExample, getTimezoneDisplay } from './utils/timezoneUtils'
import {
  validateTimeSequence,
  type TimeErrors,
} from './utils/flightTimeValidation'
import FlightCrew from './components/FlightCrew'

dayjs.extend(utc)
dayjs.extend(updateLocale)

// Configure both locales to start week on Monday (1)
dayjs.updateLocale('en', {
  weekStart: 1,
})
dayjs.updateLocale('fi', {
  weekStart: 1,
})

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
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([])
  const [useUtcTime, setUseUtcTime] = useState(true)
  const [flightDate, setFlightDate] = useState<dayjs.Dayjs | null>(null)

  // Text input state for time entries
  const [offBlockTime, setOffBlockTime] = useState<string>('')
  const [takeoffTime, setTakeoffTime] = useState<string>('')
  const [landingTime, setLandingTime] = useState<string>('')
  const [onBlockTime, setOnBlockTime] = useState<string>('')

  // Dayjs state for processed time objects
  const [offBlockDayjs, setOffBlockDayjs] = useState<dayjs.Dayjs | null>(null)
  const [takeoffDayjs, setTakeoffDayjs] = useState<dayjs.Dayjs | null>(null)
  const [landingDayjs, setLandingDayjs] = useState<dayjs.Dayjs | null>(null)
  const [onBlockDayjs, setOnBlockDayjs] = useState<dayjs.Dayjs | null>(null)

  // Flight type state
  const [flightType, setFlightType] = useState<string>('')

  // State for time validation
  const [timeErrors, setTimeErrors] = useState<TimeErrors>({
    offBlock: '',
    takeoff: '',
    landing: '',
    onBlock: '',
  })

  const { data: aircraftData } = useApi<Aircraft[]>({
    url: 'v1/aircrafts',
  })

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FlightLogInsertRequest>({
    resolver: zodResolver(FlightLogInsertSchema),
    defaultValues: {
      number_of_landings: 1,
      persons_on_board: 1,
      aircraft_registration: undefined,
      off_block_time_utc: undefined,
      takeoff_time_utc: undefined,
      landing_time_utc: undefined,
      on_block_time_utc: undefined,
    },
  })

  // Set aircraft data when it's available
  useEffect(() => {
    if (aircraftData) {
      setAircrafts(aircraftData)
    }
  }, [aircraftData])

  const updateTimeDayjsObjects = useCallback(() => {
    if (!flightDate) return

    const baseDate = flightDate.clone()

    // Process off block time (no previous time)
    if (offBlockTime && validateTimeInput(offBlockTime)) {
      setOffBlockDayjs(timeStringToDayjs(offBlockTime, baseDate))
    }

    // Process takeoff time (previous: off block)
    if (takeoffTime && validateTimeInput(takeoffTime)) {
      setTakeoffDayjs(timeStringToDayjs(takeoffTime, baseDate, offBlockDayjs))
    }

    // Process landing time (previous: takeoff)
    if (landingTime && validateTimeInput(landingTime)) {
      setLandingDayjs(timeStringToDayjs(landingTime, baseDate, takeoffDayjs))
    }

    // Process on block time (previous: landing)
    if (onBlockTime && validateTimeInput(onBlockTime)) {
      setOnBlockDayjs(timeStringToDayjs(onBlockTime, baseDate, landingDayjs))
    }
  }, [
    flightDate,
    offBlockTime,
    takeoffTime,
    landingTime,
    onBlockTime,
    offBlockDayjs,
    takeoffDayjs,
    landingDayjs,
  ])

  // Reset time dayjs objects when flight date changes
  useEffect(() => {
    if (flightDate) {
      // Recalculate all times when date changes
      updateTimeDayjsObjects()
    } else {
      // Clear all time objects if no date
      setOffBlockDayjs(null)
      setTakeoffDayjs(null)
      setLandingDayjs(null)
      setOnBlockDayjs(null)
    }
  }, [flightDate, updateTimeDayjsObjects])

  // Also update times when UTC/local preference changes
  useEffect(() => {
    updateTimeDayjsObjects()
  }, [updateTimeDayjsObjects])

  // Function to handle time input changes with validation
  const handleTimeChange = (
    timeType: 'offBlock' | 'takeoff' | 'landing' | 'onBlock',
    value: string
  ) => {
    // Format to digits only and limit to 4 characters
    const formatted = formatTimeInput(value)

    // Update the corresponding state
    switch (timeType) {
      case 'offBlock':
        setOffBlockTime(formatted)
        break
      case 'takeoff':
        setTakeoffTime(formatted)
        break
      case 'landing':
        setLandingTime(formatted)
        break
      case 'onBlock':
        setOnBlockTime(formatted)
        break
    }

    // Clear previous error
    setTimeErrors((prev) => ({ ...prev, [timeType]: '' }))

    // Only validate if we have all 4 digits
    if (formatted.length === 4) {
      if (!validateTimeInput(formatted)) {
        setTimeErrors((prev) => ({
          ...prev,
          [timeType]: t('flightLog.invalidTimeFormat', 'Invalid time format'),
        }))
        return
      }

      // Check sequence logic if all values are present
      const timeValues = {
        offBlockTime: timeType === 'offBlock' ? formatted : offBlockTime,
        takeoffTime: timeType === 'takeoff' ? formatted : takeoffTime,
        landingTime: timeType === 'landing' ? formatted : landingTime,
        onBlockTime: timeType === 'onBlock' ? formatted : onBlockTime,
      }

      const updatedErrors = validateTimeSequence(
        timeType,
        formatted,
        timeValues,
        timeErrors,
        t
      )

      if (updatedErrors !== timeErrors) {
        setTimeErrors(updatedErrors)
      }

      // Update dayjs objects immediately using the formatted value
      if (flightDate) {
        // Create a temporary state object with the current values
        const tempTimes = {
          offBlock: timeType === 'offBlock' ? formatted : offBlockTime,
          takeoff: timeType === 'takeoff' ? formatted : takeoffTime,
          landing: timeType === 'landing' ? formatted : landingTime,
          onBlock: timeType === 'onBlock' ? formatted : onBlockTime,
        }

        // Process off block time (no previous time)
        if (tempTimes.offBlock && validateTimeInput(tempTimes.offBlock)) {
          setOffBlockDayjs(timeStringToDayjs(tempTimes.offBlock, flightDate))
        }

        // Get the updated off block dayjs for use in next calculations
        const updatedOffBlockDayjs =
          timeType === 'offBlock' && validateTimeInput(formatted)
            ? timeStringToDayjs(formatted, flightDate)
            : offBlockDayjs

        // Process takeoff time (previous: off block)
        if (tempTimes.takeoff && validateTimeInput(tempTimes.takeoff)) {
          setTakeoffDayjs(
            timeStringToDayjs(
              tempTimes.takeoff,
              flightDate,
              updatedOffBlockDayjs
            )
          )
        }

        // Get the updated takeoff dayjs for use in next calculations
        const updatedTakeoffDayjs =
          timeType === 'takeoff' && validateTimeInput(formatted)
            ? timeStringToDayjs(formatted, flightDate, updatedOffBlockDayjs)
            : takeoffDayjs

        // Process landing time (previous: takeoff)
        if (tempTimes.landing && validateTimeInput(tempTimes.landing)) {
          setLandingDayjs(
            timeStringToDayjs(
              tempTimes.landing,
              flightDate,
              updatedTakeoffDayjs
            )
          )
        }

        // Get the updated landing dayjs for use in next calculations
        const updatedLandingDayjs =
          timeType === 'landing' && validateTimeInput(formatted)
            ? timeStringToDayjs(formatted, flightDate, updatedTakeoffDayjs)
            : landingDayjs

        // Process on block time (previous: landing)
        if (tempTimes.onBlock && validateTimeInput(tempTimes.onBlock)) {
          setOnBlockDayjs(
            timeStringToDayjs(
              tempTimes.onBlock,
              flightDate,
              updatedLandingDayjs
            )
          )
        }
      }
    }
  }

  // Update onSubmit to use our dayjs objects
  const onSubmit = async (data: FlightLogInsertRequest) => {
    setIsSubmitting(true)
    try {
      if (!flightDate) {
        // Handle error - no flight date
        // Could set an error message here
        setIsSubmitting(false)
        return
      }

      // Convert dayjs objects to Date objects for API submission
      const formattedData = {
        ...data,
        off_block_time_utc: offBlockDayjs ? offBlockDayjs.toDate() : null,
        takeoff_time_utc: takeoffDayjs ? takeoffDayjs.toDate() : null,
        landing_time_utc: landingDayjs ? landingDayjs.toDate() : null,
        on_block_time_utc: onBlockDayjs ? onBlockDayjs.toDate() : null,
      }

      console.log('formattedData', formattedData)

      // await api.post('/flight-log', formattedData)
      navigate('/flight-logs')
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsSubmitting(false)
    }
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
          {t('flightLog.title', 'Flight Logs')}
        </Link>
        <Typography color='text.primary'>
          {t('flightLog.newEntry', 'New Entry')}
        </Typography>
      </Breadcrumbs>

      {/* Page title */}
      <Typography variant='h2' gutterBottom>
        {t('flightLog.newEntry', 'New Entry')}
      </Typography>

      <Paper sx={{ p: 3, mt: 2 }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <LocalizationProvider
            dateAdapter={AdapterDayjs}
            adapterLocale={i18n.language}
          >
            <Grid container spacing={3}>
              {/* Aircraft Information */}
              <Grid item xs={12}>
                <Typography variant='h6' gutterBottom>
                  {t('flightLog.aircraftInfo', 'Aircraft Information')}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth error={!!errors.aircraft_registration}>
                  <InputLabel>
                    {t('flightLog.aircraft', 'Aircraft Registration')}
                  </InputLabel>
                  <Controller
                    name='aircraft_registration'
                    control={control}
                    render={({ field }) => (
                      <Select
                        {...field}
                        value={field.value || ''}
                        label={t('flightLog.aircraft', 'Aircraft Registration')}
                        disabled={!aircrafts.length}
                      >
                        {aircrafts.length > 0 &&
                          aircrafts.map((aircraft) => (
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
                  {errors.aircraft_registration && (
                    <FormHelperText>
                      {errors.aircraft_registration.message?.toString()}
                    </FormHelperText>
                  )}
                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth error={!!errors.flight_type}>
                  <InputLabel>
                    {t('flightLog.flightType', 'Flight Type')}
                  </InputLabel>
                  <Controller
                    name='flight_type'
                    control={control}
                    render={({ field }) => (
                      <Select
                        {...field}
                        value={field.value || ''}
                        label={`${t('flightLog.flightType', 'Flight Type')}`}
                        onChange={(e) => {
                          field.onChange(e)
                          setFlightType(e.target.value as string)
                        }}
                      >
                        {flightTypes.map((type) => (
                          <MenuItem key={type.code} value={type.code}>
                            {t(type.labelKey, type.code)}
                          </MenuItem>
                        ))}
                      </Select>
                    )}
                  />
                  {errors.flight_type && (
                    <FormHelperText>
                      {errors.flight_type.message?.toString()}
                    </FormHelperText>
                  )}
                </FormControl>
              </Grid>

              {/* Flight Crew */}
              <Grid item xs={12}>
                <Typography variant='h6' gutterBottom>
                  {t('flightLog.crew', 'Flight Crew')}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <FlightCrew
                  flightType={flightType}
                  register={register}
                  control={control}
                  errors={errors}
                />
              </Grid>

              {/* Flight Date and Time Settings */}
              <Grid item xs={12}>
                <Typography variant='h6' gutterBottom>
                  {t('flightLog.times', 'Flight Times')}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <DatePicker
                  label={t('flightLog.flightDate', 'Flight Date')}
                  value={flightDate}
                  onChange={(newDate) => setFlightDate(newDate)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      required: true,
                    },
                  }}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Box>
                  <Typography variant='body2' gutterBottom>
                    {t('flightLog.timeFormat', 'Time Format')}
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
                      {t('flightLog.utcTime', 'UTC')}
                    </ToggleButton>
                    <ToggleButton value='local' aria-label='Local time'>
                      <Icon
                        icon='mdi:map-marker'
                        style={{ marginRight: '8px' }}
                      />
                      {t('flightLog.localTime', 'Local (Finland)')}
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
                        ? t(
                            'flightLog.usingUtcTime',
                            'Using Coordinated Universal Time (UTC)'
                          )
                        : t(
                            'flightLog.usingLocalTime',
                            'Using Finnish local time'
                          )}{' '}
                      {!useUtcTime &&
                        `(${getTimezoneDisplay(useUtcTime, flightDate)})`}
                      {' - '}
                      {t('flightLog.currentTime', 'Current time')}:{' '}
                      {getTimeExample(useUtcTime, flightDate)}
                    </Typography>
                  </Box>
                </Box>
              </Grid>

              <Grid item xs={12}>
                <Typography
                  variant='subtitle2'
                  gutterBottom
                  color='text.secondary'
                >
                  {t(
                    'flightLog.timeInputFormat',
                    'Enter times in 24-hour format (HHMM)'
                  )}
                </Typography>
              </Grid>

              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label={
                    useUtcTime
                      ? `${t('flightLog.offBlockTime', 'Off Block')} (UTC)`
                      : `${t('flightLog.offBlockTime', 'Off Block')} (${t('flightLog.local', 'Local')})`
                  }
                  placeholder='HHMM'
                  value={offBlockTime}
                  onChange={(e) => handleTimeChange('offBlock', e.target.value)}
                  error={!!timeErrors.offBlock}
                  helperText={
                    timeErrors.offBlock ||
                    t('flightLog.timeFormat', 'Format: HHMM')
                  }
                  inputProps={{ maxLength: 4 }}
                />
              </Grid>

              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label={
                    useUtcTime
                      ? `${t('flightLog.takeoffTime', 'Takeoff')} (UTC)`
                      : `${t('flightLog.takeoffTime', 'Takeoff')} (${t('flightLog.local', 'Local')})`
                  }
                  placeholder='HHMM'
                  value={takeoffTime}
                  onChange={(e) => handleTimeChange('takeoff', e.target.value)}
                  error={!!timeErrors.takeoff}
                  helperText={
                    timeErrors.takeoff ||
                    t('flightLog.timeFormat', 'Format: HHMM')
                  }
                  inputProps={{ maxLength: 4 }}
                />
              </Grid>

              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label={
                    useUtcTime
                      ? `${t('flightLog.landingTime', 'Landing')} (UTC)`
                      : `${t('flightLog.landingTime', 'Landing')} (${t('flightLog.local', 'Local')})`
                  }
                  placeholder='HHMM'
                  value={landingTime}
                  onChange={(e) => handleTimeChange('landing', e.target.value)}
                  error={!!timeErrors.landing}
                  helperText={
                    timeErrors.landing ||
                    t('flightLog.timeFormat', 'Format: HHMM')
                  }
                  inputProps={{ maxLength: 4 }}
                />
              </Grid>

              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label={
                    useUtcTime
                      ? `${t('flightLog.onBlockTime', 'On Block')} (UTC)`
                      : `${t('flightLog.onBlockTime', 'On Block')} (${t('flightLog.local', 'Local')})`
                  }
                  placeholder='HHMM'
                  value={onBlockTime}
                  onChange={(e) => handleTimeChange('onBlock', e.target.value)}
                  error={!!timeErrors.onBlock}
                  helperText={
                    timeErrors.onBlock ||
                    t('flightLog.timeFormat', 'Format: HHMM')
                  }
                  inputProps={{ maxLength: 4 }}
                />
              </Grid>

              {(offBlockDayjs ||
                takeoffDayjs ||
                landingDayjs ||
                onBlockDayjs) && (
                <Grid item xs={12}>
                  <Typography variant='body2' color='text.secondary'>
                    {offBlockDayjs &&
                      ` ${t('flightLog.offBlockTime', 'Off Block')}: ${offBlockDayjs.format('DD.MM.YYYY HH:mm')}`}
                    {takeoffDayjs &&
                      ` ${t('flightLog.takeoffTime', 'Takeoff')}: ${takeoffDayjs.format('DD.MM.YYYY HH:mm')}`}
                    {landingDayjs &&
                      ` ${t('flightLog.landingTime', 'Landing')}: ${landingDayjs.format('DD.MM.YYYY HH:mm')}`}
                    {onBlockDayjs &&
                      ` ${t('flightLog.onBlockTime', 'On Block')}: ${onBlockDayjs.format('DD.MM.YYYY HH:mm')}`}
                  </Typography>
                </Grid>
              )}

              {/* Flight Timeline Visualization */}
              <Grid item xs={12}>
                <FlightTimeline
                  offBlockTime={offBlockDayjs}
                  takeoffTime={takeoffDayjs}
                  landingTime={landingDayjs}
                  onBlockTime={onBlockDayjs}
                />
              </Grid>

              {/* Additional flight info */}
              <Grid item xs={12}>
                <Typography variant='h6' gutterBottom>
                  {t('flightLog.additionalInfo', 'Additional Information')}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('flightLog.departureAirport', 'Departure Airport')}
                  {...register('departure_airport')}
                  error={!!errors.departure_airport}
                  helperText={errors.departure_airport?.message?.toString()}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('flightLog.arrivalAirport', 'Arrival Airport')}
                  {...register('arrival_airport')}
                  error={!!errors.arrival_airport}
                  helperText={errors.arrival_airport?.message?.toString()}
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type='number'
                  label={t('flightLog.personsOnBoard', 'Persons on Board')}
                  {...register('persons_on_board', { valueAsNumber: true })}
                  error={!!errors.persons_on_board}
                  helperText={errors.persons_on_board?.message?.toString()}
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type='number'
                  label={t('flightLog.numberOfLandings', 'Number of Landings')}
                  {...register('number_of_landings', { valueAsNumber: true })}
                  error={!!errors.number_of_landings}
                  helperText={errors.number_of_landings?.message?.toString()}
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label={t('flightLog.nightHours', 'Night Hours (HH:MM)')}
                  placeholder='00:00'
                  {...register('night_hours')}
                  error={!!errors.night_hours}
                  helperText={errors.night_hours?.message?.toString()}
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label={t(
                    'flightLog.instrumentHours',
                    'Instrument Hours (HH:MM)'
                  )}
                  placeholder='00:00'
                  {...register('instrument_hours')}
                  error={!!errors.instrument_hours}
                  helperText={errors.instrument_hours?.message?.toString()}
                />
              </Grid>

              {/* Fuel and Oil */}
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type='number'
                  label={t('flightLog.fuelUplift', 'Fuel Uplift (litres)')}
                  {...register('fuel_uplift_litres', { valueAsNumber: true })}
                  error={!!errors.fuel_uplift_litres}
                  helperText={errors.fuel_uplift_litres?.message?.toString()}
                  inputProps={{ step: '0.01' }}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type='number'
                  label={t('flightLog.oilUplift', 'Oil Uplift (litres)')}
                  {...register('oil_uplift_litres', { valueAsNumber: true })}
                  error={!!errors.oil_uplift_litres}
                  helperText={errors.oil_uplift_litres?.message?.toString()}
                  inputProps={{ step: '0.01' }}
                />
              </Grid>

              {/* Billing Information */}
              <Grid item xs={12}>
                <Typography variant='h6' gutterBottom>
                  {t('flightLog.billingInfo', 'Billing Information')}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type='number'
                  label={t('flightLog.billableMemberId', 'Billable Member ID')}
                  {...register('billable_member_id', { valueAsNumber: true })}
                  error={!!errors.billable_member_id}
                  helperText={errors.billable_member_id?.message?.toString()}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('flightLog.billingRemarks', 'Billing Remarks')}
                  multiline
                  rows={2}
                  {...register('billing_remarks')}
                  error={!!errors.billing_remarks}
                  helperText={errors.billing_remarks?.message?.toString()}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('flightLog.remarks', 'Remarks')}
                  multiline
                  rows={3}
                  {...register('remarks')}
                  error={!!errors.remarks}
                  helperText={errors.remarks?.message?.toString()}
                />
              </Grid>
            </Grid>
          </LocalizationProvider>

          {/* Action buttons */}
          <Stack direction='row' spacing={2} justifyContent='flex-end' mt={3}>
            <Button
              variant='outlined'
              onClick={handleCancel}
              startIcon={<Icon icon='mdi:close' />}
              disabled={isSubmitting}
            >
              {t('general.cancel', 'Cancel')}
            </Button>
            <Button
              type='submit'
              variant='contained'
              color='primary'
              startIcon={<Icon icon='mdi:content-save' />}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t('general.saving', 'Saving...')
                : t('general.save', 'Save')}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  )
}

export default NewFlightLogEntry
