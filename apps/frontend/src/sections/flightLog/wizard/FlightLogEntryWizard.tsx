import { useEffect, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText } from '@mui/material'
import { useForm, type DefaultValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  FlightLog,
  FlightType,
  FlightLogUpsertSchema,
  type FlightLogUpsertRequest,
} from '@backend/routes/flight-log/models'
import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import { MemberListResponse } from '@backend/routes/members/models'
import useApi from '../../../hooks/useApi'
import { useMe } from '../../../hooks/useMe'
import { SnackAlert } from '../../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import { buildFlightLogResolver } from '../formResolver'
import { WizardShell } from './components/WizardShell'
import { AircraftFlightTypeStep } from './steps/AircraftFlightTypeStep'
import { CrewStep } from './steps/CrewStep'
import { TimeStep } from './steps/TimeStep'
import { AirportsStep } from './steps/AirportsStep'
import { LandingsStep } from './steps/LandingsStep'
import { NightIfrStep } from './steps/NightIfrStep'
import { FuelUpliftStep } from './steps/FuelUpliftStep'
import { FuelRemainingStep } from './steps/FuelRemainingStep'
import { OilStep } from './steps/OilStep'
import { NotesStep } from './steps/NotesStep'
import { ReviewStep } from './steps/ReviewStep'
import { WIZARD_STEPS, type WizardStep } from './useWizardSteps'
import { useOverlapCheck } from '../useOverlapCheck'
import { OverlapWarningDialog } from '../components/OverlapWarningDialog'

interface Props {
  onSwitchToClassicForm: () => void
  // When set, the wizard edits this existing flight log instead of creating a new
  // one — PATCHes on accept and seeds all form state from `initialData`.
  flightId?: string
  initialData?: FlightLog
  // Step to open on — used to jump straight to the review card, or to a specific
  // section when editing via one of the review card's per-section edit buttons.
  initialStep?: WizardStep
  onClose?: () => void
}

const FIELDS_TO_VALIDATE_PER_STEP: Partial<Record<WizardStep, (keyof FlightLogUpsertRequest)[]>> = {
  crew: [
    'picMemberId',
    'picRole',
    'crew2MemberId',
    'crew2Role',
    'crew3MemberId',
    'crew3Role',
    'crew4MemberId',
    'crew4Role',
    'personsOnBoard',
  ],
  timeDeparture: ['offBlockTimeEpoch', 'takeoffTimeEpoch'],
  timeArrival: ['landingTimeEpoch', 'onBlockTimeEpoch'],
  airports: ['departureAirport', 'arrivalAirport'],
}

