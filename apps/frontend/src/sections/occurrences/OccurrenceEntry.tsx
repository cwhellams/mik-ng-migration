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
  Card,
  CardContent,
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
  OccurrenceAccess,
  OccurrenceProcessedPayload,
  OccurrenceClosedPayload,
} from '@backend/routes/occurrences/models'
import useApi, { MutateMethods } from '../../hooks/useApi'
import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import { RemoteContent } from '../../components/RemoteContent'
import { useRoles } from '../../hooks/useRoles'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import { SaveButton } from '../../components/SaveButton'
import { Title } from '../../components/Title'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { Airfields } from '../../components/Airfields'
import { FormField } from '../../components/FormField'
import { formatDuration, getDurationInMinutes } from '../flightLog/utils/timeUtils'
import { OccurrenceStatusChip } from './components/OccurrenceStatusChip'
import { ConfirmButton } from '../../components/ConfirmDialog'
import { FormTitle } from '../../components/FormTitle'
import { SelectMember } from '../../components/SelectMember'
import { MIKLang } from '@backend/routes/members/models'
import { EditButton } from '../../components/EditButton'
import { Box } from '@mui/system'
import { useTimezone } from '../../hooks/useTimezone'

export const OccurrenceEntry = () => {
  const { t, i18n } = useTranslation()
  const { formatDateTime, timezoneName, timezoneOffset } = useTimezone()

  const navigate = useNavigate()
  // preserve search filters when navigating back
  const location = useLocation()

  const { reportId } = useParams()

  const { isSMSProcessor, isSMSManager, me, roles } = useRoles()

  const isAdmin = isSMSManager || isSMSProcessor

  const isNew = reportId == 'new'

  const { data, mutation, isLoading, error } = useApi<Occurrence>({
    url: `v1/occurrences${isNew ? '' : `/${reportId}`}`,
    skipFetch: isNew,
  })

  const { data: aircraftData } = useApi<AircraftListResponse>(
    {
      url: 'v1/aircrafts',
      params: { activeOnly: true },
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    },
  )
  // make sure old aircrafts are shown in the list
  const currentAircrafts = aircraftData?.aircrafts.map((a) => a.registration) ?? []
  const aircrafts =
    data?.aircraftRegistration && !currentAircrafts.includes(data.aircraftRegistration)
      ? [...currentAircrafts, data.aircraftRegistration]
      : currentAircrafts

  const access = data?.access
    .filter((a) =>
      isAdmin
        ? a.roleId && me?.roles.find((r) => r.roleId == a.roleId)
        : a.memberId === me?.memberId ||
          (a.roleId && me?.roles.find((r) => r.roleId == a.roleId && !a.manage)),
    )
    ?.sort((a, b) => {
      if (a.manage && !b.manage) return -1
      if (!a.manage && b.manage) return 1
      if (a.write && !b.write) return -1
      if (!a.write && b.write) return 1
      return 0
    })?.[0]

  const isEditable =
    isNew ||
    (access?.write &&
      (data?.status == OccurrenceStatus.NEW || data?.status == OccurrenceStatus.ANONYMIZING))

  const {
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
    setValue,
    reset,
  } = useForm<OccurrenceUpsert>({
    mode: 'onChange',
    resolver: zodResolver(OccurrenceUpsertSchema.strip() as any, {}),

    // defaults for new report
    defaultValues: {
      occurrenceDate: '',
      aircraftRegistration: '',
      aircraftTechnicalFault: null,
      animalNumber: '0',
      animalSize: '',
      animalSpecies: '',
      departureAirport: null,
      arrivalAirport: null,
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
        {
          ...data,
          aircraftRegistration: data.aircraftRegistration || null,
          departureAirport: data.departureAirport || null,
          arrivalAirport: data.arrivalAirport || null,
        },
        undefined,
        {
          // put returned payload to the cache
          revalidate: false,
          populateCache: (result) => result,
        },
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

  const handleCancel = () => navigate(`/logs/occurrences?${location.state}#${reportId}`)

  const handleStateChange = async (status: OccurrenceStatus, payload?: unknown) => {
    const { data, error } = await mutation.trigger<unknown, Occurrence>(
      'POST',
      payload ?? {},
      `status/${status}`,
    )
    if (error) {
      return setProblem(error)
    }

    setProblem({ status: 200, detail: t('general.savingSuccess') })
    if (status == OccurrenceStatus.RECEIVED) {
      // navigate to anonymized version
      navigate(`/logs/occurrences/${data?.id}`)
    } else if (status == OccurrenceStatus.ANONYMIZED) {
      // independent processor has no more access to the report
      navigate('/logs/occurrences')
    }
  }

  const handleAccessChange = async (method: MutateMethods, access: OccurrenceAccess) => {
    const { error } = await mutation.trigger<OccurrenceAccess, Occurrence>(
      method,
      access,
      method == 'POST' ? 'access' : `access/${access.accessId}`,
    )
    if (error) {
      return setProblem(error)
    }
    setProblem({ status: 200, detail: t('general.savingSuccess') })
  }

  const handleCommentChange = async (comment: string) => {
    const { error } = await mutation.trigger<unknown, Occurrence>('POST', { comment }, 'comment')
    if (error) {
      return setProblem(error)
    }
    setProblem({ status: 200, detail: t('general.savingSuccess') })
  }

  // Check if form has validation errors
  const hasValidationErrors = Object.keys(errors).length > 0

  const title = isNew ? t('occurrences.newReport') : t('occurrences.existingReport')

  const SummaryForm = () => (
    <Grid
      container
      spacing={3}
      sx={{
        mb: 3,
      }}
    >
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

          {data.status !== OccurrenceStatus.RECEIVED && data.status !== OccurrenceStatus.CLOSED && (
            <FormField label={t('occurrences.reportAgePending')} sx={{ mb: 2 }}>
              {formatDuration(getDurationInMinutes(data.reportDate))}
            </FormField>
          )}
          {(data.status == OccurrenceStatus.RECEIVED || data.status == OccurrenceStatus.CLOSED) && (
            <FormField
              label={t(
                data.status == OccurrenceStatus.RECEIVED
                  ? 'occurrences.reportAgeReceived'
                  : 'occurrences.reportAgeClosed',
              )}
              sx={{ mb: 2 }}
            >
              {formatDuration(getDurationInMinutes(data.reportDate, data.updatedAt))}
            </FormField>
          )}
          {data.createdBy !== '-' && (
            <FormField label={t('occurrences.reporter')} sx={{ mb: 2 }}>
              <Link to={`/club/members/${data.createdBy}`}>{data?.createdBy}</Link>
            </FormField>
          )}
          <FormField label={t('occurrences.status')} sx={{ mb: 2 }}>
            <OccurrenceStatusChip status={data.status} />
          </FormField>

          {data?.linkedReportId && !isSMSManager && (
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
              label={t('occurrences.occurrenceDateTz', {
                tz: timezoneOffset(value),
              })}
              value={value ? dayjs(value) : null}
              disabled={!isEditable}
              disableFuture={true}
              format='DD.MM.YYYY HH:mm'
              timezone={timezoneName}
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
                disabled={!isEditable}
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
      <Grid
        container
        spacing={3}
        sx={{
          mb: 3,
        }}
      >
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
              <FormHelperText>{errors.categories.message?.toString()}</FormHelperText>
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
                  disabled={!isEditable}
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
                  onChange={({ target }) => setValue('animalNumber', target.checked ? '1' : '0')}
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
                      <MenuItem value={'unknown'}>{t('occurrences.options.unknown')}</MenuItem>
                      <MenuItem value={'0'}>0</MenuItem>
                      <MenuItem value={'1'}>1</MenuItem>
                      <MenuItem value={'2-10'}>2-10</MenuItem>
                      <MenuItem value={'10-100'}>10-100</MenuItem>
                      <MenuItem value={'100+'}>100+</MenuItem>
                    </Select>
                  )}
                />
                {errors.categories && (
                  <FormHelperText>{errors.categories.message?.toString()}</FormHelperText>
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
                      <MenuItem value={'unknown'}>{t('occurrences.options.unknown')}</MenuItem>
                      <MenuItem value={'S'}>{t('occurrences.options.small')}</MenuItem>
                      <MenuItem value={'M'}>{t('occurrences.options.medium')}</MenuItem>
                      <MenuItem value={'L'}>{t('occurrences.options.large')}</MenuItem>
                    </Select>
                  )}
                />
                {errors.categories && (
                  <FormHelperText>{errors.categories.message?.toString()}</FormHelperText>
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

  const DetailsForm = () => {
    const aircraft = watch('aircraftRegistration')

    return (
      <Grid
        container
        spacing={3}
        sx={{
          mb: 3,
        }}
      >
        <Grid size={12}>
          <Typography variant='h6'>{t('occurrences.details')}</Typography>
        </Grid>
        <Grid size={{ xs: 12, sm: aircraft ? 6 : 12 }}>
          <FormControl
            fullWidth
            error={!!errors.aircraftRegistration}
            disabled={!isEditable || !aircraftData?.aircrafts}
          >
            <InputLabel>{t('occurrences.aircraft')}</InputLabel>
            <Controller
              name='aircraftRegistration'
              control={control}
              render={({ field }) => (
                <Select {...field} label={t('occurrences.aircraft')}>
                  <MenuItem key='empty' value={''}>
                    --
                  </MenuItem>
                  {aircrafts?.map((registration) => (
                    <MenuItem key={registration} value={registration}>
                      {registration}
                    </MenuItem>
                  ))}
                </Select>
              )}
            />
            <FormHelperText>{t('occurrences.aircraftNote')}</FormHelperText>
          </FormControl>
        </Grid>
        {aircraft && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl required error={!!errors.aircraftTechnicalFault}>
              <FormControlLabel
                label={t('occurrences.aircraftTechnicalFault')}
                labelPlacement='start'
                control={
                  <Controller
                    name='aircraftTechnicalFault'
                    control={control}
                    disabled={!isEditable}
                    render={({ field }) => (
                      <Checkbox
                        checked={field.value ?? false}
                        onChange={({ target }) => field.onChange(target.checked)}
                        disabled={!isEditable}
                      />
                    )}
                  />
                }
              />
              {isSMSManager && data?.aircraftTechnicalFault && (
                <FormHelperText>
                  {t('occurrences.aircraftTechnicalFaultAdminInfoText')}
                </FormHelperText>
              )}
            </FormControl>
          </Grid>
        )}
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
  }

  const SMSFormContent = () => {
    if (isAdmin && access?.manage) {
      switch (data?.status) {
        case OccurrenceStatus.NEW:
          return (
            <Button
              onClick={() => handleStateChange(OccurrenceStatus.RECEIVED)}
              variant='outlined'
              startIcon={<Icon icon='mdi:check' color='green' />}
              sx={{ ml: 5 }}
            >
              {t('occurrences.actions.receive')}
            </Button>
          )
        case OccurrenceStatus.ANONYMIZING:
          return (
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
          )

        case OccurrenceStatus.ANONYMIZED:
          return <BeforeForm />

        default:
          return (
            <>
              <BeforeForm />
              <AfterForm />
            </>
          )
      }
    } else if (!isNew) {
      return (
        <>
          <BeforeForm />
          <AfterForm />
        </>
      )
    }
  }

  const SharingForm = () => {
    const canAddMembers = (access?.manage && access?.author) || isSMSManager
    const canAddRoles = access?.manage && !access?.author
    const canEditPermissions = access?.manage && isSMSManager

    return (
      <Card sx={{ mt: 4 }}>
        <CardContent>
          <FormTitle title={t('occurrences.access.title')} icon='mdi:account' />

          {canAddMembers && (
            <Grid size={{ xs: 12, md: 6 }}>
              <SelectMember
                value={''}
                onChange={async (member) => {
                  if (member) {
                    await handleAccessChange('POST', {
                      memberId: member.type !== 'role' ? member.id : undefined,
                      roleId: member.type == 'role' ? member.id : undefined,
                      author: data?.status == OccurrenceStatus.NEW,
                      write: false,
                      manage: false,
                    })
                  }
                }}
                entries={
                  canAddRoles
                    ? roles.map((role) => ({
                        id: role.roleId,
                        type: 'role',
                        label: role.name[i18n.language as MIKLang],
                        group: 'Role',
                      }))
                    : []
                }
                exclude={
                  // exclude all existing members and self
                  [
                    ...(data?.access.map((a) => a.memberId ?? a.roleId ?? '') ?? []),
                    me?.memberId ?? '',
                  ]
                }
                label={t(`occurrences.access.addMember`)}
                placeholder={t('occurrences.access.memberId')}
              />
            </Grid>
          )}

          <Stack spacing={1.5}>
            {data?.access.map((access, index) => (
              <FormField
                key={index}
                label={access.roleId ?? access.lastName ?? access.memberId ?? '-'}
              >
                {!canEditPermissions || access.author || access.manage ? (
                  t(
                    `occurrences.access.${!access.author && access.manage ? 'manage' : access.write ? 'write' : 'read'}`,
                  )
                ) : (
                  <Select
                    value={access.write ? 'write' : !access.write ? 'read' : 'none'}
                    onChange={async ({ target: { value } }) => {
                      if (value == 'none') {
                        await handleAccessChange('DELETE', access)
                      } else {
                        await handleAccessChange('PUT', {
                          ...access,
                          write: value === 'write',
                        })
                      }
                    }}
                  >
                    <MenuItem value='none'>{t('occurrences.access.none')}</MenuItem>
                    <MenuItem value='read'>{t('occurrences.access.read')}</MenuItem>
                    <MenuItem value={'write'}>{t('occurrences.access.write')}</MenuItem>
                  </Select>
                )}
              </FormField>
            ))}
          </Stack>
        </CardContent>
      </Card>
    )
  }

  const BeforeForm = () => {
    const [handling, setHandling] = useState<OccurrenceProcessedPayload>(
      data?.handling.processed ?? {
        adversity: 0,
        probability: 0,
        forwardedToTraficom: false,
      },
    )

    const isEditable = access?.manage && data?.status == OccurrenceStatus.ANONYMIZED

    return (
      <Grid
        container
        spacing={3}
        sx={{
          mb: 3,
        }}
      >
        <Grid size={12}>
          <Typography variant='h6'>{t('occurrences.handling.before')}</Typography>
        </Grid>
        <Grid size={6}>
          <FormControl fullWidth required>
            <InputLabel>{t('occurrences.handling.adversity')}</InputLabel>
            <Select
              value={handling?.adversity || ''}
              onChange={({ target }) =>
                setHandling((prev) => ({
                  ...prev,
                  adversity: Number(target.value),
                }))
              }
              label={t('occurrences.handling.adversity')}
              disabled={!isEditable}
              fullWidth
            >
              {[0, 1, 2, 3, 4, 5].map((num) => (
                <MenuItem key={num} value={num}>
                  {num > 0 ? num : '--'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={6}>
          <FormControl fullWidth required>
            <InputLabel>{t('occurrences.handling.probability')}</InputLabel>
            <Select
              value={handling?.probability || ''}
              onChange={({ target }) =>
                setHandling((prev) => ({
                  ...prev,
                  probability: Number(target.value),
                }))
              }
              label={t('occurrences.handling.probability')}
              disabled={!isEditable}
              fullWidth
            >
              {[0, 1, 2, 3, 4, 5].map((num) => (
                <MenuItem key={num} value={num}>
                  {num > 0 ? num : '--'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid
          size={12}
          sx={{
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
              width: 200,
            }}
          >
            {t('occurrences.handling.forwardedToTraficom')}
          </Typography>
          <Checkbox
            checked={handling.forwardedToTraficom ?? false}
            disabled={!isEditable}
            onChange={({ target }) => {
              setHandling((prev) => ({
                ...prev,
                forwardedToTraficom: target.checked,
              }))
            }}
          />
        </Grid>
        {isEditable && (
          <Grid
            size={12}
            sx={{
              display: 'flex',
              justifyContent: 'center',
              mt: 2,
            }}
          >
            <ConfirmButton
              onConfirm={() => handleStateChange(OccurrenceStatus.PROCESSED, handling)}
              title={t('occurrences.actions.processed')}
              message={t('occurrences.actions.confirmProcessed')}
              confirmText={t('general.save')}
              cancelText={t('general.cancel')}
              severity='error'
              buttonProps={{
                startIcon: <Icon icon='mdi:check' color='green' />,
                disabled: handling.adversity == 0 || handling.probability == 0,
              }}
            />
          </Grid>
        )}
      </Grid>
    )
  }

  const AfterForm = () => {
    const [handling, setHandling] = useState<OccurrenceClosedPayload>(
      data?.handling.closed ?? {
        adversity: 0,
        probability: 0,
        mitigatingAction: '',
      },
    )

    const isEditable = access?.manage && data?.status == OccurrenceStatus.PROCESSED

    return (
      <Grid
        container
        spacing={3}
        sx={{
          mb: 3,
        }}
      >
        <Grid size={12}>
          <Typography variant='h6'>{t('occurrences.handling.after')}</Typography>
        </Grid>
        <Grid
          size={12}
          sx={{
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <TextField
            value={handling?.mitigatingAction ?? ''}
            onChange={({ target }) =>
              setHandling((prev) => ({
                ...prev,
                mitigatingAction: target.value,
              }))
            }
            label={t('occurrences.handling.mitigatingAction')}
            disabled={!isEditable}
            fullWidth
          />
        </Grid>
        <Grid size={6}>
          <FormControl fullWidth required>
            <InputLabel>{t('occurrences.handling.adversity')}</InputLabel>
            <Select
              value={handling?.adversity ?? ''}
              onChange={({ target }) =>
                setHandling((prev) => ({
                  ...prev,
                  adversity: Number(target.value),
                }))
              }
              label={t('occurrences.handling.adversity')}
              disabled={!isEditable}
              fullWidth
            >
              {[0, 1, 2, 3, 4, 5].map((num) => (
                <MenuItem key={num} value={num}>
                  {num > 0 ? num : '--'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={6}>
          <FormControl fullWidth required>
            <InputLabel>{t('occurrences.handling.probability')}</InputLabel>
            <Select
              value={handling?.probability ?? ''}
              onChange={({ target }) =>
                setHandling((prev) => ({
                  ...prev,
                  probability: Number(target.value),
                }))
              }
              label={t('occurrences.handling.probability')}
              disabled={!isEditable}
              fullWidth
            >
              {[0, 1, 2, 3, 4, 5].map((num) => (
                <MenuItem key={num} value={num}>
                  {num > 0 ? num : '--'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        {isEditable && (
          <Grid
            size={12}
            sx={{
              display: 'flex',
              justifyContent: 'center',
              mt: 2,
            }}
          >
            <ConfirmButton
              onConfirm={() => handleStateChange(OccurrenceStatus.CLOSED, handling)}
              title={t('occurrences.actions.close')}
              message={t('occurrences.actions.confirmClose')}
              confirmText={t('general.save')}
              cancelText={t('general.cancel')}
              severity='error'
              buttonProps={{
                startIcon: <Icon icon='mdi:check' color='green' />,
                disabled:
                  handling.adversity == 0 ||
                  handling.probability == 0 ||
                  !handling.mitigatingAction,
              }}
            />
          </Grid>
        )}
      </Grid>
    )
  }

  const CommentsForm = () => {
    const [newComment, setNewComment] = useState('')
    return (
      <Card sx={{ mt: 4 }}>
        <CardContent>
          <FormTitle title={t('occurrences.handling.comments')} icon='mdi:information' />

          <Stack spacing={1.5}>
            {data?.comments.map((audit, index) => (
              <FormField key={index} label={formatDateTime(audit.at)}>
                {audit.by} -{' '}
                {audit.status ? t(`occurrences.statuses.${audit.status}`) : audit.comment}
              </FormField>
            ))}

            {access?.write && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <TextField
                  label={t('occurrences.handling.addComment')}
                  value={newComment}
                  fullWidth
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyUp={(e) => {
                    if (e.key === 'Enter' && newComment.trim().length > 0) {
                      handleCommentChange(newComment.trim())
                      setNewComment('')
                    }
                  }}
                />
                <EditButton
                  title={t('occurrences.handling.addComment')}
                  icon='mdi:send'
                  viewOnly={newComment.trim().length === 0}
                  onClick={async () => {
                    await handleCommentChange(newComment.trim())
                    setNewComment('')
                  }}
                />
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <RemoteContent isLoading={isLoading} error={error}>
        <SnackAlert problem={problem} />

        {/* Breadcrumb navigation */}
        <Breadcrumbs sx={{ my: 2 }}>
          <Link to='/logs/occurrences'>{t('occurrences.title')}</Link>
          <Typography
            sx={{
              color: 'text.primary',
            }}
          >
            {title}
          </Typography>
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
              sx={{
                justifyContent: 'flex-end',
                mt: 3,
              }}
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
          </form>
        </Paper>

        {!isNew && (
          <>
            <Card sx={{ mt: 4 }}>
              <CardContent>
                <FormTitle title={t('occurrences.handling.title')} icon='mdi:information' />
                <SMSFormContent />
              </CardContent>
            </Card>

            <SharingForm />

            {data?.status !== OccurrenceStatus.NEW && <CommentsForm />}
          </>
        )}
      </RemoteContent>
    </>
  )
}
