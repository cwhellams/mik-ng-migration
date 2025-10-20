import { useEffect, useMemo, useState } from 'react'
import {
  Paper,
  Typography,
  Button,
  Stack,
  Breadcrumbs,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Alert,
  Snackbar,
  Slide,
} from '@mui/material'

import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  FlightLog,
  FlightLogUpsertSchema,
  type FlightLogUpsertRequest,
  flightLogDateValidator,
  FlightLogStatus,
} from '@backend/routes/flight-log/models'
import useApi from '../../hooks/useApi'
import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import FlightTimeline from './components/FlightTimeline'
import FlightCrew from './components/FlightCrew'
import { useMe } from '../../hooks/useMe'
import { FlightTime } from './components/FlightTime'
import { TxtField } from './components/TxtField'
import { MinutesField } from './components/MinutesField'
import { Airfields } from './components/Airfields'
import { PersonsOnBoard } from './components/PersonsOnBoard'
import { NumberOfLandings } from './components/NumberOfLandings'
import { Fuel } from './components/Fuel'
import { StatusDisplay } from './components/StatusDisplay'
import { RemoteContent } from '../../components/RemoteContent'
import { useRoles } from '../../hooks/useRoles'
import { BillableMember } from './components/BillableMember'

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

const FlightLogEntry = () => {
  const { t } = useTranslation()

  const navigate = useNavigate()
  // preserve search filters when navigating back
  const location = useLocation()

  const { flightId } = useParams()

  const { me } = useMe()
  const { isFlightLogAdmin } = useRoles()

  const isNew = flightId == 'new'

  const { data, mutation, isLoading, error } = useApi<FlightLog>({
    url: `v1/flight-logs${isNew ? '' : `/${flightId}`}`,
    skipFetch: isNew,
  })

  const { data: aircraftData } = useApi<AircraftListResponse>({
    url: 'v1/aircrafts',
    params: { activeOnly: true },
  })
  // make sure old aircrafts are shown in the list
  const currentAircrafts =
    aircraftData?.aircrafts.map((a) => a.registration) ?? []
  const aircrafts =
    data && !currentAircrafts.includes(data.aircraftRegistration)
      ? [...currentAircrafts, data.aircraftRegistration]
      : currentAircrafts

  const isEditable = isNew || data?.status == FlightLogStatus.NEW
  const isValidated = data?.status == FlightLogStatus.VALIDATED
  const isInvoiced = !isEditable && !isValidated

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
    setError,
    setValue,
    getValues,
    reset,
    trigger,
  } = useForm<FlightLogUpsertRequest>({
    mode: 'onChange',
    resolver: zodResolver(
      flightLogDateValidator(FlightLogUpsertSchema.strip()),
      {}
    ),

    // defaults for new flights
    defaultValues: {
      aircraftRegistration: '',
      flightType: '',

      picRole: 'PIC',
      crew2MemberId: null,
      crew2Role: null,
      crew3MemberId: null,
      crew3Role: null,
      crew4MemberId: null,
      crew4Role: null,

      totalTimeInService: 0,
      privOrComFlight: 'P',
      incidentOrObservations: null,

      personsOnBoard: 1,
      numberOfLandings: 1,
      numberOfNightLandings: 0,
      nightFlyingMins: 0,
      instrumentFlyingMins: 0,

      fuelRemainingLitres: undefined,
      fuelUpliftLitres: null,
      oilUpliftLitres: null,

      personalRemarks: null,
      billingRemarks: null,

      // admin defaults, will be overwritten by the server
      ajlbBlankRowsBefore: 0,
      ajlbSeqNo: 1,
      billableMemberId: me?.memberId ?? '',
      isBillableFlight: true,
      nonBillingReason: null,
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

  const registration = watch('aircraftRegistration')
  const aircraft = useMemo(
    () => aircraftData?.aircrafts.find((a) => a.registration === registration),
    [registration, aircraftData]
  )

  const epochToDayjs = (
    field:
      | 'offBlockTimeEpoch'
      | 'takeoffTimeEpoch'
      | 'landingTimeEpoch'
      | 'onBlockTimeEpoch'
  ) => (getValues(field) ? dayjs.unix(Number(watch(field))) : null)

  const onSubmit = async (data: FlightLogUpsertRequest) => {
    console.log('Form submitted with data:', data) // Debug log

    try {
      const { error } = await mutation.trigger(
        isNew ? 'POST' : 'PATCH',
        data,
        undefined,
        {
          // put returned payload to the cache
          revalidate: false,
          populateCache: (result) => result,
        }
      )

      if (error) {
        console.error('Error saving flight data:', error)
        setSbState(true)
        return setError('root', {
          type: error?.detail ?? error?.title ?? 'Error',
        })
      }

      navigate(`/flight-logs?${location.state}#${flightId}`)
    } catch (err) {
      console.error('Unexpected error:', err)
      setSbState(true)
      setError('root', {
        type: 'Unexpected error occurred',
      })
    }
  }

  const [sbState, setSbState] = useState<boolean>(false)
  const handleClose = () => {
    setSbState(false)
  }

  const handleCancel = () => {
    console.log(location)
    navigate(`/flight-logs?${location.state}#${flightId}`)
  }

  // Check if form has validation errors (excluding root errors)
  const hasValidationErrors =
    Object.keys(errors).filter((key) => key !== 'root').length > 0

  const title = isNew ? t('flightLog.newEntry') : t('flightLog.existingEntry')

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={sbState}
        autoHideDuration={3000}
        onClose={handleClose}
        slots={{ transition: Slide }}
      >
        <Alert severity='error'>{t('general.savingError')}</Alert>
      </Snackbar>

      {/* Breadcrumb navigation */}
      <Breadcrumbs sx={{ my: 2 }}>
        <Link to='/flight-logs'>{t('flightLog.title')}</Link>
        <Typography color='text.primary'>{title}</Typography>
      </Breadcrumbs>
      {/* Page title */}
      <Typography variant='h2' gutterBottom>
        {title}
      </Typography>

      <Paper sx={{ p: 3, mt: 2 }}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Grid container spacing={3}>
            {/* Aircraft Information */}
            <Grid size={{ xs: 12 }}>
              <Typography variant='h6' gutterBottom>
                {t('flightLog.aircraftInfo')}
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl
                required
                fullWidth
                error={!!errors.aircraftRegistration}
              >
                <InputLabel>{t('flightLog.aircraft')}</InputLabel>
                <Controller
                  name='aircraftRegistration'
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      onChange={({ target }) => {
                        const plane = aircraftData?.aircrafts.find(
                          (plane) => plane.registration == target.value
                        )
                        if (!getValues('departureAirport')) {
                          // set last known landing location as the default departure airport

                          if (plane?.status?.lastLandingAirport) {
                            setValue(
                              'departureAirport',
                              plane.status.lastLandingAirport
                            )
                          }
                        }
                        if (!getValues('fuelRemainingLitres')) {
                          // set default fuel to 10% of usable fuel
                          if (plane?.usableFuelLitres) {
                            setValue(
                              'fuelRemainingLitres',
                              plane?.usableFuelLitres * 0.1
                            )
                          }
                        }

                        field.onChange(target.value)
                      }}
                      label={t('flightLog.aircraft')}
                      disabled={!isEditable || !aircraftData?.aircrafts}
                    >
                      {aircrafts?.map((registration) => (
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
              <FormControl required fullWidth error={!!errors.flightType}>
                <InputLabel>{t('flightLog.flightType')}</InputLabel>
                <Controller
                  name='flightType'
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      label={`${t('flightLog.flightType')}`}
                      disabled={!isEditable}
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
                maximumCrewCount={aircraft?.seats ?? 0}
                register={register}
                control={control}
                setValue={isEditable ? setValue : undefined}
                watch={watch}
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
              control={control}
              watch={watch}
              getValues={getValues}
              setValue={isEditable ? setValue : undefined}
              trigger={trigger}
            />

            {/* Flight Timeline Visualization */}
            <Grid size={{ xs: 12 }}>
              <FlightTimeline
                offBlockTime={epochToDayjs('offBlockTimeEpoch')}
                takeoffTime={epochToDayjs('takeoffTimeEpoch')}
                landingTime={epochToDayjs('landingTimeEpoch')}
                onBlockTime={epochToDayjs('onBlockTimeEpoch')}
                acTotalFlightTimeBefore={
                  isNew ? aircraft?.status?.totalTime : undefined
                }
                acTotalFlightTimeAfter={data?.acTotalFlightTime}
              />
            </Grid>

            {/* Additional flight info */}
            <Grid size={{ xs: 12 }}>
              <Typography variant='h6' gutterBottom>
                {t('flightLog.additionalInfo')}
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Airfields
                name='departureAirport'
                control={control}
                disabled={!isEditable}
                error={errors.departureAirport}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Airfields
                name='arrivalAirport'
                control={control}
                disabled={!isEditable}
                error={errors.arrivalAirport}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <PersonsOnBoard
                control={control}
                seats={aircraft?.seats ?? 0}
                disabled={!isEditable}
                crew={watch([
                  'crew2MemberId',
                  'crew3MemberId',
                  'crew4MemberId',
                ])}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <NumberOfLandings
                name='numberOfLandings'
                control={control}
                disabled={!isEditable}
              />
            </Grid>

            {/* Night and Instrument Flying    */}
            <Grid size={{ xs: 12 }}>
              <Typography variant='h6' gutterBottom>
                {t('flightLog.nightFlying')}
              </Typography>
            </Grid>
            <Stack spacing={3}>
              <MinutesField
                name='nightFlyingMins'
                control={control}
                disabled={!isEditable}
              />

              <NumberOfLandings
                name='numberOfNightLandings'
                control={control}
                disabled={!isEditable}
                min={0}
              />

              <Typography variant='h6' gutterBottom>
                {t('flightLog.instrumentFlying')}
              </Typography>

              <MinutesField
                name='instrumentFlyingMins'
                control={control}
                disabled={!isEditable}
              />
            </Stack>

            {/* Fuel and Oil */}
            <Grid size={{ xs: 12 }}>
              <Typography sx={{ mt: 4 }} variant='h6'>
                {t('flightLog.fuelInfo')}
              </Typography>
            </Grid>

            <Grid offset={1} size={{ xs: 10, md: 10 }}>
              <Fuel
                control={control}
                disabled={!isEditable}
                usableFuelLitres={aircraft?.usableFuelLitres ?? 100}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TxtField
                name='fuelUpliftLitres'
                control={control}
                props={{
                  type: 'number',
                  disabled: !isEditable,
                  slotProps: {
                    htmlInput: { step: 1, required: false, min: 0, max: 300 },
                  },
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TxtField
                name='oilUpliftLitres'
                control={control}
                props={{
                  type: 'number',
                  disabled: !isEditable,
                  slotProps: { htmlInput: { step: '0.1', min: 0, max: 10 } },
                }}
              />
            </Grid>

            {/* Billing Information */}
            <Grid size={{ xs: 12 }}>
              <Typography variant='h6' gutterBottom>
                {t('flightLog.billingInfo')}
              </Typography>
            </Grid>

            {isFlightLogAdmin && (
              <Grid size={{ xs: 12, md: 6 }}>
                <BillableMember control={control} disabled={isInvoiced} />
              </Grid>
            )}

            <Grid size={{ xs: 12 }}>
              <TxtField
                name='billingRemarks'
                control={control}
                props={{
                  disabled: isInvoiced,
                  multiline: true,
                  rows: 2,
                }}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TxtField
                name='personalRemarks'
                control={control}
                props={{
                  multiline: true,
                  rows: 3,
                }}
              />
            </Grid>

            {data && (
              <Grid size={{ xs: 12 }}>
                <StatusDisplay
                  log={data}
                  showButton={isFlightLogAdmin && !isInvoiced}
                  update={async (payload) => {
                    const { error } = await mutation.trigger(
                      'POST',
                      payload,
                      '/validate',
                      {
                        // put returned payload to the cache
                        revalidate: false,
                        populateCache: (result) => result,
                      }
                    )
                    if (error) {
                      console.error('Error changing status:', error)
                      setSbState(true)
                      return setError('root', {
                        type: error?.detail ?? error?.title ?? 'Error',
                      })
                    }
                  }}
                />
              </Grid>
            )}
          </Grid>

          {errors.root && (
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
              disabled={mutation.isMutating || isSubmitting}
            >
              {t('general.cancel')}
            </Button>
            <Button
              type='submit'
              variant='contained'
              color='primary'
              startIcon={<Icon icon='mdi:content-save' />}
              disabled={
                mutation.isMutating || isSubmitting || hasValidationErrors
              }
            >
              {mutation.isMutating || isSubmitting
                ? t('general.saving')
                : t('general.save')}
            </Button>
          </Stack>
        </form>
      </Paper>
    </RemoteContent>
  )
}

export default FlightLogEntry
