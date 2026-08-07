import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs, { type Dayjs } from 'dayjs'
import type { ItemListResponse } from '@backend/routes/invoicing/models'
import {
  MIK_SUPPORTED_CURRENCIES,
  type CreateExpenseClaim,
  type ExpenseCategory,
  type ExpenseClaim,
  type ExpenseClaimAttachment,
} from '@backend/routes/expenses/models'
import type { FlightLogListEntry, FlightLogListResponse } from '@backend/routes/flight-log/models'
import useApi, { sharedApi } from '../../hooks/useApi'
import { useMe } from '../../hooks/useMe'
import { Title } from '../../components/Title'
import { getExpenseCategoryLabel } from './expenseUi'
import {
  AttachmentsUploadZone,
  BankDetailsFields,
  type EditableLineItem,
  LineItemsTable,
  defaultUnitForCategory,
  isAirportOutsideFinland,
  makeDefaultLineItem,
  validateHetu,
  validateIban,
} from './expenseShared'
import {
  MILEAGE_MAX_KM,
  MileageLegsEditor,
  type MileageLegForm,
  isMileageLegValid,
  makeMileageLegForm,
} from './MileageDetailFields'
import {
  readWizardDraft,
  writeWizardDraft,
  clearWizardDraft,
  discardAllOrphanWizardDrafts,
} from '../../utils/wizardDraft'
import { useWizardDraftGate } from '../../hooks/useWizardDraftGate'
import { WizardDraftChooserBanner } from '../../components/WizardDraftChooserBanner'

// ─── Form state ───────────────────────────────────────────────────────────────

type WizardForm = {
  categoryId: number
  aircraftId?: string
  flightLogId?: string
  title: string
  description: string
  expenseDate?: string
  currency: string
  iban: string
  ibanAccountName: string
  lineItems: EditableLineItem[]
}

const defaultForm: WizardForm = {
  categoryId: 0,
  title: '',
  description: '',
  currency: 'EUR',
  iban: '',
  ibanAccountName: '',
  lineItems: [makeDefaultLineItem()],
}

// ─── Draft persistence ──────────────────────────────────────────────────────────
// iOS Safari can silently kill a backgrounded tab (e.g. switching to another app for
// a few minutes) and reload it from scratch on return, wiping this wizard's in-memory
// state. Snapshot progress to localStorage so a reload resumes instead of restarting.

const EXPENSE_WIZARD_DRAFT_KEY = 'expenseClaim:new'

interface ExpenseWizardDraft {
  step: number
  form: WizardForm
  fuelForFlight: boolean | null
  flightMode: 'dropdown' | 'manual'
  attachments: ExpenseClaimAttachment[]
  savedClaimId: string | null
  mileageLegs: MileageLegForm[]
  hetu: string
  claimFxRate: number | null
}

// ─── Step keys ────────────────────────────────────────────────────────────────

const STEP_WELCOME = 'expenses.wizard.step.welcome'
const STEP_DETAILS = 'expenses.wizard.step.details'
const STEP_FUEL_FLIGHT = 'expenses.wizard.step.fuelFlight'
const STEP_MILEAGE = 'expenses.wizard.step.mileage'
const STEP_BANK = 'expenses.wizard.step.bankDetails'
const STEP_LINE_ITEMS = 'expenses.wizard.step.lineItems'
const STEP_RECEIPT = 'expenses.wizard.step.receipt'
const STEP_REVIEW = 'expenses.wizard.step.review'

