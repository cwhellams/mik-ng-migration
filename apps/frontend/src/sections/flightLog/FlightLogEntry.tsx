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
  Checkbox,
  FormControlLabel,
  Tooltip,
  Alert,
  Box,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
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
  FlightType,
} from '@backend/routes/flight-log/models'
import useApi from '../../hooks/useApi'
import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import { MemberListResponse } from '@backend/routes/members/models'
import FlightTimeline from './components/FlightTimeline'
import FlightCrew from './components/FlightCrew'
import { useMe } from '../../hooks/useMe'
import { FlightTime } from './components/FlightTime'
import { TxtField } from './components/TxtField'
import { MinutesField } from './components/MinutesField'
import { Airfields } from '../../components/Airfields'
import { PersonsOnBoard } from './components/PersonsOnBoard'
import { NumberOfLandings } from './components/NumberOfLandings'
import { Fuel } from './components/Fuel'
import { StatusDisplay } from './components/StatusDisplay'
import { RemoteContent } from '../../components/RemoteContent'
import { useRoles } from '../../hooks/useRoles'
import { SelectMember } from '../../components/SelectMember'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import { SaveButton } from '../../components/SaveButton'
import { Title } from '../../components/Title'
import {
  getMemberSyllabus,
  getFlightAttempt,
  createFlightAttempt,
  updateFlightAttempt,
  type MemberSyllabusDetail,
} from '../dto/dtoApi'
import { MIKPermissions } from '@backend/routes/members/models'

const flightTypes: FlightType[] = [
  FlightType.PRIVATE,
  FlightType.SCHOOL,
  FlightType.CHECKFLIGHT,
  FlightType.FERRY,
  FlightType.TEST_FLIGHT,
]

