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
  TextField,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useMediaQuery,
  useTheme,
} from '@mui/material'

import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Icon } from '@iconify/react'
import { useForm, Controller } from 'react-hook-form'
import {
  FlightLog,
  FlightLogUpsertSchema,
  type FlightLogUpsertRequest,
  FlightLogStatus,
  FlightType,
} from '@backend/routes/flight-log/models'
import useApi, { api } from '../../hooks/useApi'
import { SNACKBAR_ANCHOR_BOTTOM_CENTER, useSnackbar } from '../../hooks/useSnackbar'
import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import { FUEL_TYPES } from '@backend/routes/expenses/models'
import { MemberListResponse } from '@backend/routes/members/models'
import FlightTimeline from './components/FlightTimeline'
import FlightCrew from './components/FlightCrew'
import { buildFlightLogResolver } from './formResolver'
import { FlightLogEntryWizard } from './wizard/FlightLogEntryWizard'
import { MobileFlightLogView } from './MobileFlightLogView'
import { flightTypes } from './constants'
import { useMe } from '../../hooks/useMe'
import { FlightTime } from './components/FlightTime'
import { TxtField } from './components/TxtField'
import { MinutesField } from './components/MinutesField'
import { Airfields } from '../../components/Airfields'
import { shouldShowFieldError } from '../../utils/formErrors'
import { PersonsOnBoard } from './components/PersonsOnBoard'
import { NumberOfLandings } from './components/NumberOfLandings'
import { Fuel } from './components/Fuel'
import { FuelUplift } from './components/FuelUplift'
import { OilUplift } from './components/OilUplift'
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
import { useOverlapCheck } from './useOverlapCheck'
import { OverlapWarningDialog } from './components/OverlapWarningDialog'
import { ReportDefectsSection } from './components/ReportDefectsSection'
import { hasBlankReportedDefect, submitReportedDefects } from './reportDefectsApi'

// Renders the guided mobile wizard for new entries on phone-width viewports (unless
// the user opted into the classic form via the wizard's "Use full form instead" link);
// the classic single-page form otherwise. Split into two components (rather than an
// early return inside one) so each keeps its own consistent hook-call order — an early
// return partway through ClassicFlightLogEntry's hooks would violate the rules of hooks.
const FlightLogEntry = () => {
  const { flightId } = useParams()
  const theme = useTheme()
  const isSmUp = useMediaQuery(theme.breakpoints.up('sm'))
  const isNew = flightId == 'new'
  const [forceClassicForm, setForceClassicForm] = useState(false)

  if (!isSmUp && !forceClassicForm) {
    if (isNew) {
      return <FlightLogEntryWizard onSwitchToClassicForm={() => setForceClassicForm(true)} />
    }
    return <MobileFlightLogView onSwitchToClassicForm={() => setForceClassicForm(true)} />
  }

  return <ClassicFlightLogEntry />
}

