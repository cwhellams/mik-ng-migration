import { useEffect, useState } from 'react'
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
  Checkbox,
  TextField,
  FormControlLabel,
} from '@mui/material'

import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Occurrence,
  OccurrenceCategory,
  OccurrenceUpsertSchema,
  OccurrenceStatus,
  OccurrenceUpsert,
} from '@backend/routes/occurrences/models'
import useApi from '../../hooks/useApi'
import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import { useMe } from '../../hooks/useMe'
import { RemoteContent } from '../../components/RemoteContent'
import { useRoles } from '../../hooks/useRoles'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import { SaveButton } from '../../components/SaveButton'
import { Title } from '../../components/Title'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker/DateTimePicker'
import { Airfields } from '../../components/Airfields'
import { FormField } from '../../components/FormField'
import {
  formatDuration,
  getDurationInMinutes,
} from '../flightLog/utils/timeUtils'
import { OccurrenceStatusChip } from './components/OccurrenceStatusChip'
import { ConfirmButton } from '../../components/ConfirmDialog'
import { formatDateTime } from '../../utils/date'

export const OccurrenceEntry = () => {
  const { t } = useTranslation()

  const navigate = useNavigate()
  // preserve search filters when navigating back
  const location = useLocation()

  const { reportId } = useParams()

  const { me } = useMe()
  const { isSMSAdmin } = useRoles()

  const isNew = reportId == 'new'

  const { data, mutation, isLoading, error } = useApi<Occurrence>({
    url: `v1/occurrences${isNew ? '' : `/${reportId}`}`,
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
    data?.aircraftRegistration &&
    !currentAircrafts.includes(data.aircraftRegistration)
      ? [...currentAircrafts, data.aircraftRegistration]
      : currentAircrafts

  const isEditable =
    isNew ||
    data?.status == OccurrenceStatus.NEW ||
    data?.status == OccurrenceStatus.ANONYMIZING ||
    data?.status == OccurrenceStatus.ANONYMIZED

  const {
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
    setValue,
    reset,
  } = useForm<OccurrenceUpsert>({
    mode: 'onChange',
    resolver: zodResolver(OccurrenceUpsertSchema.strip(), {}),

    // defaults for new report
    defaultValues: {
      occurrenceDate: '',
      aircraftRegistration: '',
      animalNumber: '0',
      animalSize: '',
      animalSpecies: '',
      departureAirport: '',
      arrivalAirport: '',
      categories: [],
      location: '',
      headline: '',
      isDtoReport: me?.isTrainingProgramPilot ?? false,
      isWeatherRelevant: null,
    },
  })

  useEffect(() => {
    if (data) {
      reset(data)
      setProblem(undefined)
    }
  }, [data, reset])

  const [problem, setProblem] = useState<Problem | undefined>()

  const onSubmit = async (data: OccurrenceUpsert) => {
    console.log('Form submitted with data:', data)

    try {
      const { data: responseData, error } = await mutation.trigger(
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
        return setProblem(error)
      }

      setProblem({ status: 200, detail: t('general.savingSuccess') })

      if (isNew) {
        navigate(`/logs/occurrences/${responseData?.id}`)
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      setProblem({ status: 500, detail: t('general.savingError') })
    }
  }

  const handleCancel = () =>
    navigate(`/logs/occurrences?${location.state}#${reportId}`)

  const handleStateChange = async (status: OccurrenceStatus) => {
    const { error } = await mutation.trigger('POST', data, status)
    if (error) {
      return setProblem(error)
    }
    setProblem({ status: 200, detail: t('general.savingSuccess') })
  }

  // Check if form has validation errors
  const hasValidationErrors = Object.keys(errors).length > 0

  const title = isNew
    ? t('occurrences.newReport')
    : t('occurrences.existingReport')

  const SummaryForm = () => (
    <Grid container spacing={3} mb={3}>
      <Grid size={12}>
        <Typography variant='h6'>{t('occurrences.summary')}</Typography>
      </Grid>

      {data && (
        <Grid size={{ xs: 12 }}>
          <FormField label={t('occurrences.reportDate')} sx={{ mb: 2 }}>
            {formatDateTime(data.reportDate)}
          </FormField>
          {data.deadLine && (
            <FormField label={t('occurrences.deadLine')} sx={{ mb: 2 }}>
              {formatDateTime(data.deadLine)}
            </FormField>
          )}

          {data.status !== OccurrenceStatus.RECEIVED &&
            data.status !== OccurrenceStatus.CLOSED && (
              <FormField
                label={t('occurrences.reportAgePending')}
                sx={{ mb: 2 }}
              >
                {formatDuration(getDurationInMinutes(data.reportDate))}
              </FormField>
            )}
          {(data.status == OccurrenceStatus.RECEIVED ||
            data.status == OccurrenceStatus.CLOSED) && (
            <FormField
              label={t(
                data.status == OccurrenceStatus.RECEIVED
                  ? 'occurrences.reportAgeReceived'
                  : 'occurrences.reportAgeClosed'
              )}
              sx={{ mb: 2 }}
            >
              {formatDuration(
                getDurationInMinutes(data.reportDate, data.updatedAt)
              )}
            </FormField>
          )}
          <FormField label={t('occurrences.reporter')} sx={{ mb: 2 }}>
            <Link to={`/club/members/${data.createdBy}`}>
              {data?.createdBy}
            </Link>
          </FormField>
          <FormField label={t('occurrences.status')} sx={{ mb: 2 }}>
            <OccurrenceStatusChip status={data.status} />
          </FormField>

          {data?.linkedReportId && (
            <FormField label={t('occurrences.linkedReport')} sx={{ mb: 2 }}>
              <Link to={`/logs/occurrences/${data?.linkedReportId}`}>
                {data.status == OccurrenceStatus.RECEIVED
                  ? t('occurrences.anonymizedReport')
                  : t('occurrences.originalReport')}
              </Link>
            </FormField>
          )}
        </Grid>
      )}

      <Grid size={{ xs: 12, sm: 6 }}>
        <Controller
          name='occurrenceDate'
          control={control}
          render={({ field: { onChange, value } }) => (
            <DateTimePicker
              label={t('occurrences.occurrenceDate')}
              value={value ? dayjs(value) : null}
              disabled={!isEditable}
              disableFuture={true}
              format='DD.MM.YYYY HH:mm'
              onChange={(date) => onChange(date?.toISOString())}
              slotProps={{
                textField: {
                  fullWidth: true,
                  required: true,
                  margin: 'normal',
                },
              }}
            />
          )}
        />
      </Grid>

      <Grid size={12}>
        <Controller
          name={'headline'}
          control={control}
          render={({ field, fieldState: { error } }) => (
            <TextField
              {...field}
              fullWidth
              required
              disabled={!isEditable}
              label={t('occurrences.headline')}
              error={!!error}
              helperText={error?.message?.toString()}
            />
          )}
        />
      </Grid>

      <Grid size={12}>
        <Controller
          name={'location'}
          control={control}
          render={({ field, fieldState: { error } }) => (
            <TextField
              {...field}
              fullWidth
              required
              disabled={!isEditable}
              label={t('occurrences.location')}
              error={!!error}
              helperText={error?.message?.toString()}
            />
          )}
        />
      </Grid>

      <Grid size={12}>
        <FormControl required error={!!errors.isDtoReport}>
          <FormControlLabel
            label={t('occurrences.isDtoReport')}
            labelPlacement='start'
            control={
              <Controller
                name='isDtoReport'
                control={control}
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onChange={({ target }) => field.onChange(target.checked)}
                    disabled={!isEditable}
                  />
                )}
              />
            }
          />
        </FormControl>
      </Grid>
    </Grid>
  )

  const EventTypeForm = () => {
    const animals = watch('animalNumber')

    return (
      <Grid container spacing={3} mb={3}>
        <Grid size={12}>
          <Typography variant='h6'>{t('occurrences.eventType')}</Typography>
        </Grid>

        <Grid size={{ xs: 12, sm: 6 }}>
          <FormControl required fullWidth error={!!errors.categories}>
            <InputLabel>{t('occurrences.categories')}</InputLabel>
            <Controller
              name='categories'
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  label={`${t('occurrences.categories')}`}
                  multiple
                  disabled={!isEditable}
                >
                  {Object.keys(OccurrenceCategory)
                    .filter((key) => isNaN(Number(key)))
                    .map((cat) => (
                      <MenuItem key={cat} value={cat}>
                        {t(`occurrences.categoryEnum.${cat}`)}
                      </MenuItem>
                    ))}
                </Select>
              )}
            />
            {errors.categories && (
              <FormHelperText>
                {errors.categories.message?.toString()}
              </FormHelperText>
            )}
          </FormControl>
        </Grid>

        <Grid size={12}>
          <FormControl required error={!!errors.isWeatherRelevant}>
            <FormControlLabel
              label={t('occurrences.isWeatherRelevant')}
              labelPlacement='start'
              control={
                <Controller
                  name='isWeatherRelevant'
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      checked={!!field.value}
                      onChange={({ target }) => field.onChange(target.checked)}
                      disabled={!isEditable}
                    />
                  )}
                />
              }
            />
          </FormControl>
        </Grid>

        <Grid size={12}>
          <FormControl required error={!!errors.animalNumber}>
            <FormControlLabel
              label={t('occurrences.animalsInvolved')}
              labelPlacement='start'
              control={
                <Checkbox
                  checked={animals !== '0'}
                  onChange={({ target }) =>
                    setValue('animalNumber', target.checked ? '1' : '0')
                  }
                  disabled={!isEditable}
                />
              }
            />
          </FormControl>
        </Grid>

        {animals !== '0' && (
          <Grid size={12} container spacing={3}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl required fullWidth error={!!errors.categories}>
                <InputLabel>{t('occurrences.animalNumber')}</InputLabel>
                <Controller
                  name='animalNumber'
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      label={`${t('occurrences.animalNumber')}`}
                      disabled={!isEditable}
                    >
                      <MenuItem value={'unknown'}>
                        {t('occurrences.options.unknown')}
                      </MenuItem>
                      <MenuItem value={'0'}>0</MenuItem>
                      <MenuItem value={'1'}>1</MenuItem>
                      <MenuItem value={'2-10'}>2-10</MenuItem>
                      <MenuItem value={'10-100'}>10-100</MenuItem>
                      <MenuItem value={'100+'}>100+</MenuItem>
                    </Select>
                  )}
                />
                {errors.categories && (
                  <FormHelperText>
                    {errors.categories.message?.toString()}
                  </FormHelperText>
                )}
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl required fullWidth error={!!errors.categories}>
                <InputLabel>{t('occurrences.animalSize')}</InputLabel>
                <Controller
                  name='animalSize'
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      label={`${t('occurrences.animalSize')}`}
                      disabled={!isEditable}
                    >
                      <MenuItem value={'unknown'}>
                        {t('occurrences.options.unknown')}
                      </MenuItem>
                      <MenuItem value={'S'}>
                        {t('occurrences.options.small')}
                      </MenuItem>
                      <MenuItem value={'M'}>
                        {t('occurrences.options.medium')}
                      </MenuItem>
                      <MenuItem value={'L'}>
                        {t('occurrences.options.large')}
                      </MenuItem>
                    </Select>
                  )}
                />
                {errors.categories && (
                  <FormHelperText>
                    {errors.categories.message?.toString()}
                  </FormHelperText>
                )}
              </FormControl>
            </Grid>

            <Grid size={12}>
              <Controller
                name={'animalSpecies'}
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    fullWidth
                    disabled={!isEditable}
                    label={t('occurrences.animalSpecies')}
                    error={!!error}
                    helperText={error?.message?.toString()}
                  />
                )}
              />
            </Grid>
          </Grid>
        )}
      </Grid>
    )
  }

  const DetailsForm = () => (
    <Grid container spacing={3} mb={3}>
      <Grid size={12}>
        <Typography variant='h6'>{t('occurrences.details')}</Typography>
      </Grid>

      <Grid size={{ xs: 12 }}>
        <FormControl required fullWidth error={!!errors.aircraftRegistration}>
          <InputLabel>{t('occurrences.aircraft')}</InputLabel>
          <Controller
            name='aircraftRegistration'
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                label={t('occurrences.aircraft')}
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

      <Grid size={{ xs: 12, sm: 6 }}>
        <Airfields
          name='departureAirport'
          label={t('occurrences.departureAirport')}
          control={control}
          disabled={!isEditable}
          error={errors.departureAirport}
        />
      </Grid>

      <Grid size={{ xs: 12, sm: 6 }}>
        <Airfields
          name='arrivalAirport'
          label={t('occurrences.arrivalAirport')}
          control={control}
          disabled={!isEditable}
          error={errors.arrivalAirport}
        />
      </Grid>

      <Grid size={12}>
        <Controller
          name={'description'}
          control={control}
          render={({ field, fieldState: { error } }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              onChange={({ target }) => {
                field.onChange(target.value)
              }}
              fullWidth
              disabled={!isEditable}
              label={t('occurrences.description')}
              error={!!error}
              helperText={error?.message?.toString()}
              multiline={true}
              minRows={10}
              maxRows={300}
            />
          )}
        />
      </Grid>
    </Grid>
  )

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <SnackAlert problem={problem} />

      {/* Breadcrumb navigation */}
      <Breadcrumbs sx={{ my: 2 }}>
        <Link to='/logs/occurrences'>{t('occurrences.title')}</Link>
        <Typography color='text.primary'>{title}</Typography>
      </Breadcrumbs>

      <Title label={title} />

      <Paper sx={{ p: 3, mt: 2 }}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <SummaryForm />
          <EventTypeForm />
          <DetailsForm />

          <Stack
            direction={{ xs: 'column-reverse', sm: 'row' }}
            spacing={2}
            justifyContent='space-between'
            mt={3}
          >
            {data?.status === OccurrenceStatus.NEW && isSMSAdmin && (
              <Button
                onClick={() => handleStateChange(OccurrenceStatus.RECEIVED)}
                variant='outlined'
                startIcon={<Icon icon='mdi:check' color='green' />}
                sx={{ ml: 5 }}
              >
                {t('occurrences.actions.receive')}
              </Button>
            )}

            {data?.status === OccurrenceStatus.ANONYMIZING && isSMSAdmin && (
              <ConfirmButton
                onConfirm={() => handleStateChange(OccurrenceStatus.ANONYMIZED)}
                title={t('occurrences.actions.anonymize')}
                message={t('occurrences.actions.confirmAnonymize')}
                confirmText={t('general.save')}
                cancelText={t('general.cancel')}
                severity='error'
                buttonProps={{
                  startIcon: <Icon icon='mdi:check' color='green' />,
                }}
              />
            )}

            {data?.status === OccurrenceStatus.ANONYMIZED && isSMSAdmin && (
              <ConfirmButton
                onConfirm={() => handleStateChange(OccurrenceStatus.CLOSED)}
                title={t('occurrences.actions.close')}
                message={t('occurrences.actions.confirmClose')}
                confirmText={t('general.save')}
                cancelText={t('general.cancel')}
                severity='error'
                buttonProps={{
                  startIcon: <Icon icon='mdi:check' color='green' />,
                }}
              />
            )}
            <Stack
              direction={{ xs: 'column-reverse', sm: 'row' }}
              spacing={2}
              justifyContent='flex-end'
              mt={3}
            >
              <Button
                variant='outlined'
                onClick={handleCancel}
                startIcon={<Icon icon='mdi:close' />}
              >
                {t('general.cancel')}
              </Button>
              {isEditable && (
                <SaveButton
                  loading={mutation.isMutating || isSubmitting}
                  disabled={hasValidationErrors}
                />
              )}
            </Stack>
          </Stack>
        </form>
      </Paper>
    </RemoteContent>
  )
}