const FlightLogEntry = () => {
  const { t } = useTranslation()

  const navigate = useNavigate()
  // preserve search filters when navigating back
  const location = useLocation()
  const source = `${location.state}`.startsWith('/books')
    ? t('flightLog.logbooks.ajlb')
    : t('flightLog.title')

  const { flightId } = useParams()

  const { me } = useMe()
  const { isFlightLogAdmin, hasAccess } = useRoles()

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
  const currentAircrafts = aircraftData?.aircrafts.map((a) => a.registration) ?? []
  const aircrafts =
    data && !currentAircrafts.includes(data.aircraftRegistration)
      ? [...currentAircrafts, data.aircraftRegistration]
      : currentAircrafts

  const isEditable = isNew || data?.status == FlightLogStatus.NEW
  const isValidated = data?.status == FlightLogStatus.VALIDATED
  const isInvoiced = !isEditable && !isValidated
  const adminFieldsEditable = isFlightLogAdmin && !isInvoiced
  // Instructors and admins may update the syllabus flight link on validated
  // (non-invoiced) flights, while regular members can only do so before
  // instructor verification.
  const syllabusEditable =
    isEditable || ((hasAccess(MIKPermissions.DTO_INSTRUCTOR) || isFlightLogAdmin) && !isInvoiced)

  // Fetch member list here so it can be used in the form resolver.
  // SWR deduplicates this request with the identical call in FlightCrew.
  const { data: memberList } = useApi<MemberListResponse>(
    {
      url: 'v1/members',
      params: { isMembershipApproved: true },
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  )

  // Custom resolver: wraps zodResolver and adds FI/FE member-role validation.
  // Field-level validate rules are ignored by RHF when a resolver is present,
  // so role checks must be enforced here to block invalid submissions.
  // Note: if memberList is still loading, role checks are skipped — but the
  // member dropdown itself also shows no qualified members until loaded, so
  // an unqualified selection cannot be made before the list arrives.
  const formResolver = useMemo(() => {
    const baseResolver = zodResolver(flightLogDateValidator(FlightLogUpsertSchema.strip()), {})
    return async (...args: Parameters<typeof baseResolver>) => {
      const [values] = args
      const result = await baseResolver(...args)

      const crewSlots = [
        {
          memberId: values.picMemberId,
          role: values.picRole,
          field: 'picMemberId',
        },
        {
          memberId: values.crew2MemberId,
          role: values.crew2Role,
          field: 'crew2MemberId',
        },
        {
          memberId: values.crew3MemberId,
          role: values.crew3Role,
          field: 'crew3MemberId',
        },
        {
          memberId: values.crew4MemberId,
          role: values.crew4Role,
          field: 'crew4MemberId',
        },
      ]

      const additionalErrors: Record<string, { type: string; message: string }> = {}
      for (const { memberId, role, field } of crewSlots) {
        if (!memberId || (role !== 'FI' && role !== 'FE')) continue
        const roleErrorMessage =
          role === 'FI'
            ? t('flightLog.error.memberNotInstructor')
            : t('flightLog.error.memberNotExaminer')

        if (!memberList?.members) {
          additionalErrors[field] = {
            type: 'custom',
            message: roleErrorMessage,
          }
          continue
        }

        const member = memberList.members.find((m) => m.memberId === memberId)
        if (!member) {
          additionalErrors[field] = {
            type: 'custom',
            message: roleErrorMessage,
          }
          continue
        }

        if (role === 'FI' && !member.roles.includes('INSTRUCTOR')) {
          additionalErrors[field] = {
            type: 'custom',
            message: roleErrorMessage,
          }
        } else if (role === 'FE' && !member.roles.includes('EXAMINER')) {
          additionalErrors[field] = {
            type: 'custom',
            message: roleErrorMessage,
          }
        }
      }

      if (Object.keys(additionalErrors).length === 0) {
        return result
      }

      return {
        values: result.values,
        errors: { ...result.errors, ...additionalErrors },
      }
    }
  }, [memberList, t])

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
    clearErrors,
    setError,
    setValue,
    getValues,
    reset,
    trigger,
  } = useForm<FlightLogUpsertRequest>({
    mode: 'onChange',
    resolver: formResolver,

    // defaults for new flights
    defaultValues: {
      aircraftRegistration: '',
      flightType: FlightType.PRIVATE,

      picRole: 'PIC',
      crew2MemberId: null,
      crew2Role: null,
      crew3MemberId: null,
      crew3Role: null,
      crew4MemberId: null,
      crew4Role: null,

      totalTimeInService: 0,
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
      partiallyBillableFlight: false,
      entryErrorFee: false,
      entryErrorFeeAppliedByMemberId: null,
      nonBillingApprovedByMemberId: null,
      validationRemarks: null,

      // Billing admin fields - null by default, filled during billing process
      minBillableExceptionReason: null,
      minBillableExceptionApprovedByMemberId: null,

      // admin defaults, will be overwritten by the server
      ajlbSeqNo: 1, // ignored by backend on INSERT; required by schema validation
      ajlbBlankRowsBefore: 0,
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
      setProblem(undefined)
    }
  }, [data, reset])

  const registration = watch('aircraftRegistration')
  const aircraft = useMemo(
    () => aircraftData?.aircrafts.find((a) => a.registration === registration),
    [registration, aircraftData],
  )

  const partiallyBillableFlight = watch('partiallyBillableFlight')
  const flightType = watch('flightType')
  const isBillableFlight = watch('isBillableFlight')
  const entryErrorFee = watch('entryErrorFee')
  const entryErrorFeeAppliedByMemberId = watch('entryErrorFeeAppliedByMemberId')
  const nonBillingApprovedByMemberId = watch('nonBillingApprovedByMemberId')
  const billingRemarks = watch('billingRemarks')
  const nonBillingReason = watch('nonBillingReason')
  const validationRemarks = watch('validationRemarks')
  const hasMandatoryBillingRemarksByFlightType =
    flightType === FlightType.TEST_FLIGHT || flightType === FlightType.FERRY

  useEffect(() => {
    if (
      (partiallyBillableFlight || hasMandatoryBillingRemarksByFlightType) &&
      !billingRemarks?.trim()
    ) {
      setError('billingRemarks', {
        type: 'manual',
        message: hasMandatoryBillingRemarksByFlightType
          ? t('flightLog.billingRemarksRequiredForTestOrFerry')
          : t('flightLog.billingRemarksRequired'),
      })
    } else if (errors.billingRemarks?.type === 'manual') {
      clearErrors('billingRemarks')
    }
  }, [
    partiallyBillableFlight,
    hasMandatoryBillingRemarksByFlightType,
    billingRemarks,
    setError,
    clearErrors,
    errors.billingRemarks,
    t,
  ])

  useEffect(() => {
    if (entryErrorFee && !validationRemarks?.trim()) {
      setError('validationRemarks', {
        type: 'manual',
        message: t('flightLog.entryErrorFeeRemarksRequired'),
      })
    } else if (errors.validationRemarks?.type === 'manual') {
      clearErrors('validationRemarks')
    }
  }, [entryErrorFee, validationRemarks, setError, clearErrors, errors.validationRemarks, t])

  useEffect(() => {
    if (isBillableFlight === false && !nonBillingReason?.trim()) {
      setError('nonBillingReason', {
        type: 'manual',
        message: t('flightLog.nonBillingReasonRequired'),
      })
    } else if (errors.nonBillingReason?.type === 'manual') {
      clearErrors('nonBillingReason')
    }
  }, [isBillableFlight, nonBillingReason, setError, clearErrors, errors.nonBillingReason, t])

  useEffect(() => {
    if (isBillableFlight === false && entryErrorFee) {
      setValue('entryErrorFee', false)
      setValue('entryErrorFeeAppliedByMemberId', null)
      setValue('validationRemarks', null)
      clearErrors('validationRemarks')
    }
  }, [isBillableFlight, entryErrorFee, setValue, clearErrors])

  useEffect(() => {
    if (partiallyBillableFlight && isBillableFlight === false) {
      setError('partiallyBillableFlight', {
        type: 'manual',
        message: t('flightLog.partiallyBillableConflict'),
      })
    } else if (errors.partiallyBillableFlight?.type === 'manual') {
      clearErrors('partiallyBillableFlight')
    }
  }, [
    partiallyBillableFlight,
    isBillableFlight,
    setError,
    clearErrors,
    errors.partiallyBillableFlight,
    t,
  ])

  const epochToDayjs = (
    field: 'offBlockTimeEpoch' | 'takeoffTimeEpoch' | 'landingTimeEpoch' | 'onBlockTimeEpoch',
  ) => (getValues(field) ? dayjs.unix(Number(watch(field))) : null)

  const [problem, setProblem] = useState<Problem | undefined>()

  // DTO syllabus integration
  const billableMemberIdWatched = watch('billableMemberId')
  const [memberSyllabus, setMemberSyllabus] = useState<MemberSyllabusDetail | null>(null)
  const [selectedSyllabusFlightId, setSelectedSyllabusFlightId] = useState<string>('')
  const [existingAttemptId, setExistingAttemptId] = useState<string | null>(null)
  const [existingAttemptVerified, setExistingAttemptVerified] = useState(false)
  // Track the original linked syllabus flight so we can detect changes by instructors/admins
  const [originalSyllabusFlightId, setOriginalSyllabusFlightId] = useState<string>('')
  const [showDtoWarning, setShowDtoWarning] = useState(false)
  const [pendingSubmitData, setPendingSubmitData] = useState<FlightLogUpsertRequest | null>(null)

  useEffect(() => {
    if (!billableMemberIdWatched) return
    getMemberSyllabus(billableMemberIdWatched)
      .then((s) => setMemberSyllabus(s))
      .catch(() => setMemberSyllabus(null))
  }, [billableMemberIdWatched])

  // Pre-populate syllabus flight selection when editing an existing flight
  useEffect(() => {
    if (isNew || !flightId) return
    getFlightAttempt(flightId)
      .then((attempt) => {
        if (attempt?.syllabusFlightId) {
          setSelectedSyllabusFlightId(attempt.syllabusFlightId)
          setOriginalSyllabusFlightId(attempt.syllabusFlightId)
          setExistingAttemptId(attempt.attemptId)
          setExistingAttemptVerified(attempt.verificationResult != null)
        }
      })
      .catch(() => {
        /* no attempt yet */
      })
  }, [isNew, flightId])

  const backLink = `/logs${location.state ?? ''}#${flightId}`

  const doSave = async (data: FlightLogUpsertRequest) => {
    try {
      const { data: savedFlight, error } = await mutation.trigger(
        isNew ? 'POST' : 'PATCH',
        data,
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

      // Link the selected syllabus flight to this flight log entry.
      // - If no attempt exists yet: create a new one.
      // - If an attempt already exists and the selection changed (instructor/admin update): update it.
      const savedFlightId = isNew ? savedFlight?.flightId : flightId
      if (savedFlightId && selectedSyllabusFlightId && memberSyllabus) {
        if (!existingAttemptId) {
          await createFlightAttempt(savedFlightId, {
            syllabusFlightId: selectedSyllabusFlightId,
            memberSyllabusId: memberSyllabus.memberSyllabusId,
          }).catch(() => {
            /* non-fatal: attempt may already exist */
          })
        } else if (selectedSyllabusFlightId !== originalSyllabusFlightId) {
          await updateFlightAttempt(savedFlightId, selectedSyllabusFlightId).catch(() => {
            /* non-fatal */
          })
        }
      }

      navigate(backLink)
    } catch (err) {
      console.error('Unexpected error:', err)
      setProblem({ status: 500, detail: t('general.savingError') })
    }
  }

  const onSubmit = (data: FlightLogUpsertRequest) => {
    if (!isNew && existingAttemptVerified) {
      setPendingSubmitData(data)
      setShowDtoWarning(true)
    } else {
      doSave(data)
    }
  }

  // Save current form state without navigating away; used before validate
  const saveChanges = async (): Promise<boolean> => {
    const isValid = await trigger()
    if (!isValid) {
      return false
    }
    // Strip read-only server fields (flightId, status, etc.) that are not
    // part of the upsert schema but may be in form state from the server response
    const formData = FlightLogUpsertSchema.strip().parse(getValues())
    const { error } = await mutation.trigger('PATCH', formData, undefined, {
      revalidate: false,
      populateCache: (result) => result,
    })
    if (error) {
      setProblem(error)
      return false
    }
    return true
  }

  // Check if form has validation errors
  const hasValidationErrors = Object.keys(errors).length > 0

  const title = isNew ? t('flightLog.newEntry') : t('flightLog.existingEntry')

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <SnackAlert problem={problem} />

      {/* Breadcrumb navigation */}
      <Breadcrumbs sx={{ my: 2 }}>
        <Link to={backLink}>{source}</Link>
        <Typography color='text.primary'>{title}</Typography>
      </Breadcrumbs>

      <Title label={title} />

      <Paper sx={{ p: 3, mt: 2 }}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Grid container spacing={3}>
            {/* Aircraft Information */}
            <Grid size={12}>
              <Typography variant='h6'>{t('flightLog.aircraftInfo')}</Typography>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl required fullWidth error={!!errors.aircraftRegistration}>
                <InputLabel>{t('flightLog.aircraft')}</InputLabel>
                <Controller
                  name='aircraftRegistration'
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      required
                      onChange={({ target }) => {
                        const plane = aircraftData?.aircrafts.find(
                          (plane) => plane.registration == target.value,
                        )
                        if (!getValues('departureAirport')) {
                          // set last known landing location as the default departure airport

                          if (plane?.status?.lastLandingAirport) {
                            setValue('departureAirport', plane.status.lastLandingAirport)
                            clearErrors('departureAirport')
                          }
                        }
                        if (!getValues('fuelRemainingLitres')) {
                          // set default fuel to 10% of usable fuel
                          if (plane?.usableFuelLitres) {
                            setValue('fuelRemainingLitres', plane?.usableFuelLitres * 0.1)
                            clearErrors('fuelRemainingLitres')
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
                  <FormHelperText>{errors.aircraftRegistration.message?.toString()}</FormHelperText>
                )}
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
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
                        <MenuItem key={type} value={type}>
                          {t(`flightLog.flightTypes.${type}`)}
                        </MenuItem>
                      ))}
                      {!flightTypes.includes(field.value) && (
                        <MenuItem key={field.value} value={field.value}>
                          {t(`flightLog.flightTypes.${field.value}`)}
                        </MenuItem>
                      )}
                    </Select>
                  )}
                />
                {errors.flightType && (
                  <FormHelperText>{errors.flightType.message?.toString()}</FormHelperText>
                )}
              </FormControl>
            </Grid>

            {/* Flight Crew */}
            <Grid size={12}>
              <Typography variant='h6'>{t('flightLog.crew')}</Typography>
            </Grid>
            <Grid size={12}>
              <FlightCrew
                flightType={watch('flightType')}
                maximumCrewCount={aircraft?.seats ?? 0}
                register={register}
                control={control}
                setValue={isEditable ? setValue : undefined}
                trigger={isEditable ? trigger : undefined}
                watch={watch}
              />
            </Grid>

            {/* DTO Syllabus Flight Selection */}
            {memberSyllabus?.syllabusDetail && (
              <>
                <Grid size={12}>
                  <Typography variant='h6'>DTO Training Flight</Typography>
                </Grid>
                <Grid size={12}>
                  <Alert severity='info' sx={{ mb: 1 }}>
                    Member has an active syllabus:{' '}
                    <strong>{memberSyllabus.syllabusDetail.version}</strong>
                  </Alert>
                  <FormControl fullWidth>
                    <InputLabel>Syllabus Flight (optional)</InputLabel>
                    <Select
                      value={selectedSyllabusFlightId}
                      label='Syllabus Flight (optional)'
                      onChange={(e) => setSelectedSyllabusFlightId(e.target.value)}
                      disabled={!syllabusEditable}
                    >
                      <MenuItem value=''>— None —</MenuItem>
                      {(memberSyllabus.syllabusDetail.flights ?? []).map((f) => (
                        <MenuItem key={f.flightId} value={f.flightId}>
                          {f.code} – {f.name}
                          {f.isInterimCheckpoint && (
                            <Chip label='Interim' size='small' sx={{ ml: 1 }} />
                          )}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {selectedSyllabusFlightId &&
                    (() => {
                      const flight = memberSyllabus.syllabusDetail?.flights?.find(
                        (f) => f.flightId === selectedSyllabusFlightId,
                      )
                      return flight ? (
                        <Box
                          sx={{
                            mt: 1,
                            p: 1.5,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                          }}
                        >
                          <Typography variant='subtitle2'>{flight.name}</Typography>
                          {flight.description && (
                            <Typography variant='body2' color='text.secondary'>
                              {flight.description}
                            </Typography>
                          )}
                          {(flight.tags?.length ?? 0) > 0 && (
                            <Box display='flex' gap={0.5} mt={0.5}>
                              {flight.tags.map((tag) => (
                                <Chip key={tag} label={tag} size='small' />
                              ))}
                            </Box>
                          )}
                          {(flight.items?.length ?? 0) > 0 && (
                            <Box mt={1}>
                              <Typography variant='caption' fontWeight={600}>
                                Training items:
                              </Typography>
                              {flight.items!.map((item) => (
                                <Typography key={item.itemId} variant='body2'>
                                  • {item.name}
                                  {item.mandatory && (
                                    <Chip label='mandatory' size='small' sx={{ ml: 0.5 }} />
                                  )}
                                </Typography>
                              ))}
                            </Box>
                          )}
                        </Box>
                      ) : null
                    })()}
                </Grid>
              </>
            )}

            {/* Flight Date and Time Settings */}
            <Grid size={12}>
              <Typography variant='h6'>{t('flightLog.times')}</Typography>
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
            <Grid size={12}>
              <FlightTimeline
                offBlockTime={epochToDayjs('offBlockTimeEpoch')}
                takeoffTime={epochToDayjs('takeoffTimeEpoch')}
                landingTime={epochToDayjs('landingTimeEpoch')}
                onBlockTime={epochToDayjs('onBlockTimeEpoch')}
                acTotalFlightTimeBefore={isNew ? aircraft?.status?.totalTime : undefined}
                acTotalFlightTimeAfter={data?.acTotalFlightTime}
              />
            </Grid>

            {/* Additional flight info */}
            <Grid size={12}>
              <Typography variant='h6'>{t('flightLog.additionalInfo')}</Typography>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Airfields
                name='departureAirport'
                label={t('flightLog.departureAirport')}
                control={control}
                required={true}
                disabled={!isEditable}
                error={errors.departureAirport}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Airfields
                name='arrivalAirport'
                label={t('flightLog.arrivalAirport')}
                control={control}
                required={true}
                disabled={!isEditable}
                error={errors.arrivalAirport}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <PersonsOnBoard
                control={control}
                seats={aircraft?.seats ?? 0}
                disabled={!isEditable}
                crew={watch(['crew2MemberId', 'crew3MemberId', 'crew4MemberId'])}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <NumberOfLandings name='numberOfLandings' control={control} disabled={!isEditable} />
            </Grid>

            {/* Night and Instrument Flying    */}
            <Grid size={12}>
              <Typography variant='h6'>{t('flightLog.nightInstrumentFlying')}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <MinutesField name='nightFlyingMins' control={control} disabled={!isEditable} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <NumberOfLandings
                name='numberOfNightLandings'
                control={control}
                disabled={!isEditable}
                min={0}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <MinutesField name='instrumentFlyingMins' control={control} disabled={!isEditable} />
            </Grid>

            {/* Fuel and Oil */}
            <Grid size={12}>
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

            <Grid size={{ xs: 12, sm: 6 }}>
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

            <Grid size={{ xs: 12, sm: 6 }}>
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

            {/* Notes */}
            <Grid size={12}>
              <Typography variant='h6'>{t('flightLog.notes')}</Typography>
            </Grid>

            <Grid size={12}>
              <TxtField
                name='incidentOrObservations'
                control={control}
                props={{
                  disabled: !isEditable,
                  multiline: true,
                  rows: 3,
                }}
              />
            </Grid>

            <Grid size={12}>
              <TxtField
                name='personalRemarks'
                control={control}
                props={{
                  disabled: isFlightLogAdmin && isInvoiced,
                  multiline: true,
                  rows: 3,
                }}
              />
            </Grid>

            {/* Billing Information */}
            <Grid size={12}>
              <Typography variant='h6'>{t('flightLog.billingInfo')}</Typography>
            </Grid>

            {isFlightLogAdmin && (
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name={'billableMemberId'}
                  control={control}
                  rules={{ required: true }}
                  render={({ field: { onChange, value } }) => (
                    <SelectMember
                      value={value}
                      onChange={(value) => onChange(value?.id)}
                      entries={[
                        // add SELF as top of the list
                        {
                          id: me?.memberId ?? '',
                          label: 'SELF',
                        },
                      ]}
                      exclude={[me?.memberId ?? '']}
                      label={t(`flightLog.billableMemberId`)}
                      placeholder={t('flightLog.selectCrew')}
                      disabled={isInvoiced}
                    />
                  )}
                />
              </Grid>
            )}

            <Grid size={12}>
              <FormControl fullWidth>
                <FormControlLabel
                  label={
                    <Stack direction='row' spacing={0.5} alignItems='center'>
                      <span>{t('flightLog.partiallyBillableFlight')}</span>
                      <Tooltip title={t('flightLog.partiallyBillableFlightTooltip')}>
                        <span>
                          <Icon icon='mdi:information-outline' width={16} />
                        </span>
                      </Tooltip>
                    </Stack>
                  }
                  control={
                    <Controller
                      name='partiallyBillableFlight'
                      control={control}
                      disabled={isInvoiced}
                      render={({ field }) => (
                        <Checkbox
                          checked={field.value ?? false}
                          onChange={({ target }) => {
                            const checked = target.checked
                            field.onChange(checked)

                            if (checked) {
                              setValue('isBillableFlight', true)
                            }
                          }}
                          disabled={isInvoiced || !isBillableFlight}
                        />
                      )}
                    />
                  }
                />
              </FormControl>
            </Grid>

            <Grid size={12}>
              <TxtField
                name='billingRemarks'
                control={control}
                props={{
                  disabled: isInvoiced,
                  multiline: true,
                  rows: 2,
                }}
              />
              {hasMandatoryBillingRemarksByFlightType && (
                <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
                  {t('flightLog.billingRemarksTestOrFerryInstruction')}
                </Typography>
              )}
            </Grid>

            {/* Admin Use */}
            <Grid size={12}>
              <Paper variant='outlined' sx={{ p: 2, borderColor: 'divider' }}>
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <Typography variant='h6'>{t('flightLog.adminUse')}</Typography>
                  </Grid>

                  <Grid size={12}>
                    {!isNew && (
                      <>
                        <FormControl required fullWidth error={!!errors.flightType}>
                          <FormControlLabel
                            label={
                              <Stack direction='row' spacing={0.5} alignItems='center'>
                                <span>{t('invoicing.isFreeFlight')}</span>
                                <Tooltip title={t('flightLog.nonBillableFlightTooltip')}>
                                  <span>
                                    <Icon icon='mdi:information-outline' width={16} />
                                  </span>
                                </Tooltip>
                              </Stack>
                            }
                            control={
                              <Controller
                                name='isBillableFlight'
                                control={control}
                                disabled={!adminFieldsEditable}
                                render={({ field }) => (
                                  <Checkbox
                                    checked={!field.value}
                                    disabled={!adminFieldsEditable}
                                    onChange={({ target }) => {
                                      const isNonBillable = target.checked
                                      field.onChange(!isNonBillable)

                                      if (isNonBillable) {
                                        setValue('partiallyBillableFlight', false)
                                        if (!watch('nonBillingApprovedByMemberId')) {
                                          setValue(
                                            'nonBillingApprovedByMemberId',
                                            me?.memberId ?? null,
                                          )
                                        }
                                      } else {
                                        setValue('nonBillingApprovedByMemberId', null)
                                      }
                                    }}
                                  />
                                )}
                              />
                            }
                          />
                        </FormControl>

                        <Typography variant='body2' color='text.secondary' sx={{ ml: 4, mt: -0.5 }}>
                          {`${t('flightLog.nonBillingApprovedByMemberId')}: ${nonBillingApprovedByMemberId ?? '-'}`}
                        </Typography>

                        <Grid size={12} sx={{ mt: 1 }}>
                          <TxtField
                            name='nonBillingReason'
                            control={control}
                            props={{
                              disabled: !adminFieldsEditable,
                              multiline: true,
                              rows: 2,
                            }}
                          />
                        </Grid>
                      </>
                    )}
                  </Grid>

                  <Grid size={12}>
                    <FormControl fullWidth>
                      <FormControlLabel
                        label={
                          <Stack direction='row' spacing={0.5} alignItems='center'>
                            <span>{t('flightLog.entryErrorFee')}</span>
                            <Tooltip title={t('flightLog.entryErrorFeeTooltip')}>
                              <span>
                                <Icon icon='mdi:information-outline' width={16} />
                              </span>
                            </Tooltip>
                          </Stack>
                        }
                        control={
                          <Controller
                            name='entryErrorFee'
                            control={control}
                            disabled={!adminFieldsEditable || isBillableFlight === false}
                            render={({ field }) => (
                              <Checkbox
                                checked={field.value ?? false}
                                disabled={!adminFieldsEditable || isBillableFlight === false}
                                onChange={({ target }) => {
                                  const checked = target.checked
                                  field.onChange(checked)

                                  if (checked && !watch('entryErrorFeeAppliedByMemberId')) {
                                    setValue('entryErrorFeeAppliedByMemberId', me?.memberId ?? null)
                                  }
                                  if (!checked) {
                                    setValue('entryErrorFeeAppliedByMemberId', null)
                                  }
                                }}
                              />
                            )}
                          />
                        }
                      />
                    </FormControl>

                    <Typography variant='body2' color='text.secondary' sx={{ ml: 4, mt: -0.5 }}>
                      {`${t('flightLog.entryErrorFeeAppliedByMemberId')}: ${entryErrorFeeAppliedByMemberId ?? '-'}`}
                    </Typography>
                  </Grid>

                  <Grid size={12}>
                    <TxtField
                      name='validationRemarks'
                      control={control}
                      props={{
                        disabled: !adminFieldsEditable,
                        multiline: true,
                        rows: 2,
                      }}
                    />
                  </Grid>

                  {data && (
                    <Grid size={12}>
                      <StatusDisplay
                        log={data}
                        showButton={isFlightLogAdmin && !isInvoiced}
                        update={async (payload) => {
                          // When validating (not reverting), save form changes first
                          if (!payload.revert) {
                            const saved = await saveChanges()
                            if (!saved) return
                          }
                          const { error } = await mutation.trigger('POST', payload, 'validate', {
                            // put returned payload to the cache
                            revalidate: false,
                            populateCache: (result) => result,
                          })
                          if (error) {
                            return setProblem(error)
                          }
                        }}
                      />
                    </Grid>
                  )}
                </Grid>
              </Paper>
            </Grid>
          </Grid>

          {/* Action buttons */}
          <Stack direction='row' spacing={2} justifyContent='flex-end' mt={3}>
            <Button
              variant='outlined'
              onClick={() => navigate(backLink)}
              startIcon={<Icon icon='mdi:close' />}
            >
              {t('general.cancel')}
            </Button>
            <SaveButton
              loading={mutation.isMutating || isSubmitting}
              disabled={hasValidationErrors || (isFlightLogAdmin && isInvoiced)}
            />
          </Stack>
        </form>
      </Paper>

      <Dialog open={showDtoWarning} onClose={() => setShowDtoWarning(false)}>
        <DialogTitle>{t('dto.flightLog.approvedDtoWarningTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('dto.flightLog.approvedDtoWarningBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDtoWarning(false)}>{t('general.cancel')}</Button>
          <Button
            variant='contained'
            color='warning'
            onClick={() => {
              setShowDtoWarning(false)
              if (pendingSubmitData) doSave(pendingSubmitData)
            }}
          >
            {t('dto.flightLog.approvedDtoWarningConfirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </RemoteContent>
  )
}

export default FlightLogEntry
