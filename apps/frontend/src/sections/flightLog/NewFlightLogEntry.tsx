import { useEffect } from 'react'
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
  Alert,
} from '@mui/material'

import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
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
import FlightTimeline from './components/FlightTimeline'
import FlightCrew from './components/FlightCrew'
import { useMe } from '../../hooks/useMe'
import { FlightTime } from './components/FlightTime'

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

  const { flightId } = useParams()

  const { me } = useMe()

  const isNew = flightId == 'new'

  const { data, mutation } = useApi<FlightLog>(
    {
      url: `v1/flight-logs${isNew ? '' : `/${flightId}`}`,
      skipFetch: isNew,
    },
    {
      // nobody else is modifying the aircraft at the same time
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  const { data: aircraftData } = useApi<AircraftListResponse>(
    {
      url: 'v1/aircrafts',
    },
    {
      // no need to revalidate aircrafts here
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

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
    reset,
  } = useForm<FlightLogMemberRequest>({
    mode: 'onChange',
    resolver: zodResolver(FlightLogMemberUpsertSchema.strip(), {}),

    // defaults for new flights
    defaultValues: {
      aircraftRegistration: '',
      flightType: '',

      picRole: 'PIC',
      totalTimeInService: 0,
      privOrComFlight: 'P',
      incidentOrObservations: null,

      personsOnBoard: 1,
      numberOfLandings: 1,
      nightFlyingMins: 0,
      instrumentFlyingMins: 0,

      fuelRemainingLitres: undefined,
      fuelUpliftLitres: null,
      oilUpliftLitres: null,
    },
  })

  useEffect(() => {
    if (isNew) {
      setValue('billableMemberId', me?.memberId ?? '')
      setValue('picMemberId', me?.memberId ?? '')
    }
  }, [me, setValue, isNew])

  useEffect(() => {
    if (data) {
      reset(data)
    }
  }, [data, reset])

  if (Object.keys(errors).length > 0) {
    console.log(errors)
  }

  const epochToDayjs = (
    field:
      | 'offBlockTimeEpoch'
      | 'takeoffTimeEpoch'
      | 'landingTimeEpoch'
      | 'onBlockTimeEpoch'
  ) => (getValues(field) ? dayjs.unix(Number(getValues(field))) : null)

  // Update onSubmit to use our dayjs objects
  const onSubmit = async (data: FlightLogMemberRequest) => {
    if (Object.keys(errors).length > 0) {
      return
    }

    const { error } = await mutation.trigger(isNew ? 'POST' : 'PATCH', data)
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
                      label={t('flightLog.aircraft')}
                      disabled={!aircraftData?.aircrafts}
                    >
                      {(
                        aircraftData?.aircrafts?.map((r) => r.registration) ??
                        [data?.aircraftRegistration].filter(Boolean)
                      ).map((registration) => (
                        <MenuItem key={registration} value={registration}>
                          {registration}
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
                    <Select {...field} label={`${t('flightLog.flightType')}`}>
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
                getValues={getValues}
                setValue={setValue}
                errors={errors}
              />
            </Grid>

            {/* Flight Date and Time Settings */}
            <Grid size={{ xs: 12 }}>
              <Typography variant='h6' gutterBottom>
                {t('flightLog.times')}
              </Typography>
            </Grid>

            <FlightTime
              data={data}
              register={register}
              setValue={setValue}
              errors={errors}
              setError={setError}
              clearErrors={clearErrors}
            />

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
                defaultValue={''}
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
                {...register('personsOnBoard', {
                  valueAsNumber: true,
                })}
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
              disabled={mutation.isMutating || Object.keys(errors).length > 0}
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