function useWizardSteps(isFuel: boolean, isMileage: boolean) {
  return useMemo(() => {
    const steps = [STEP_WELCOME, STEP_DETAILS]
    if (isFuel) steps.push(STEP_FUEL_FLIGHT)
    if (isMileage) steps.push(STEP_MILEAGE)
    steps.push(STEP_BANK)
    if (!isMileage) steps.push(STEP_LINE_ITEMS)
    if (!isMileage) steps.push(STEP_RECEIPT)
    steps.push(STEP_REVIEW)
    return steps
  }, [isFuel, isMileage])
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

// Wraps the actual wizard so a conditional early-return (needed when several
// orphaned drafts from other, presumably-gone tabs are ambiguous and require the user
// to pick one) never sits partway through ExpenseClaimWizardInner's own hooks —
// mirrors the same split already used for this reason in flightLog/FlightLogEntry.tsx.
export default function ExpenseClaimWizard() {
  const { t } = useTranslation()
  const gate = useWizardDraftGate<ExpenseWizardDraft>(EXPENSE_WIZARD_DRAFT_KEY)

  if (gate.status === 'ambiguous') {
    const topCandidateTitle = gate.candidates[0]?.value.form?.title
    return (
      <Box>
        <Title label={t('expenses.new')} />
        <WizardDraftChooserBanner
          title={t('expenses.wizard.draftAmbiguousTitle')}
          body={
            t('expenses.wizard.draftAmbiguousBody', { count: gate.candidates.length }) +
            (topCandidateTitle
              ? ` ${t('expenses.wizard.draftMostRecentTitle', { title: topCandidateTitle })}`
              : '')
          }
          resumeLabel={t('expenses.wizard.draftResumeMostRecent')}
          startFreshLabel={t('expenses.wizard.draftStartFresh')}
          onResumeMostRecent={gate.resumeMostRecent}
          onStartFresh={gate.startFresh}
        />
      </Box>
    )
  }

  return <ExpenseClaimWizardInner />
}

function ExpenseClaimWizardInner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { me } = useMe()

  // Read at most once per mount — later renders must not re-read, since only the
  // initial (lazy) state below ever consumes this.
  const persistedDraftRef = useRef<ExpenseWizardDraft | null | undefined>(undefined)
  if (persistedDraftRef.current === undefined) {
    persistedDraftRef.current = readWizardDraft<ExpenseWizardDraft>(EXPENSE_WIZARD_DRAFT_KEY)
  }
  const persistedDraft = persistedDraftRef.current
  const [showRestoredBanner, setShowRestoredBanner] = useState(!!persistedDraft)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const [step, setStep] = useState(persistedDraft?.step ?? 0)
  const [form, setForm] = useState<WizardForm>(persistedDraft?.form ?? defaultForm)
  const [fuelForFlight, setFuelForFlight] = useState<boolean | null>(
    persistedDraft?.fuelForFlight ?? null,
  )
  const [flightMode, setFlightMode] = useState<'dropdown' | 'manual'>(
    persistedDraft?.flightMode ?? 'dropdown',
  )
  const [attachments, setAttachments] = useState<ExpenseClaimAttachment[]>(
    persistedDraft?.attachments ?? [],
  )
  const [savedClaimId, setSavedClaimId] = useState<string | null>(
    persistedDraft?.savedClaimId ?? null,
  )
  const [submitError, setSubmitError] = useState<string>()
  const [mileageLegs, setMileageLegs] = useState<MileageLegForm[]>(
    persistedDraft?.mileageLegs ?? [makeMileageLegForm()],
  )
  const [hetu, setHetu] = useState(persistedDraft?.hetu ?? '')
  const [claimFxRate, setClaimFxRate] = useState<number | null>(persistedDraft?.claimFxRate ?? null)
  const [fxRateLoading, setFxRateLoading] = useState(false)

  // Set the instant the draft is intentionally cleared (discard, submit, or landing on
  // an already-saved claim) so the debounced autosave below can never resurrect it.
  // Clearing storage alone isn't enough: the debounce timer armed by the last change
  // before that point is only cancelled by this effect's cleanup on unmount, and while
  // this component unmounts on every one of those paths (they all call navigate()
  // right after clearing), that unmount is a subsequent React render - not guaranteed
  // to beat the 400ms timer under all conditions. See the same guard in
  // FlightLogEntryWizard.tsx, where it's required for a real (not just theoretical) race.
  const draftClearedRef = useRef(false)

  // Autosave every change so an iOS reload (or an accidental navigation away) can
  // resume this exact draft instead of losing it. Debounced like the flight-log
  // wizard's equivalent effect: writing synchronously on every keystroke would
  // stringify+persist the whole draft on the main thread that often, causing
  // noticeable input jank especially on lower-end mobile Safari.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (draftClearedRef.current) return
      writeWizardDraft<ExpenseWizardDraft>(EXPENSE_WIZARD_DRAFT_KEY, {
        step,
        form,
        fuelForFlight,
        flightMode,
        attachments,
        savedClaimId,
        mileageLegs,
        hetu,
        claimFxRate,
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [
    step,
    form,
    fuelForFlight,
    flightMode,
    attachments,
    savedClaimId,
    mileageLegs,
    hetu,
    claimFxRate,
  ])

  const categoryApi = useApi<ExpenseCategory[]>({ url: 'v1/expenses/categories' })
  const { data: mileageAllowance } = useApi<{ effectiveRatePerKm: number; discountPct: number }>({
    url: 'v1/mileage-allowances/current',
  })
  const { data: costCentres } = useApi<{ code: string; description: string }[]>({
    url: 'v1/cost-centres',
  })
  const { data: invoiceItemsData } = useApi<ItemListResponse>({
    url: 'v1/invoices/items',
  })
  const recentFlightsApi = useApi<FlightLogListResponse>({
    url: 'v1/flight-log',
    params: { orderLatestFirst: true, limit: 10 },
  })
  const { mutation } = useApi<ExpenseClaim>({ url: 'v1/expenses', skipFetch: true })

  const categories = categoryApi.data ?? []
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === form.categoryId),
    [categories, form.categoryId],
  )
  const isFuel = selectedCategory?.code === 'fuel'
  const isMileage = selectedCategory?.code === 'mileage'
  // Mileage claims have no receipt to attach — reimbursement is computed from the
  // server-verified distance instead. Every other category (fuel, "other" line-item
  // claims) needs at least one attachment before it can be submitted — enforced
  // server-side too (POST /:id/submit), this just avoids the user finding out only
  // after clicking submit.
  const attachmentsRequired = !isMileage
  const attachmentsMissing = attachmentsRequired && attachments.length === 0
  const expenseClaimItems = useMemo(
    () =>
      (invoiceItemsData?.items ?? [])
        .filter((item) => {
          if (!item.expense_claim_item) return false
          if (isFuel) return item.is_fuel_item
          if (isMileage) return item.is_km_item
          return item.is_other_item
        })
        .map((item) => ({ id: item.id, code: item.code, name: item.name })),
    [invoiceItemsData?.items, isFuel, isMileage],
  )
  const stepLabels = useWizardSteps(isFuel, isMileage)

  // Pre-fill from flight log fuel shortcut (navigate state)
  useEffect(() => {
    const prefill = (
      location.state as {
        fuelPrefill?: {
          flightLogId: string
          fuelUpliftLitres: number
          aircraftRegistration: string
          fuelType?: string
        }
      } | null
    )?.fuelPrefill
    if (!prefill || !categories.length) return
    const fuelCat = categories.find((c) => c.code === 'fuel')
    if (!fuelCat) return
    setForm((c) => ({
      ...c,
      categoryId: fuelCat.id,
      title: `Fuel – ${prefill.aircraftRegistration}`,
      aircraftId: prefill.aircraftRegistration,
      flightLogId: prefill.flightLogId,
      lineItems: [
        {
          ...makeDefaultLineItem('l', prefill.aircraftRegistration),
          description: `Fuel uplift ${prefill.aircraftRegistration}`,
          quantity: prefill.fuelUpliftLitres,
          fuelType: (prefill.fuelType as CreateExpenseClaim['fuelType']) ?? undefined,
        },
      ],
    }))
    setFuelForFlight(true)
    // Jump straight to the bank details step (past welcome, details, fuel-flight steps)
    setStep(3)
    // Run once when categories load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  // Pre-fill bank details from member profile once on load
  useEffect(() => {
    if (me?.iban && !form.iban) {
      setForm((c) => ({
        ...c,
        iban: me.iban ?? '',
        ibanAccountName: me.ibanAccountName ?? c.ibanAccountName,
      }))
    }
    // Only run when me loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  // When fuel category selected, switch pcs units to litres
  useEffect(() => {
    if (isFuel) {
      setForm((c) => ({
        ...c,
        lineItems: c.lineItems.map((li) => (li.unit === 'pcs' ? { ...li, unit: 'l' } : li)),
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFuel])

  // Mileage claims are always EUR — no currency selector needed
  useEffect(() => {
    if (isMileage && form.currency !== 'EUR') {
      setForm((c) => ({ ...c, currency: 'EUR' }))
      setClaimFxRate(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMileage])

  // Auto-compute one line item per mileage leg when a leg's distance/addresses or
  // the effective rate changes
  useEffect(() => {
    if (!isMileage || !mileageAllowance?.effectiveRatePerKm) return
    const rate = mileageAllowance.effectiveRatePerKm
    setForm((f) => ({
      ...f,
      lineItems: mileageLegs.map((leg, idx) => ({
        ...(f.lineItems[idx] ?? makeDefaultLineItem('km')),
        description:
          leg.startAddress && leg.endAddress
            ? `${leg.startAddress.label} - ${leg.endAddress.label}`
            : t('expenses.mileage.lineItemDescription'),
        quantity: Number(leg.distanceKm) || 0,
        unit: 'km',
        unitPrice: rate,
        totalCost: null,
      })),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMileage,
    JSON.stringify(
      mileageLegs.map((l) => [l.distanceKm, l.startAddress?.label, l.endAddress?.label]),
    ),
    mileageAllowance?.effectiveRatePerKm,
  ])

  // ── FX rate ──────────────────────────────────────────────────────────────────

  const fetchClaimFxRate = async (currency: string, date: string) => {
    if (currency === 'EUR' || !date) return
    setFxRateLoading(true)
    try {
      const resp = await sharedApi.get<{ rateToEur: number }>(
        `v1/expenses/fx-rate?currency=${encodeURIComponent(currency)}&date=${encodeURIComponent(date)}`,
      )
      setClaimFxRate(resp.data.rateToEur)
    } catch {
      // silently ignore — user can see that rate is unavailable
    } finally {
      setFxRateLoading(false)
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  const canAdvance = (): boolean => {
    switch (stepLabels[step]) {
      case STEP_WELCOME:
        return true
      case STEP_DETAILS:
        return (
          form.categoryId > 0 &&
          form.title.trim().length > 0 &&
          !!form.expenseDate &&
          new Date(form.expenseDate) <= new Date()
        )
      case STEP_FUEL_FLIGHT:
        return true
      case STEP_MILEAGE:
        return isMileage && validateHetu(hetu) && mileageLegs.every(isMileageLegValid)
      case STEP_BANK:
        return validateIban(form.iban) && form.ibanAccountName.trim().length > 0
      case STEP_LINE_ITEMS:
        return (
          form.lineItems.length > 0 &&
          form.lineItems.every(
            (li) =>
              li.description.trim().length > 0 &&
              li.quantity > 0 &&
              li.unitPrice > 0 &&
              (!isFuel || (!!li.costCentreCode && !!li.date && !!li.airport)),
          )
        )
      default:
        return true
    }
  }

  const next = () => setStep((s) => Math.min(s + 1, stepLabels.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  // ── Persistence ──────────────────────────────────────────────────────────────

  const saveDraft = async (): Promise<string | null> => {
    setSubmitError(undefined)
    const payload: CreateExpenseClaim = {
      ...form,
      description: form.description || undefined,
      aircraftId: form.aircraftId || undefined,
      flightLogId: isFuel && fuelForFlight ? form.flightLogId : undefined,
      iban: form.iban || undefined,
      ibanAccountName: form.ibanAccountName || undefined,
      expenseDate: form.expenseDate || undefined,
      currency: form.currency as CreateExpenseClaim['currency'],
      fxRate: form.currency !== 'EUR' ? claimFxRate : null,
      lineItems: isMileage
        ? mileageLegs.map((leg, idx) => ({
            ...(form.lineItems[idx] ?? makeDefaultLineItem('km')),
            description:
              leg.startAddress && leg.endAddress
                ? `${leg.startAddress.label} - ${leg.endAddress.label}`
                : t('expenses.mileage.lineItemDescription'),
            quantity: Number(leg.distanceKm) || 1,
            unit: 'km',
            unitPrice: mileageAllowance?.effectiveRatePerKm ?? 0,
            sortOrder: idx,
          }))
        : form.lineItems.map((item, idx) => ({
            ...item,
            sortOrder: idx,
          })),
      mileageLegs:
        isMileage &&
        mileageLegs.every((leg) => leg.startAddress && leg.endAddress && leg.distanceKm)
          ? mileageLegs.map((leg) => ({
              startAddress: leg.startAddress!.label,
              startLat: leg.startAddress!.lat,
              startLon: leg.startAddress!.lon,
              endAddress: leg.endAddress!.label,
              endLat: leg.endAddress!.lat,
              endLon: leg.endAddress!.lon,
              waypoints: leg.waypoints.filter((w) => w != null),
              journeyDate: leg.journeyDate,
              distanceKm: Number(leg.distanceKm),
              directDistanceKm: leg.directDistanceKm ?? undefined,
              justificationNote: leg.justificationNote.trim() || undefined,
              boardApproved: leg.boardApproved,
            }))
          : undefined,
      hetu: isMileage ? hetu || undefined : undefined,
    }

    const res = savedClaimId
      ? await mutation.trigger('PUT', payload, savedClaimId)
      : await mutation.trigger('POST', payload)

    if (res.error) {
      setSubmitError(res.error.detail ?? t('expenses.wizard.saveFailedGeneric'))
      return null
    }

    const id = res.data?.id ?? savedClaimId
    if (id) setSavedClaimId(id)
    return id ?? null
  }

  const handleAttachmentsUpload = async (files: File[]) => {
    const claimId = savedClaimId ?? (await saveDraft())
    if (!claimId) return
    const fd = new FormData()
    files.forEach((file) => fd.append('files', file))
    const res = await mutation.trigger<FormData, ExpenseClaimAttachment[]>(
      'POST',
      fd,
      `${claimId}/attachments`,
    )
    if (res.error) {
      setSubmitError(res.error.detail ?? t('expenses.wizard.saveFailedGeneric'))
      return
    }
    if (res.data) setAttachments((prev) => [...prev, ...res.data!])
  }

  const handleAttachmentDelete = async (attachmentId: number) => {
    if (!savedClaimId) return
    const res = await mutation.trigger(
      'DELETE',
      undefined,
      `${savedClaimId}/attachments/${attachmentId}`,
    )
    if (!res.error) setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
  }

  const previewMergedAttachments = async () => {
    if (!savedClaimId) return
    const res = await sharedApi.get(`v1/expenses/${savedClaimId}/attachments/merged-preview`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleSubmit = async () => {
    const claimId = await saveDraft()
    if (!claimId) return
    const res = await mutation.trigger('POST', {}, `${claimId}/submit`)
    if (res.error) {
      setSubmitError(res.error.detail ?? t('expenses.wizard.saveFailedGeneric'))
      return
    }
    draftClearedRef.current = true
    clearWizardDraft(EXPENSE_WIZARD_DRAFT_KEY)
    discardAllOrphanWizardDrafts(EXPENSE_WIZARD_DRAFT_KEY)
    navigate(`/expenses/${claimId}`)
  }

  // Once a draft is saved server-side, the claim itself (at /expenses/:id) becomes
  // the source of truth — the local wizard draft would otherwise resurrect stale data
  // the next time someone starts a brand new claim. Orphan siblings (left behind by
  // other tabs, or by an earlier auto-adoption that intentionally didn't delete its
  // source — see adoptWizardDraft) must be purged too, or the very next "start new
  // claim" gate check re-adopts one and this draft comes right back (issue: discard
  // "worked" but the old draft reappeared on the next new claim).
  const goToSavedClaim = (id: string | null) => {
    if (!id) return
    draftClearedRef.current = true
    clearWizardDraft(EXPENSE_WIZARD_DRAFT_KEY)
    discardAllOrphanWizardDrafts(EXPENSE_WIZARD_DRAFT_KEY)
    navigate(`/expenses/${id}`)
  }

  const discardDraft = () => {
    draftClearedRef.current = true
    clearWizardDraft(EXPENSE_WIZARD_DRAFT_KEY)
    discardAllOrphanWizardDrafts(EXPENSE_WIZARD_DRAFT_KEY)
    navigate('/expenses')
  }

  // ── Step content ─────────────────────────────────────────────────────────────

  const currentStep = stepLabels[step]

  const renderStep = () => {
    if (currentStep === STEP_WELCOME) {
      return (
        <Stack spacing={3}>
          <Alert severity='info' icon={<Icon icon='mdi:information-outline' />}>
            <Typography variant='subtitle2' gutterBottom sx={{ fontWeight: 'bold' }}>
              {t('expenses.wizard.receiptPolicyTitle')}
            </Typography>
            <Typography variant='body2' sx={{ whiteSpace: 'pre-line' }}>
              {t('expenses.wizard.receiptPolicyBody', {
                discountPct: mileageAllowance?.discountPct ?? 50,
              })}
            </Typography>
          </Alert>
        </Stack>
      )
    }

    if (currentStep === STEP_DETAILS) {
      return (
        <Stack spacing={2}>
          <TextField
            select
            label={t('expenses.fields.category')}
            value={form.categoryId || ''}
            fullWidth
            onChange={(e) => {
              const id = Number(e.target.value)
              const code = categories.find((c) => c.id === id)?.code
              setForm((c) => ({
                ...c,
                categoryId: id,
                lineItems: c.lineItems.map((li) => ({ ...li, unit: defaultUnitForCategory(code) })),
              }))
            }}
          >
            {categories.map((cat) => (
              <MenuItem key={cat.id} value={cat.id}>
                {getExpenseCategoryLabel({ categoryCode: cat.code, categoryId: cat.id }, t)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={t('expenses.fields.title')}
            value={form.title}
            fullWidth
            required
            onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
            slotProps={{
              htmlInput: { maxLength: 200 },
            }}
          />
          <TextField
            label={t('expenses.fields.description')}
            value={form.description}
            fullWidth
            multiline
            minRows={3}
            onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
            slotProps={{
              htmlInput: { maxLength: 2000 },
            }}
          />
          <DatePicker
            label={t('expenses.fields.expenseDate')}
            value={form.expenseDate ? dayjs(form.expenseDate) : null}
            disableFuture
            onChange={(newValue: Dayjs | null) => {
              const dateStr = newValue?.isValid() ? newValue.format('YYYY-MM-DD') : undefined
              setForm((c) => ({ ...c, expenseDate: dateStr }))
              if (dateStr && form.currency !== 'EUR') {
                void fetchClaimFxRate(form.currency, dateStr)
              }
            }}
            slotProps={{ textField: { sx: { maxWidth: 200 } } }}
          />
          {!isMileage && (
            <TextField
              select
              label={t('expenses.fields.currency')}
              value={form.currency}
              sx={{ minWidth: 120 }}
              onChange={(e) => {
                const newCur = e.target.value
                setForm((c) => ({ ...c, currency: newCur }))
                setClaimFxRate(null)
                if (newCur !== 'EUR' && form.expenseDate) {
                  void fetchClaimFxRate(newCur, form.expenseDate)
                }
              }}
            >
              {MIK_SUPPORTED_CURRENCIES.map((cur) => (
                <MenuItem key={cur} value={cur}>
                  {cur}
                </MenuItem>
              ))}
            </TextField>
          )}
          {!isMileage && form.currency !== 'EUR' && (fxRateLoading || claimFxRate) && (
            <Stack
              direction='row'
              spacing={0.5}
              sx={{
                alignItems: 'center',
              }}
            >
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {fxRateLoading
                  ? t('expenses.fields.fxRateLookingUp')
                  : `1 ${form.currency} = ${claimFxRate} EUR`}
              </Typography>
              {!fxRateLoading && (
                <Tooltip
                  title={
                    <a
                      href='https://www.frankfurter.app'
                      target='_blank'
                      rel='noopener noreferrer'
                      style={{ color: 'inherit' }}
                    >
                      FX rate source: frankfurter.app
                    </a>
                  }
                >
                  <IconButton size='small' sx={{ p: 0 }}>
                    <Icon icon='mdi:information-outline' width={16} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          )}
        </Stack>
      )
    }

    if (currentStep === STEP_FUEL_FLIGHT) {
      const recentFlights: FlightLogListEntry[] = recentFlightsApi.data?.logs ?? []
      return (
        <Stack spacing={3}>
          <Typography variant='body1'>{t('expenses.wizard.fuelFlightQuestion')}</Typography>
          <RadioGroup
            value={fuelForFlight === null ? '' : String(fuelForFlight)}
            onChange={(e) => setFuelForFlight(e.target.value === 'true')}
          >
            <FormControlLabel value='true' control={<Radio />} label={t('common.yes')} />
            <FormControlLabel value='false' control={<Radio />} label={t('common.no')} />
          </RadioGroup>
          {fuelForFlight && (
            <Stack spacing={2}>
              <Stack direction='row' spacing={1}>
                <Button
                  size='small'
                  variant={flightMode === 'dropdown' ? 'contained' : 'outlined'}
                  onClick={() => setFlightMode('dropdown')}
                >
                  {t('expenses.wizard.recentFlights')}
                </Button>
                <Button
                  size='small'
                  variant={flightMode === 'manual' ? 'contained' : 'outlined'}
                  onClick={() => setFlightMode('manual')}
                >
                  {t('expenses.wizard.enterFlightId')}
                </Button>
              </Stack>

              {flightMode === 'dropdown' ? (
                <Autocomplete
                  options={recentFlights}
                  loading={recentFlightsApi.isLoading}
                  getOptionLabel={(fl) =>
                    `#${fl.ajlbSeqNo} · ${fl.aircraftRegistration} · ${fl.departureAirport}→${fl.arrivalAirport} · ${fl.takeoffTimeUtc ? new Date(fl.takeoffTimeUtc).toLocaleDateString() : '?'}`
                  }
                  value={recentFlights.find((fl) => fl.flightId === form.flightLogId) ?? null}
                  onChange={(_e, fl) =>
                    setForm((c) => ({ ...c, flightLogId: fl?.flightId ?? undefined }))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('expenses.wizard.selectFlight')}
                      slotProps={{
                        ...params.slotProps,

                        input: {
                          ...params.slotProps.input,
                          endAdornment: (
                            <>
                              {recentFlightsApi.isLoading ? <CircularProgress size={20} /> : null}
                              {params.slotProps.input.endAdornment}
                            </>
                          ),
                        },
                      }}
                    />
                  )}
                />
              ) : (
                <TextField
                  label={t('expenses.wizard.flightLogId')}
                  type='number'
                  value={form.flightLogId ?? ''}
                  onChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      flightLogId: e.target.value || undefined,
                    }))
                  }
                />
              )}
            </Stack>
          )}
        </Stack>
      )
    }

    if (currentStep === STEP_MILEAGE) {
      return (
        <Stack spacing={2}>
          <MileageLegsEditor
            legs={mileageLegs}
            onChange={setMileageLegs}
            effectiveRatePerKm={mileageAllowance?.effectiveRatePerKm}
            maxKm={MILEAGE_MAX_KM}
          />
          <TextField
            label={t('expenses.mileage.hetu')}
            value={hetu}
            required
            fullWidth
            type='password'
            autoComplete='off'
            error={hetu.trim().length > 0 && !validateHetu(hetu)}
            helperText={
              hetu.trim().length > 0 && !validateHetu(hetu)
                ? t('expenses.mileage.hetuInvalid')
                : t('expenses.mileage.hetuHint')
            }
            onChange={(e) => setHetu(e.target.value.toUpperCase())}
            slotProps={{ htmlInput: { maxLength: 11 } }}
          />
        </Stack>
      )
    }

    if (currentStep === STEP_BANK) {
      return (
        <BankDetailsFields
          iban={form.iban}
          ibanAccountName={form.ibanAccountName}
          ibanFromProfile={!!me?.iban}
          onChange={(iban, ibanAccountName) => setForm((c) => ({ ...c, iban, ibanAccountName }))}
        />
      )
    }

    if (currentStep === STEP_LINE_ITEMS) {
      const defaultUnit = defaultUnitForCategory(selectedCategory?.code)
      return (
        <Stack spacing={2}>
          <LineItemsTable
            items={form.lineItems}
            onChange={(lineItems) => setForm((c) => ({ ...c, lineItems }))}
            claimCurrency={form.currency}
            claimFxRate={claimFxRate}
            expenseClaimItems={expenseClaimItems}
            costCentres={costCentres ?? []}
            isFuel={isFuel}
          />
          <Button
            startIcon={<Icon icon='mdi:plus' />}
            onClick={() =>
              setForm((c) => ({
                ...c,
                lineItems: [...c.lineItems, makeDefaultLineItem(defaultUnit, form.aircraftId)],
              }))
            }
          >
            {t('expenses.actions.addLineItem')}
          </Button>
        </Stack>
      )
    }

    if (currentStep === STEP_RECEIPT) {
      return (
        <AttachmentsUploadZone
          attachments={attachments}
          onUpload={handleAttachmentsUpload}
          onDelete={handleAttachmentDelete}
          onPreview={previewMergedAttachments}
          error={submitError}
          required={attachmentsRequired}
        />
      )
    }

    if (currentStep === STEP_REVIEW) {
      return (
        <Stack spacing={2}>
          <Paper variant='outlined' sx={{ p: 2 }}>
            <Typography variant='subtitle2' gutterBottom>
              {t('expenses.wizard.review.claim')}
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant='body2'>
                <b>{t('expenses.fields.category')}:</b>{' '}
                {getExpenseCategoryLabel(
                  { categoryCode: selectedCategory?.code, categoryId: form.categoryId },
                  t,
                )}
              </Typography>
              <Typography variant='body2'>
                <b>{t('expenses.fields.title')}:</b> {form.title}
              </Typography>
              {form.description && (
                <Typography variant='body2'>
                  <b>{t('expenses.fields.description')}:</b> {form.description}
                </Typography>
              )}
              {form.expenseDate && (
                <Typography variant='body2'>
                  <b>{t('expenses.fields.expenseDate')}:</b> {form.expenseDate}
                </Typography>
              )}
              <Typography variant='body2'>
                <b>{t('expenses.fields.currency')}:</b> {form.currency}
              </Typography>
              {form.currency !== 'EUR' && claimFxRate && (
                <Typography variant='body2'>
                  <b>{t('expenses.fields.fxRate')}:</b> 1 {form.currency} = {claimFxRate} EUR
                </Typography>
              )}
              {isFuel && fuelForFlight && form.flightLogId && (
                <Typography variant='body2'>
                  <b>{t('expenses.wizard.flightLogId')}:</b> #{form.flightLogId}
                </Typography>
              )}
              {isFuel && (
                <Typography variant='body2'>
                  <b>{t('expenses.fields.refuelOutsideFinland')}:</b>{' '}
                  {form.lineItems.some((item) => isAirportOutsideFinland(item.airport))
                    ? t('common.yes')
                    : t('common.no')}
                </Typography>
              )}
              {isMileage &&
                mileageLegs.map(
                  (leg, idx) =>
                    leg.distanceKm && (
                      <Box key={idx} sx={{ mt: idx > 0 ? 1 : 0 }}>
                        <Typography variant='body2'>
                          <b>
                            {t('expenses.mileage.sectionTitle')} {idx + 1}:
                          </b>{' '}
                          {leg.startAddress?.label} → {leg.endAddress?.label}
                        </Typography>
                        <Typography variant='body2'>
                          <b>{t('expenses.mileage.journeyDate')}:</b> {leg.journeyDate}
                        </Typography>
                        <Typography variant='body2'>
                          <b>{t('expenses.mileage.distanceKm')}:</b> {leg.distanceKm} km
                          {mileageAllowance && (
                            <>
                              {' '}
                              &mdash; €
                              {(
                                Number(leg.distanceKm) * mileageAllowance.effectiveRatePerKm
                              ).toFixed(2)}
                            </>
                          )}
                        </Typography>
                        {leg.boardApproved && (
                          <Typography variant='body2' sx={{ color: 'warning.main' }}>
                            ✓ {t('expenses.mileage.boardApprovedLabel')}
                          </Typography>
                        )}
                      </Box>
                    ),
                )}
            </Stack>
          </Paper>
          {!isMileage && (
            <Paper variant='outlined' sx={{ p: 2 }}>
              <Typography variant='subtitle2' gutterBottom>
                {t('expenses.fields.lineItems')}
              </Typography>
              <LineItemsTable
                items={form.lineItems}
                onChange={() => {}}
                disabled
                claimCurrency={form.currency}
                claimFxRate={claimFxRate}
                expenseClaimItems={expenseClaimItems}
                costCentres={costCentres ?? []}
                isFuel={isFuel}
              />
            </Paper>
          )}
          <Paper variant='outlined' sx={{ p: 2 }}>
            <Typography variant='subtitle2' gutterBottom>
              {t('expenses.fields.bankDetails')}
            </Typography>
            <Typography variant='body2'>
              {form.iban
                ? `${form.iban}${form.ibanAccountName ? ` (${form.ibanAccountName})` : ''}`
                : t('expenses.wizard.noBankDetails')}
            </Typography>
          </Paper>
          {!isMileage && (
            <Paper variant='outlined' sx={{ p: 2 }}>
              <Typography variant='subtitle2' gutterBottom>
                {t('expenses.fields.receipt')}
              </Typography>
              <Typography variant='body2'>
                {attachments.length
                  ? attachments.map((a) => a.fileName).join(', ')
                  : t('expenses.wizard.noReceipt')}
              </Typography>
              {attachmentsMissing && (
                <Alert severity='error' sx={{ mt: 1 }}>
                  {t('expenses.wizard.receiptRequiredWarning')}
                </Alert>
              )}
            </Paper>
          )}
          {!!submitError && <Alert severity='error'>{submitError}</Alert>}
        </Stack>
      )
    }

    return null
  }

  // ── Layout ────────────────────────────────────────────────────────────────────

  const isLastStep = step === stepLabels.length - 1

  return (
    <Box>
      <Stack direction='row' sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Title label={t('expenses.new')} />
        <Button color='error' size='small' onClick={() => setShowDiscardConfirm(true)}>
          {t('expenses.actions.discardDraft')}
        </Button>
      </Stack>

      {showRestoredBanner && (
        <Alert
          severity='info'
          onClose={() => setShowRestoredBanner(false)}
          action={
            <Button color='inherit' size='small' onClick={discardDraft}>
              {t('expenses.actions.discardDraft')}
            </Button>
          }
          sx={{ mb: 2 }}
        >
          {t('expenses.wizard.draftRestored')}
          {form.title && ` "${form.title}"`}
        </Alert>
      )}

      <Dialog open={showDiscardConfirm} onClose={() => setShowDiscardConfirm(false)}>
        <DialogContent>
          <DialogContentText>{t('expenses.wizard.discardBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDiscardConfirm(false)}>{t('common.cancel')}</Button>
          <Button color='error' onClick={discardDraft}>
            {t('expenses.actions.discardDraft')}
          </Button>
        </DialogActions>
      </Dialog>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
          {stepLabels.map((label) => (
            <Step key={label}>
              <StepLabel>{t(label)}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Divider sx={{ mb: 3 }} />

        <Box sx={{ minHeight: 200 }}>{renderStep()}</Box>

        {/* STEP_RECEIPT and STEP_REVIEW already surface submitError inline, near the
            relevant content — shown here too so a failed save/submit is never silently
            invisible on every other step. */}
        {!!submitError && currentStep !== STEP_RECEIPT && currentStep !== STEP_REVIEW && (
          <Alert severity='error' sx={{ mt: 2 }}>
            {submitError}
          </Alert>
        )}

        <Divider sx={{ mt: 3, mb: 2 }} />

        <Stack
          direction='row'
          sx={{
            justifyContent: 'space-between',
          }}
        >
          <Button
            variant='outlined'
            onClick={back}
            disabled={step === 0}
            startIcon={<Icon icon='mdi:chevron-left' />}
          >
            {t('common.back')}
          </Button>

          <Stack direction='row' spacing={1}>
            {!isLastStep && (
              <Button
                variant='text'
                onClick={() => void saveDraft().then(goToSavedClaim)}
                disabled={mutation.isMutating}
              >
                {t('expenses.actions.saveDraft')}
              </Button>
            )}
            {isLastStep ? (
              <>
                <Button
                  variant='outlined'
                  onClick={() => void saveDraft().then(goToSavedClaim)}
                  disabled={mutation.isMutating}
                >
                  {t('expenses.actions.saveDraft')}
                </Button>
                <Tooltip
                  title={attachmentsMissing ? t('expenses.wizard.receiptRequiredWarning') : ''}
                >
                  <span>
                    <Button
                      variant='contained'
                      onClick={() => void handleSubmit()}
                      disabled={mutation.isMutating || attachmentsMissing}
                      endIcon={<Icon icon='mdi:send' />}
                    >
                      {t('expenses.actions.submit')}
                    </Button>
                  </span>
                </Tooltip>
              </>
            ) : (
              <Button
                variant='contained'
                onClick={next}
                disabled={!canAdvance()}
                endIcon={<Icon icon='mdi:chevron-right' />}
              >
                {t('common.next')}
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Box>
  )
}