const ClassicFlightLogEntry = () => {
  const { t } = useTranslation()
  const { showSnackbar } = useSnackbar()
  const theme = useTheme()
  const isSmUp = useMediaQuery(theme.breakpoints.up('sm'))

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

  const formResolver = useMemo(
    () => buildFlightLogResolver(t, memberList, isNew),
    [memberList, t, isNew],
  )

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting, isSubmitted },
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

      numberOfNightLandings: 0,
      nightFlyingMins: 0,
      instrumentFlyingMins: 0,

      fuelRemainingLitres: 0,
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
      setReportedDefects([])
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

  // Defects found on this flight, reported alongside the entry itself instead of via
  // the old separate "Add in-flight defect" button on the logbook view -- see doSave.
  const [reportedDefects, setReportedDefects] = useState<string[]>([])

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
  // Warns about entries overlapping the submitted times before the save is attempted
  const { withOverlapCheck, overlapDialogProps } = useOverlapCheck(isNew ? undefined : flightId)
  // Local-only state for fuel type — not stored in the flight log, used only for expense prefill
  const [fuelUpliftType, setFuelUpliftType] = useState<(typeof FUEL_TYPES)[number] | ''>('')
  const [fuelClaimCreating, setFuelClaimCreating] = useState(false)

  const createFuelDraft = async () => {
    setFuelClaimCreating(true)
    try {
      // Fetch categories to resolve the fuel category ID
      const catRes = await api.get<{ id: number; code: string }[]>('v1/expenses/categories')
      const fuelCat = catRes.data.find((c) => c.code === 'fuel')
      if (!fuelCat) throw new Error('Fuel category not found')

      const payload = {
        categoryId: fuelCat.id,
        title: `Fuel – ${watch('aircraftRegistration')}`,
        aircraftId: watch('aircraftRegistration'),
        flightLogId: data?.flightId ?? undefined,
        expenseDate: data?.takeoffTimeUtc
          ? new Date(data.takeoffTimeUtc).toISOString().substring(0, 10)
          : new Date().toISOString().substring(0, 10),
        iban: me?.iban ?? undefined,
        ibanAccountName: me?.ibanAccountName ?? undefined,
        lineItems: [
          {
            description: `Fuel uplift ${watch('aircraftRegistration')}`,
            date: new Date().toISOString().substring(0, 10),
            quantity: watch('fuelUpliftLitres') ?? 1,
            unit: 'l',
            unitPrice: 0,
            sortOrder: 0,
            costCentreCode: watch('aircraftRegistration') || null,
            fuelType: fuelUpliftType || undefined,
          },
        ],
      }

      const res = await api.post<{ id: string }>('v1/expenses', payload)
      showSnackbar(t('flightLog.fuelClaimCreated'), {
        severity: 'success',
        autoHideDuration: 6000,
        anchorOrigin: SNACKBAR_ANCHOR_BOTTOM_CENTER,
        action: (
          <Button
            color='inherit'
            size='small'
            onClick={() => navigate(`/expenses/${res.data.id}/edit`)}
          >
            {t('flightLog.openExpenseClaim')}
          </Button>
        ),
      })
    } catch {
      showSnackbar(t('flightLog.fuelClaimCreateError'), {
        severity: 'error',
        autoHideDuration: 6000,
        anchorOrigin: SNACKBAR_ANCHOR_BOTTOM_CENTER,
      })
    } finally {
      setFuelClaimCreating(false)
    }
  }

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
    if (hasBlankReportedDefect(reportedDefects)) {
      return setProblem({ status: 400, detail: t('flightLog.defects.blankDescriptionError') })
    }
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

      if (savedFlightId) {
        await submitReportedDefects(savedFlightId, reportedDefects).catch((err) => {
          // non-fatal: the flight log itself is already saved; the pilot can still
          // report a missed defect separately via the standalone pre-flight dialog
          console.error('Failed to submit reported defects:', err)
        })
      }

      navigate(backLink)
    } catch (err) {
      console.error('Unexpected error:', err)
      setProblem({ status: 500, detail: t('general.savingError') })
    }
  }

  const continueSubmit = (data: FlightLogUpsertRequest) => {
    if (!isNew && existingAttemptVerified) {
      setPendingSubmitData(data)
      setShowDtoWarning(true)
    } else {
      doSave(data)
    }
  }

  const onSubmit = (data: FlightLogUpsertRequest) =>
    withOverlapCheck(data, () => continueSubmit(data))

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
          <Grid container spacing={3}>
            {/* Aircraft Information */}
            <Grid size={12}>
              <Typography variant='h6'>{t('flightLog.aircraftInfo')}</Typography>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Controller
                name='aircraftRegistration'
                control={control}
                render={({ field, fieldState: { error, isDirty } }) => {
                  const showError = shouldShowFieldError(error, isDirty, isSubmitted)

                  return (
                    <FormControl required fullWidth error={showError}>
                      <InputLabel>{t('flightLog.aircraft')}</InputLabel>
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
                      {showError && <FormHelperText>{error?.message?.toString()}</FormHelperText>}
                    </FormControl>
                  )
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Controller
                name='flightType'
                control={control}
                render={({ field, fieldState: { error, isDirty } }) => {
                  const showError = shouldShowFieldError(error, isDirty, isSubmitted)

                  return (
                    <FormControl required fullWidth error={showError}>
                      <InputLabel>{t('flightLog.flightType')}</InputLabel>
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
                      {showError && <FormHelperText>{error?.message?.toString()}</FormHelperText>}
                    </FormControl>
                  )
                }}
              />
            </Grid>

            {/* Flight Crew */}
            <Grid size={12}>
              <Typography variant='h6'>{t('flightLog.crew')}</Typography>
            </Grid>
            <Grid size={12}>
              <FlightCrew
                flightType={flightType}
                maximumCrewCount={aircraft?.seats ?? 0}
                register={register}
                control={control}
                setValue={isEditable ? setValue : undefined}
                trigger={isEditable ? trigger : undefined}
                watch={watch}
                defaultInstructorMemberId={
                  flightType === FlightType.SCHOOL ? me?.defaultInstructorMemberId : undefined
                }
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
                            <Typography
                              variant='body2'
                              sx={{
                                color: 'text.secondary',
                              }}
                            >
                              {flight.description}
                            </Typography>
                          )}
                          {(flight.tags?.length ?? 0) > 0 && (
                            <Box
                              sx={{
                                display: 'flex',
                                gap: 0.5,
                                mt: 0.5,
                              }}
                            >
                              {flight.tags.map((tag) => (
                                <Chip key={tag} label={tag} size='small' />
                              ))}
                            </Box>
                          )}
                          {(flight.items?.length ?? 0) > 0 && (
                            <Box
                              sx={{
                                mt: 1,
                              }}
                            >
                              <Typography
                                variant='caption'
                                sx={{
                                  fontWeight: 600,
                                }}
                              >
                                Training items:
                              </Typography>
                              {flight.items!.map((item) => (
                                <Typography key={item.itemId} variant='body2' component='div'>
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
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Airfields
                name='arrivalAirport'
                label={t('flightLog.arrivalAirport')}
                control={control}
                required={true}
                disabled={!isEditable}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <PersonsOnBoard
                control={control}
                seats={aircraft?.seats ?? 0}
                disabled={!isEditable}
                crew={watch(['crew2MemberId', 'crew3MemberId', 'crew4MemberId'])}
                required
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <NumberOfLandings
                name='numberOfLandings'
                control={control}
                disabled={!isEditable}
                required
              />
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
                required
              />
            </Grid>

            <Grid size={12}>
              <FuelUplift control={control} disabled={!isEditable} />
            </Grid>

            {/* Fuel expense shortcut — shown whenever a fuel uplift has been entered */}
            {(watch('fuelUpliftLitres') ?? 0) > 0 && !isNew && flightId && (
              <Grid size={12}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{
                    alignItems: 'center',
                  }}
                >
                  <TextField
                    select
                    size='small'
                    label={t('expenses.fields.fuelType')}
                    value={fuelUpliftType}
                    onChange={(e) => setFuelUpliftType(e.target.value as typeof fuelUpliftType)}
                    sx={{ minWidth: 140 }}
                  >
                    <MenuItem value=''>{t('flightLog.fuelTypeUnknown')}</MenuItem>
                    {FUEL_TYPES.map((ft) => (
                      <MenuItem key={ft} value={ft}>
                        {ft}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button
                    variant='outlined'
                    size='small'
                    disabled={fuelClaimCreating || !fuelUpliftType}
                    startIcon={<Icon icon='mdi:receipt-text-plus-outline' />}
                    onClick={() => void createFuelDraft()}
                  >
                    {t('flightLog.createFuelExpenseClaim')}
                  </Button>
                  <Button
                    variant='outlined'
                    size='small'
                    startIcon={<Icon icon='mdi:content-copy' />}
                    onClick={() => void navigator.clipboard.writeText(String(flightId))}
                  >
                    {t('flightLog.copyFlightId')}
                  </Button>
                </Stack>
              </Grid>
            )}

            <Grid size={12}>
              <OilUplift control={control} disabled={!isEditable} />
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

            {/* Report Defects */}
            {isEditable && (
              <Grid size={12}>
                <ReportDefectsSection
                  descriptions={reportedDefects}
                  onChange={setReportedDefects}
                />
              </Grid>
            )}

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
                      required
                    />
                  )}
                />
              </Grid>
            )}

            <Grid size={12}>
              <FormControl fullWidth>
                <FormControlLabel
                  label={
                    <Stack
                      direction='row'
                      spacing={0.5}
                      sx={{
                        alignItems: 'center',
                      }}
                    >
                      <span>{t('flightLog.partiallyBillableFlight')}</span>
                      <Tooltip title={t('flightLog.partiallyBillableFlightTooltip')}>
                        <IconButton
                          size='small'
                          aria-label={t('flightLog.partiallyBillableFlightTooltip')}
                          sx={{ p: 0.5 }}
                        >
                          <Icon icon='mdi:information-outline' width={16} />
                        </IconButton>
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
                <Typography
                  variant='body2'
                  sx={{
                    color: 'text.secondary',
                    mt: 1,
                  }}
                >
                  {t('flightLog.billingRemarksTestOrFerryInstruction')}
                </Typography>
              )}
            </Grid>

            {/* Admin Use */}
            <Grid size={12}>
              <Accordion
                defaultExpanded={isSmUp}
                disableGutters
                elevation={0}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary expandIcon={<Icon icon='mdi:chevron-down' width={20} />}>
                  <Typography variant='h6'>{t('flightLog.adminUse')}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 2, pt: 0 }}>
                  <Grid container spacing={2}>
                    <Grid size={12}>
                      {!isNew && (
                        <>
                          <FormControl required fullWidth error={!!errors.flightType}>
                            <FormControlLabel
                              label={
                                <Stack
                                  direction='row'
                                  spacing={0.5}
                                  sx={{
                                    alignItems: 'center',
                                  }}
                                >
                                  <span>{t('invoicing.isFreeFlight')}</span>
                                  <Tooltip title={t('flightLog.nonBillableFlightTooltip')}>
                                    <IconButton
                                      size='small'
                                      aria-label={t('flightLog.nonBillableFlightTooltip')}
                                      sx={{ p: 0.5 }}
                                    >
                                      <Icon icon='mdi:information-outline' width={16} />
                                    </IconButton>
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

                          <Typography
                            variant='body2'
                            sx={{
                              color: 'text.secondary',
                              ml: 4,
                              mt: -0.5,
                            }}
                          >
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
                            <Stack
                              direction='row'
                              spacing={0.5}
                              sx={{
                                alignItems: 'center',
                              }}
                            >
                              <span>{t('flightLog.entryErrorFee')}</span>
                              <Tooltip title={t('flightLog.entryErrorFeeTooltip')}>
                                <IconButton
                                  size='small'
                                  aria-label={t('flightLog.entryErrorFeeTooltip')}
                                  sx={{ p: 0.5 }}
                                >
                                  <Icon icon='mdi:information-outline' width={16} />
                                </IconButton>
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
                                      setValue(
                                        'entryErrorFeeAppliedByMemberId',
                                        me?.memberId ?? null,
                                      )
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

                      <Typography
                        variant='body2'
                        sx={{
                          color: 'text.secondary',
                          ml: 4,
                          mt: -0.5,
                        }}
                      >
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
                </AccordionDetails>
              </Accordion>
            </Grid>
          </Grid>

          {/* Action buttons */}
          <Stack
            direction='row'
            spacing={2}
            sx={{
              justifyContent: 'flex-end',
              mt: 3,
            }}
          >
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
      <OverlapWarningDialog {...overlapDialogProps} />
    </RemoteContent>
  )
}

export default FlightLogEntry