export const FlightLogEntryWizard = ({
  onSwitchToClassicForm,
  flightId,
  initialData,
  initialStep,
  onClose,
}: Props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { me } = useMe()
  const isEditing = !!flightId

  const backLink = isEditing
    ? `/logs${location.state ?? ''}#${flightId}`
    : `/logs${location.state ?? ''}`

  const { data: aircraftData } = useApi<AircraftListResponse>({
    url: 'v1/aircrafts',
    params: { activeOnly: true },
  })

  const { data: memberList } = useApi<MemberListResponse>(
    { url: 'v1/members', params: { isMembershipApproved: true } },
    { revalidateIfStale: false, revalidateOnFocus: false, revalidateOnReconnect: false },
  )

  const { mutation } = useApi<FlightLog>({
    url: `v1/flight-logs${isEditing ? `/${flightId}` : ''}`,
    skipFetch: true,
  })

  const resolver = buildFlightLogResolver(t, memberList, true)

  const defaultValues: DefaultValues<FlightLogUpsertRequest> = initialData
    ? FlightLogUpsertSchema.strip().parse(initialData)
    : {
        aircraftRegistration: '',
        flightType: FlightType.PRIVATE,

        picMemberId: me?.memberId ?? '',
        picRole: 'PIC',
        personsOnBoard: 1,
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

        minBillableExceptionReason: null,
        minBillableExceptionApprovedByMemberId: null,

        ajlbSeqNo: 1,
        ajlbBlankRowsBefore: 0,
        billableMemberId: me?.memberId ?? '',
        isBillableFlight: true,
        nonBillingReason: null,
      }

  const {
    control,
    watch,
    setValue,
    getValues,
    trigger,
    register,
    setError,
    clearErrors,
    handleSubmit,
    formState: { errors },
  } = useForm<FlightLogUpsertRequest>({
    mode: 'onChange',
    resolver,
    defaultValues,
  })

  // `me` resolves asynchronously (SWR), so the defaultValues above may still be ''
  // when the form first mounts — mirrors the classic form's equivalent effect.
  // Skipped when editing an existing flight: it already has its own PIC/billable
  // member and must not be silently reassigned to the current user.
  useEffect(() => {
    if (!isEditing && me?.memberId) {
      setValue('picMemberId', me.memberId)
      setValue('billableMemberId', me.memberId)
    }
  }, [me, setValue, isEditing])

  const formProps = {
    control,
    watch,
    setValue,
    getValues,
    trigger,
    register,
    setError,
    clearErrors,
    errors,
  }

  const [stepIndex, setStepIndex] = useState(() =>
    initialStep ? WIZARD_STEPS.indexOf(initialStep) : 0,
  )
  const currentStep = WIZARD_STEPS[stepIndex]

  const [flightDate, setFlightDate] = useState(() =>
    initialData
      ? dayjs.unix(Number(initialData.offBlockTimeEpoch)).utc().startOf('day')
      : dayjs().utc().startOf('day'),
  )
  const [nightOrIfr, setNightOrIfr] = useState<boolean | null>(() =>
    initialData
      ? (initialData.nightFlyingMins ?? 0) > 0 ||
        (initialData.numberOfNightLandings ?? 0) > 0 ||
        (initialData.instrumentFlyingMins ?? 0) > 0
      : null,
  )
  const [refueled, setRefueled] = useState<boolean | null>(() =>
    initialData ? initialData.fuelUpliftLitres != null : null,
  )
  const [oilAdded, setOilAdded] = useState<boolean | null>(() =>
    initialData ? initialData.oilUpliftLitres != null : null,
  )
  const [problem, setProblem] = useState<Problem | undefined>(undefined)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Warns about entries overlapping the submitted times before the save is attempted
  const { withOverlapCheck, overlapDialogProps } = useOverlapCheck(flightId)

  const registration = watch('aircraftRegistration')
  const aircraft = aircraftData?.aircrafts.find((a) => a.registration === registration)

  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 'aircraftType':
        return !!watch('aircraftRegistration') && !!watch('flightType')
      case 'crew':
        return !!watch('picMemberId') && !!watch('personsOnBoard')
      case 'timeDeparture':
        return !!watch('offBlockTimeEpoch') && !!watch('takeoffTimeEpoch')
      case 'timeArrival':
        return !!watch('landingTimeEpoch') && !!watch('onBlockTimeEpoch')
      case 'airports':
        return !!watch('departureAirport') && !!watch('arrivalAirport')
      case 'landings':
        return !!watch('numberOfLandings')
      case 'nightIfr':
        return nightOrIfr !== null
      case 'fuelUplift':
        return refueled !== null && (refueled === false || (watch('fuelUpliftLitres') ?? 0) > 0)
      case 'fuelRemaining':
        return (watch('fuelRemainingLitres') ?? 0) > 0
      case 'oil':
        return oilAdded !== null && (oilAdded === false || (watch('oilUpliftLitres') ?? 0) > 0)
      case 'notes':
      case 'review':
        return true
    }
  }

  const handleNext = async () => {
    if (!canGoNext()) return
    const fields = FIELDS_TO_VALIDATE_PER_STEP[currentStep]
    if (fields) {
      const valid = await trigger(fields)
      if (!valid) return
    }
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1))
  }

  const handleBack = () => setStepIndex((i) => Math.max(i - 1, 0))

  const doSave = async (data: FlightLogUpsertRequest) => {
    setSubmitting(true)
    try {
      const { data: saved, error } = await mutation.trigger(
        isEditing ? 'PATCH' : 'POST',
        data,
        undefined,
        {
          revalidate: false,
          populateCache: (result) => result,
        },
      )
      if (error) {
        setProblem(error)
        return
      }
      if (isEditing) {
        onClose?.()
      } else {
        navigate(`/logs${location.state ?? ''}#${saved?.flightId ?? ''}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleAccept = handleSubmit((data) => withOverlapCheck(data, () => void doSave(data)))

  const timeEpochFor = (field: keyof FlightLogUpsertRequest): string | null => {
    const value = getValues(field)
    return typeof value === 'string' && value ? value : null
  }

  const title = t(`flightLog.wizard.step.${currentStep}`)

  const footer =
    currentStep === 'review' ? (
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button
          color='error'
          variant='outlined'
          onClick={() => setShowDiscardConfirm(true)}
          sx={{ minHeight: 44 }}
        >
          {t('flightLog.wizard.discard')}
        </Button>
        <Button
          variant='contained'
          onClick={handleAccept}
          disabled={submitting}
          sx={{ minHeight: 44 }}
        >
          {t('flightLog.wizard.accept')}
        </Button>
      </Box>
    ) : (
      <Button
        fullWidth
        variant='contained'
        onClick={handleNext}
        disabled={!canGoNext()}
        sx={{ minHeight: 44 }}
      >
        {t('common.next')}
      </Button>
    )

  return (
    <WizardShell
      title={title}
      stepIndex={stepIndex}
      stepCount={WIZARD_STEPS.length}
      onBack={stepIndex > 0 ? handleBack : undefined}
      onClose={() => setShowDiscardConfirm(true)}
      onSwitchToClassicForm={onSwitchToClassicForm}
      footer={footer}
    >
      <SnackAlert problem={problem} />

      {currentStep === 'aircraftType' && (
        <AircraftFlightTypeStep {...formProps} aircraftData={aircraftData} />
      )}
      {currentStep === 'crew' && <CrewStep {...formProps} aircraft={aircraft} me={me} />}
      {currentStep === 'timeDeparture' && (
        <TimeStep
          {...formProps}
          fields={[
            { field: 'offBlockTimeEpoch', label: t('flightLog.offBlockTime') },
            { field: 'takeoffTimeEpoch', label: t('flightLog.takeoffTime') },
          ]}
          referenceEpoch={flightDate.unix().toString()}
          deps={['landingTimeEpoch']}
          flightDate={flightDate}
          onFlightDateChange={setFlightDate}
          showTakeoffDelta
          // off-block's "reference" is just the flight date, not a real previous
          // time — don't auto-seed it from midnight.
          seedFirstFromReference={false}
        />
      )}
      {currentStep === 'timeArrival' && (
        <TimeStep
          {...formProps}
          fields={[
            { field: 'landingTimeEpoch', label: t('flightLog.landingTime') },
            { field: 'onBlockTimeEpoch', label: t('flightLog.onBlockTime') },
          ]}
          referenceEpoch={timeEpochFor('takeoffTimeEpoch')}
          deps={[]}
        />
      )}
      {currentStep === 'airports' && <AirportsStep {...formProps} />}
      {currentStep === 'landings' && <LandingsStep {...formProps} />}
      {currentStep === 'nightIfr' && (
        <NightIfrStep {...formProps} nightOrIfr={nightOrIfr} onNightOrIfrChange={setNightOrIfr} />
      )}
      {currentStep === 'fuelUplift' && (
        <FuelUpliftStep {...formProps} refueled={refueled} onRefueledChange={setRefueled} />
      )}
      {currentStep === 'fuelRemaining' && (
        <FuelRemainingStep {...formProps} usableFuelLitres={aircraft?.usableFuelLitres ?? 100} />
      )}
      {currentStep === 'oil' && (
        <OilStep {...formProps} oilAdded={oilAdded} onOilAddedChange={setOilAdded} />
      )}
      {currentStep === 'notes' && <NotesStep {...formProps} />}
      {currentStep === 'review' && (
        <ReviewStep
          {...formProps}
          memberList={memberList?.members ?? []}
          aircraft={aircraft}
          flightDate={flightDate}
          onEditSection={(step) => setStepIndex(WIZARD_STEPS.indexOf(step))}
        />
      )}

      <Dialog open={showDiscardConfirm} onClose={() => setShowDiscardConfirm(false)}>
        <DialogContent>
          <DialogContentText>{t('flightLog.wizard.discardBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDiscardConfirm(false)}>{t('common.cancel')}</Button>
          <Button color='error' onClick={() => (isEditing ? onClose?.() : navigate(backLink))}>
            {t('flightLog.wizard.discard')}
          </Button>
        </DialogActions>
      </Dialog>

      <OverlapWarningDialog {...overlapDialogProps} />
    </WizardShell>
  )
}
