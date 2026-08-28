import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
} from '@mui/material'
import { useForm, type DefaultValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import dayjs from 'dayjs'
import {
  FlightLog,
  FlightType,
  FlightLogStatus,
  FlightLogUpsertSchema,
  type FlightLogUpsertRequest,
} from '@mik/contracts/flight-log'
import { AircraftListResponse } from '@mik/contracts/aircrafts'
import { MemberListResponse } from '@mik/contracts/members'
import {
  LiquidType,
  type LiquidRecordListResponse,
  type LiquidRecordWithLock,
} from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { useDefects } from '../../../hooks/useDefects'
import { useRemarks } from '../../../hooks/useRemarks'
import { useMe } from '@mik/ui/hooks/useMe'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
import { Problem } from '@mik/contracts/problem'
import { buildFlightLogResolver } from '../formResolver'
import { calculateNext } from '@mik/ui/utils/duration'
import {
  readWizardDraft,
  readWizardDraftSavedAt,
  writeWizardDraft,
  clearWizardDraft,
  discardAllOrphanWizardDrafts,
} from '../../../utils/wizardDraft'
import { useWizardDraftGate } from '../../../hooks/useWizardDraftGate'
import { WizardDraftChooserBanner } from '../../../components/WizardDraftChooserBanner'
import { WizardShell } from './components/WizardShell'
import { AircraftFlightTypeStep } from './steps/AircraftFlightTypeStep'
import { CrewStep } from './steps/CrewStep'
import { TimeStep } from './steps/TimeStep'
import { AirportsStep } from './steps/AirportsStep'
import { LandingsStep } from './steps/LandingsStep'
import { NightIfrStep } from './steps/NightIfrStep'
import { FuelAndOilStep } from './steps/FuelAndOilStep'
import { FuelRemainingStep } from './steps/FuelRemainingStep'
import { NotesStep } from './steps/NotesStep'
import { ReviewStep } from './steps/ReviewStep'
import { WIZARD_STEPS, type WizardStep } from './useWizardSteps'
import { useOverlapCheck } from '../useOverlapCheck'
import { LongTaxiWarningDialog } from '../components/LongTaxiWarningDialog'
import { OverlapWarningDialog } from '../components/OverlapWarningDialog'
import { useDefectGroundingConfirm } from '../useDefectGroundingConfirm'
import { useSafetyReportPrompt } from '../useSafetyReportPrompt'
import { SafetyReportPromptDialog } from '../components/SafetyReportPromptDialog'
import { useLongTaxiCheck } from '../useLongTaxiCheck'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { hasBlankReportedDefect, submitReportedDefects } from '../reportDefectsApi'
import { hasBlankReportedRemark, submitReportedRemarks } from '../reportRemarksApi'
import { absolute, endpoints } from '../../../api/endpoints'

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

// Snapshot persisted to localStorage on every change so an iOS Safari-killed tab (or
// an accidental navigation away) can resume the in-progress entry instead of losing it.
interface FlightLogWizardDraft {
  values: FlightLogUpsertRequest
  stepIndex: number
  flightDateIso: string
  nightOrIfr: boolean | null
  pendingFuelRecord?: LiquidRecordWithLock
  pendingOilRecord?: LiquidRecordWithLock
  reportedDefects: string[]
  reportedRemarks: string[]
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

// Wraps the actual wizard so a conditional early-return (needed when several
// orphaned drafts from other, presumably-gone tabs are ambiguous and require the user
// to pick one) never sits partway through FlightLogEntryWizardInner's own hooks —
// mirrors the same split already used for this reason in FlightLogEntry.tsx.
export const FlightLogEntryWizard = (props: Props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { flightId, onSwitchToClassicForm, onClose } = props
  const isEditing = !!flightId
  const backLink = isEditing
    ? `/logs${location.state ?? ''}#${flightId}`
    : `/logs${location.state ?? ''}`

  const draftKey = `flightLog:${flightId ?? 'new'}`
  const gate = useWizardDraftGate<FlightLogWizardDraft>(draftKey)

  if (gate.status === 'ambiguous') {
    return (
      <WizardShell
        title={t('flightLog.wizard.draftAmbiguousTitle')}
        stepIndex={0}
        stepCount={1}
        onClose={() => (isEditing ? onClose?.() : navigate(backLink))}
        onSwitchToClassicForm={onSwitchToClassicForm}
        footer={null}
      >
        <WizardDraftChooserBanner
          title={t('flightLog.wizard.draftAmbiguousTitle')}
          body={t('flightLog.wizard.draftAmbiguousBody', { count: gate.candidates.length })}
          resumeLabel={t('flightLog.wizard.draftResumeMostRecent')}
          startFreshLabel={t('flightLog.wizard.draftStartFresh')}
          onResumeMostRecent={gate.resumeMostRecent}
          onStartFresh={gate.startFresh}
        />
      </WizardShell>
    )
  }

  return <FlightLogEntryWizardInner key={draftKey} {...props} />
}

const FlightLogEntryWizardInner = ({
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

  const draftKey = `flightLog:${flightId ?? 'new'}`
  // Read at most once per mount — later renders must not re-read, since only the
  // initial (lazy) state/defaultValues below ever consume this.
  const persistedDraftRef = useRef<FlightLogWizardDraft | null | undefined>(undefined)
  if (persistedDraftRef.current === undefined) {
    persistedDraftRef.current = readWizardDraft<FlightLogWizardDraft>(draftKey)
  }
  // A draft saved before the entry's last server-side update is stale — e.g. an admin
  // corrected this entry after the draft was left behind on this device/tab. Silently
  // replaying old field values over that correction would revert it with no warning,
  // so such a draft is discarded (falling back to the freshly-fetched server data)
  // rather than merged in.
  const rawPersistedDraft = persistedDraftRef.current
  const persistedDraftSavedAt = readWizardDraftSavedAt(draftKey)
  const isDraftStale =
    !!initialData &&
    persistedDraftSavedAt != null &&
    persistedDraftSavedAt < Date.parse(initialData.updatedAt)
  const persistedDraft = isDraftStale ? null : rawPersistedDraft
  useEffect(() => {
    if (isDraftStale) clearWizardDraft(draftKey)
    // Only needs to run once per mount, using the value computed during render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [showRestoredBanner, setShowRestoredBanner] = useState(!!persistedDraft)

  const { data: aircraftData } = useApi<AircraftListResponse>({
    url: endpoints.aircrafts.root,
    params: { activeOnly: true },
  })

  const { data: memberList } = useApi<MemberListResponse>(
    { url: endpoints.members.root, params: { isMembershipApproved: true } },
    { revalidateIfStale: false, revalidateOnFocus: false, revalidateOnReconnect: false },
  )

  const { mutation } = useApi<FlightLog>({
    url: `v1/flight-logs${isEditing ? `/${flightId}` : ''}`,
    skipFetch: true,
  })
  const { mutation: linkMutation } = useApi<LiquidRecordWithLock>({
    url: endpoints.liquid.records,
    skipFetch: true,
  })

  // Staged locally rather than written to the form: a brand new flight has no
  // flightId yet for a liquid record's `flightLogId` FK to point at, so linking
  // happens as a second API call once doSave has a real flightId (see doSave).
  // Declared before the resolver/useForm below, since the resolver needs to know
  // about a pending record to accept it in place of a litres figure.
  const [pendingFuelRecord, setPendingFuelRecord] = useState<LiquidRecordWithLock | undefined>(
    () => persistedDraft?.pendingFuelRecord,
  )
  const [pendingOilRecord, setPendingOilRecord] = useState<LiquidRecordWithLock | undefined>(
    () => persistedDraft?.pendingOilRecord,
  )

  // Editing an existing flight: FuelAndOilStep manages its own live
  // link/unlink once it has a flightId, but canGoNext() below also needs to
  // know a record is already linked so it doesn't keep blocking Next for a
  // flight that was resolved in an earlier session.
  const { data: linkedLiquidRecordsData } = useApi<LiquidRecordListResponse>({
    url: endpoints.liquid.records,
    params: { flightLogId: flightId },
    skipFetch: !isEditing || !flightId,
  })
  const hasLinkedFuelRecord = (linkedLiquidRecordsData?.records ?? []).some(
    (r) => r.liquidType === LiquidType.FUEL,
  )
  const hasLinkedOilRecord = (linkedLiquidRecordsData?.records ?? []).some(
    (r) => r.liquidType === LiquidType.OIL,
  )

  const resolver = buildFlightLogResolver(t, memberList, !isEditing, {
    fuelRecordId: pendingFuelRecord?.recordId,
    oilRecordId: pendingOilRecord?.recordId,
  })

  const baseDefaultValues: DefaultValues<FlightLogUpsertRequest> = initialData
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

  // A restored draft's values win over the base defaults (initialData or blank-new),
  // filling in on top so any schema fields the older draft predates still get sane
  // fallbacks from baseDefaultValues.
  const defaultValues: DefaultValues<FlightLogUpsertRequest> = persistedDraft
    ? { ...baseDefaultValues, ...persistedDraft.values }
    : baseDefaultValues

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
    initialStep ? WIZARD_STEPS.indexOf(initialStep) : (persistedDraft?.stepIndex ?? 0),
  )
  const currentStep = WIZARD_STEPS[stepIndex]

  const [flightDate, setFlightDate] = useState(() => {
    if (persistedDraft) return dayjs(persistedDraft.flightDateIso).utc()
    return initialData
      ? dayjs.unix(Number(initialData.offBlockTimeEpoch)).utc().startOf('day')
      : dayjs().utc().startOf('day')
  })
  // Re-anchor all already-entered times to the new day whenever the flight date is
  // changed (via the date-chip pencil icon), and re-validate them — otherwise a
  // previously-set time keeps encoding the old date while the UI shows the new one,
  // leaving stale validation errors (or a stale stored timestamp) behind.
  useEffect(() => {
    const setTimeFromEpoch = (
      base: dayjs.Dayjs,
      field: 'offBlockTimeEpoch' | 'takeoffTimeEpoch' | 'landingTimeEpoch' | 'onBlockTimeEpoch',
    ) => {
      const epoch = getValues(field)
      if (!epoch) return null
      const time = dayjs.unix(Number(epoch)).utc()
      const result = calculateNext(base, time)
      setValue(field, result.unix().toString())
      return result
    }

    const offBlockTime = setTimeFromEpoch(flightDate, 'offBlockTimeEpoch')
    const takeoffTime = offBlockTime && setTimeFromEpoch(offBlockTime, 'takeoffTimeEpoch')
    const landingTime = takeoffTime && setTimeFromEpoch(takeoffTime, 'landingTimeEpoch')
    if (landingTime) setTimeFromEpoch(landingTime, 'onBlockTimeEpoch')

    void trigger(['offBlockTimeEpoch', 'takeoffTimeEpoch', 'landingTimeEpoch', 'onBlockTimeEpoch'])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightDate])

  const [nightOrIfr, setNightOrIfr] = useState<boolean | null>(() => {
    if (persistedDraft) return persistedDraft.nightOrIfr
    return initialData
      ? (initialData.nightFlyingMins ?? 0) > 0 ||
          (initialData.numberOfNightLandings ?? 0) > 0 ||
          (initialData.instrumentFlyingMins ?? 0) > 0
      : null
  })
  // Defects found on this flight, reported alongside the entry itself instead of via
  // the old separate "Add in-flight defect" button on the logbook view -- see doSave.
  const [reportedDefects, setReportedDefects] = useState<string[]>(
    () => persistedDraft?.reportedDefects ?? [],
  )
  // Mirrors the backend's own rule that an in-flight defect's flight must still be
  // unvalidated -- hidden rather than shown-then-rejected once already validated.
  const canReportDefects = !isEditing || initialData?.status === FlightLogStatus.NEW
  // Remarks found on this flight (#1226) -- same "reported alongside the entry,
  // submitted once the flightId exists" shape as reportedDefects.
  const [reportedRemarks, setReportedRemarks] = useState<string[]>(
    () => persistedDraft?.reportedRemarks ?? [],
  )
  const canReportRemarks = canReportDefects
  const [problem, setProblem] = useState<Problem | undefined>(undefined)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Warns about entries overlapping the submitted times before the save is attempted
  const { withOverlapCheck, overlapDialogProps } = useOverlapCheck(flightId)
  const { withGroundingConfirm, groundingDialogProps } = useDefectGroundingConfirm()
  const { withSafetyPrompt, safetyPromptProps } = useSafetyReportPrompt()
  const { withLongTaxiCheck, longTaxiDialogProps } = useLongTaxiCheck()

  // Set the instant the draft is intentionally cleared (discard, or a successful
  // save) so the debounced autosave below can never resurrect it. Clearing storage
  // alone isn't enough: the debounce timer armed by the user's last keystroke is only
  // cancelled by this effect's cleanup on unmount, and unmount (route transition,
  // onClose) isn't guaranteed to happen before that timer fires — if it doesn't, the
  // pending write would silently rewrite the just-cleared draft back into storage.
  const draftClearedRef = useRef(false)
  const discardDraft = () => {
    draftClearedRef.current = true
    clearWizardDraft(draftKey)
    // Orphan siblings left by other tabs (or by an earlier auto-adoption that
    // intentionally didn't delete its source — see adoptWizardDraft) must be purged
    // too, or the next mount's gate check silently re-adopts one and this draft comes
    // right back even though it was just discarded/saved.
    discardAllOrphanWizardDrafts(draftKey)
  }

  // Autosave the whole form plus the wizard-only bits (step, flight date, the three
  // yes/no radio states) on every change, so a reload restores this exact draft.
  useEffect(() => {
    // Re-read via getValues() on every watch tick rather than trusting the callback's
    // own (partial, still-in-flux) values — always snapshots the complete, current form.
    const snapshot = () => {
      if (draftClearedRef.current) return
      writeWizardDraft<FlightLogWizardDraft>(draftKey, {
        values: getValues(),
        stepIndex,
        flightDateIso: flightDate.toISOString(),
        nightOrIfr,
        pendingFuelRecord,
        pendingOilRecord,
        reportedDefects,
        reportedRemarks,
      })
    }
    snapshot()

    // watch() fires on every keystroke (including per-digit numeric inputs) — writing
    // synchronously that often would stringify+persist the whole form on the main
    // thread once per keystroke, jank that's especially noticeable on lower-end mobile
    // Safari, exactly where this draft-persistence feature matters most. Debounce it.
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleSnapshot = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(snapshot, 400)
    }
    const subscription = watch(scheduleSnapshot)
    return () => {
      clearTimeout(debounceTimer)
      subscription.unsubscribe()
    }
  }, [
    draftKey,
    stepIndex,
    flightDate,
    nightOrIfr,
    pendingFuelRecord,
    pendingOilRecord,
    reportedDefects,
    reportedRemarks,
    watch,
    getValues,
  ])

  const registration = watch('aircraftRegistration')
  const aircraft = aircraftData?.aircrafts.find((a) => a.registration === registration)

  // Defects already reported against this flight (e.g. via the old separate
  // "Add in-flight defect" button, or a previous save of this same wizard) --
  // fetched by aircraft and filtered by flightId here, since GET /defects has
  // no flightId filter of its own. Only relevant when editing; a new entry
  // has no flightId yet for any defect to be tied to.
  const { data: aircraftDefects, mutate: mutateAircraftDefects } = useDefects(
    isEditing ? registration : undefined,
  )
  const existingDefects = flightId
    ? (aircraftDefects?.filter((d) => d.flightId === flightId) ?? [])
    : []

  // Remarks already logged against this flight (#1226) -- unlike defects, remarks are
  // always tied to a flightId, so this can filter server-side instead of fetching by
  // aircraft and filtering client-side.
  const { data: existingRemarksData } = useRemarks(flightId)
  const existingRemarks = existingRemarksData ?? []

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
        // null means unresolved: no litres figure (0 = "none added" is fine),
        // no record linked/created yet, and (for an existing flight) no record
        // already linked server-side from an earlier session.
        return (
          (watch('fuelUpliftLitres') != null || !!pendingFuelRecord || hasLinkedFuelRecord) &&
          (watch('oilUpliftLitres') != null || !!pendingOilRecord || hasLinkedOilRecord)
        )
      case 'fuelRemaining':
        return (watch('fuelRemainingLitres') ?? 0) > 0
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

    const advance = () => setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1))

    // Checked right on the step that collected the times, rather than only at the
    // very end on Review -- by then the pilot has moved well past the page that
    // caused it (#1223 follow-up).
    if (currentStep === 'timeDeparture') {
      withLongTaxiCheck(
        {
          offBlockTimeEpoch: watch('offBlockTimeEpoch'),
          takeoffTimeEpoch: watch('takeoffTimeEpoch'),
        },
        advance,
      )
      return
    }
    if (currentStep === 'timeArrival') {
      withLongTaxiCheck(
        {
          landingTimeEpoch: watch('landingTimeEpoch'),
          onBlockTimeEpoch: watch('onBlockTimeEpoch'),
        },
        advance,
      )
      return
    }

    advance()
  }

  const handleBack = () => setStepIndex((i) => Math.max(i - 1, 0))

  const doSave = async (data: FlightLogUpsertRequest) => {
    if (hasBlankReportedDefect(reportedDefects)) {
      setProblem({ status: 400, detail: t('flightLog.defects.blankDescriptionError') })
      return
    }
    if (hasBlankReportedRemark(reportedRemarks)) {
      setProblem({ status: 400, detail: t('flightLog.remarks.blankDescriptionError') })
      return
    }
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

      const savedFlightId = isEditing ? flightId : saved?.flightId
      if (savedFlightId) {
        // Independent of each other -- run together rather than one after the other.
        await Promise.all([
          submitReportedDefects(savedFlightId, reportedDefects).catch((err) => {
            // non-fatal: the flight log itself is already saved; the pilot can still
            // report a missed defect separately via the standalone pre-flight dialog
            console.error('Failed to submit reported defects:', err)
          }),
          submitReportedRemarks(savedFlightId, reportedRemarks).catch((err) => {
            // non-fatal: the flight log itself is already saved
            console.error('Failed to submit reported remarks:', err)
          }),
        ])

        // Sequential, not parallel -- both go through the same mutation hook,
        // whose in-flight state a concurrent second trigger() would stomp on.
        // A failure here is non-fatal in the same sense as defects/remarks
        // above: the flight itself is saved, the pending record (kept below on
        // failure) is still valid and unclaimed, and the backend refuses to
        // validate this flight until fuel/oil are actually resolved -- so
        // there's a real backstop even if this member never comes back to it.
        if (pendingFuelRecord) {
          const { error } = await linkMutation.trigger(
            'POST',
            { flightLogId: savedFlightId },
            absolute(endpoints.liquid.linkRecord(pendingFuelRecord.recordId)),
          )
          if (error) console.error('Failed to link fuel record:', error)
          else setPendingFuelRecord(undefined)
        }
        if (pendingOilRecord) {
          const { error } = await linkMutation.trigger(
            'POST',
            { flightLogId: savedFlightId },
            absolute(endpoints.liquid.linkRecord(pendingOilRecord.recordId)),
          )
          if (error) console.error('Failed to link oil record:', error)
          else setPendingOilRecord(undefined)
        }
      }

      discardDraft()
      const goOn = () => {
        if (isEditing) {
          onClose?.()
        } else {
          navigate(`/logs${location.state ?? ''}#${saved?.flightId ?? ''}`)
        }
      }
      // #1225: a remark, defect or observation on this flight may be a safety
      // matter, and only the pilot knows. Asked here rather than before the save,
      // since the answer changes where they go next, not whether the entry is stored.
      if (savedFlightId) {
        withSafetyPrompt(
          {
            sourceFlightId: savedFlightId,
            flight: data,
            content: {
              incidentOrObservations: data.incidentOrObservations,
              previousIncidentOrObservations: initialData?.incidentOrObservations,
              reportedDefects,
              reportedRemarks,
            },
          },
          goOn,
        )
      } else {
        goOn()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleAccept = handleSubmit((data) =>
    withOverlapCheck(data, () => withGroundingConfirm(reportedDefects, () => void doSave(data))),
  )

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

      {showRestoredBanner && (
        <Alert
          severity='info'
          onClose={() => setShowRestoredBanner(false)}
          action={
            <Button
              color='inherit'
              size='small'
              onClick={() => {
                discardDraft()
                if (isEditing) onClose?.()
                else navigate(backLink)
              }}
            >
              {t('flightLog.wizard.discard')}
            </Button>
          }
          sx={{ mb: 2 }}
        >
          {t('flightLog.wizard.draftRestored')}
        </Alert>
      )}

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
        <FuelAndOilStep
          {...formProps}
          aircraftRegistration={registration}
          flightId={isEditing ? flightId : undefined}
          pendingFuelRecord={pendingFuelRecord}
          pendingOilRecord={pendingOilRecord}
          onPendingFuelRecordChange={setPendingFuelRecord}
          onPendingOilRecordChange={setPendingOilRecord}
        />
      )}
      {currentStep === 'fuelRemaining' && (
        <FuelRemainingStep {...formProps} usableFuelLitres={aircraft?.usableFuelLitres ?? 100} />
      )}
      {currentStep === 'notes' && (
        <NotesStep
          {...formProps}
          reportedDefects={reportedDefects}
          onReportedDefectsChange={setReportedDefects}
          canReportDefects={canReportDefects}
          existingDefects={existingDefects}
          aircraftRegistration={registration}
          onExistingDefectsChanged={mutateAircraftDefects}
          reportedRemarks={reportedRemarks}
          onReportedRemarksChange={setReportedRemarks}
          canReportRemarks={canReportRemarks}
          existingRemarks={existingRemarks}
        />
      )}
      {currentStep === 'review' && (
        <ReviewStep
          {...formProps}
          memberList={memberList?.members ?? []}
          aircraft={aircraft}
          flightDate={flightDate}
          onEditSection={(step) => setStepIndex(WIZARD_STEPS.indexOf(step))}
          isEditing={isEditing}
          acTotalFlightTimeAfter={initialData?.acTotalFlightTime}
          originalTakeoffTimeEpoch={initialData?.takeoffTimeEpoch}
          originalLandingTimeEpoch={initialData?.landingTimeEpoch}
          pendingFuelRecord={pendingFuelRecord}
          pendingOilRecord={pendingOilRecord}
        />
      )}

      <Dialog open={showDiscardConfirm} onClose={() => setShowDiscardConfirm(false)}>
        <DialogContent>
          <DialogContentText>{t('flightLog.wizard.discardBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDiscardConfirm(false)}>{t('common.cancel')}</Button>
          <Button
            color='error'
            onClick={() => {
              discardDraft()
              if (isEditing) onClose?.()
              else navigate(backLink)
            }}
          >
            {t('flightLog.wizard.discard')}
          </Button>
        </DialogActions>
      </Dialog>

      <OverlapWarningDialog {...overlapDialogProps} />
      <LongTaxiWarningDialog {...longTaxiDialogProps} />
      <ConfirmDialog
        {...groundingDialogProps}
        title={t('flightLog.defects.groundingConfirmTitle')}
        message={t('flightLog.defects.groundingConfirmMessage')}
        confirmText={t('flightLog.defects.groundingConfirmButton')}
        cancelText={t('general.cancel')}
        severity='warning'
      />
      <SafetyReportPromptDialog {...safetyPromptProps} />
    </WizardShell>
  )
}
