import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
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
  type ExpenseClaimReceipt,
  ExpenseClaimStatus,
} from '@backend/routes/expenses/models'
import useApi from '../../hooks/useApi'
import { sharedApi } from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import { formatExpenseAmount, getExpenseCategoryLabel, isExpenseEditable } from './expenseUi'
import {
  AttachmentsUploadZone,
  BankDetailsFields,
  type EditableLineItem,
  LineItemsTable,
  ReceiptUploadZone,
  defaultUnitForCategory,
  makeDefaultLineItem,
  validateHetu,
} from './expenseShared'
import { MileageLegsEditor, type MileageLegForm, makeMileageLegForm } from './MileageDetailFields'

// ─── Form state ───────────────────────────────────────────────────────────────

type FormState = Omit<CreateExpenseClaim, 'lineItems'> & {
  iban: string
  ibanAccountName: string
  lineItems: EditableLineItem[]
}

const defaultForm: FormState = {
  categoryId: 0,
  title: '',
  description: '',
  currency: 'EUR',
  iban: '',
  ibanAccountName: '',
  lineItems: [makeDefaultLineItem()],
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExpenseClaimForm({ claimId: claimIdProp }: { claimId?: string }) {
  const params = useParams<{ id: string }>()
  const claimId = claimIdProp ?? params.id
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(defaultForm)
  const [claimCurrency, setClaimCurrency] = useState<string>('EUR')
  const [claimFxRate, setClaimFxRate] = useState<number | null>(null)
  const [receipt, setReceipt] = useState<ExpenseClaimReceipt | undefined>()
  const [attachments, setAttachments] = useState<ExpenseClaimAttachment[]>([])
  const [submitError, setSubmitError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<{
    iban?: string
    ibanAccountName?: string
    expenseDate?: string
    lineItems?: string
    mileageLegs?: string
    hetu?: string
  }>({})
  const [uploadError, setUploadError] = useState<string>()
  const [infoMessage, setInfoMessage] = useState<string>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [mileageLegs, setMileageLegs] = useState<MileageLegForm[]>([makeMileageLegForm()])
  const [hetu, setHetu] = useState('')
  const [fxRateLoading, setFxRateLoading] = useState(false)

  const categoryApi = useApi<ExpenseCategory[]>({ url: 'v1/expenses/categories' })
  const { data: mileageAllowance } = useApi<{ effectiveRatePerKm: number }>({
    url: 'v1/mileage-allowances/current',
  })
  const { data: costCentres } = useApi<{ code: string; description: string }[]>({
    url: 'v1/cost-centres',
  })
  const { data: invoiceItemsData } = useApi<ItemListResponse>({
    url: 'v1/invoices/items',
  })
  const claimApi = useApi<ExpenseClaim>({
    url: claimId ? `v1/expenses/${claimId}` : 'v1/expenses',
    skipFetch: !claimId,
  })
  const { mutation } = useApi<ExpenseClaim>({ url: 'v1/expenses', skipFetch: true })

  useEffect(() => {
    if (!claimApi.data) return
    const today = new Date().toISOString().substring(0, 10)
    setForm({
      categoryId: claimApi.data.categoryId,
      aircraftId: claimApi.data.aircraftId ?? undefined,
      flightLogId: claimApi.data.flightLogId ?? undefined,
      title: claimApi.data.title,
      description: claimApi.data.description ?? undefined,
      expenseDate: (claimApi.data.expenseDate as string | null | undefined) ?? undefined,
      currency: (claimApi.data.currency ?? 'EUR') as CreateExpenseClaim['currency'],
      fxRate: claimApi.data.fxRate ?? null,
      iban: claimApi.data.iban ?? '',
      ibanAccountName: claimApi.data.ibanAccountName ?? '',
      lineItems: claimApi.data.lineItems?.map((item) => ({
        id: item.id,
        itemId: item.itemId ?? null,
        description: item.description,
        date: item.date ?? today,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalCost: item.totalCost,
        sortOrder: item.sortOrder,
        costCentreCode: item.costCentreCode ?? null,
        fuelType: item.fuelType,
        airport: item.airport ?? null,
        paidWithClubCard: item.paidWithClubCard ?? false,
      })) ?? [makeDefaultLineItem()],
    })
    setClaimCurrency(claimApi.data.currency ?? 'EUR')
    setClaimFxRate(claimApi.data.fxRate ?? null)
    setReceipt(claimApi.data.receipt)
    setAttachments(claimApi.data.attachments ?? [])
    if (claimApi.data.mileageLegs?.length) {
      setMileageLegs(
        claimApi.data.mileageLegs.map((leg) => ({
          startAddress: { label: leg.startAddress, lat: leg.startLat, lon: leg.startLon },
          endAddress: { label: leg.endAddress, lat: leg.endLat, lon: leg.endLon },
          waypoints: leg.waypoints.map((w) => ({ label: w.label, lat: w.lat, lon: w.lon })),
          journeyDate: leg.journeyDate,
          distanceKm: String(leg.distanceKm),
          directDistanceKm: leg.directDistanceKm ?? null,
          justificationNote: leg.justificationNote ?? '',
          boardApproved: leg.boardApproved ?? false,
          distanceManuallyEdited: true, // don't overwrite a saved distance with a fresh recompute
        })),
      )
    }
    setHetu('') // never pre-fill HETU from API (returned masked)
  }, [claimApi.data])

  const categories = categoryApi.data ?? []
  const selectedCategory = useMemo(
    () => categories.find((cat) => cat.id === form.categoryId),
    [categories, form.categoryId],
  )
  const isMileage = selectedCategory?.code === 'mileage'
  const isFuel = selectedCategory?.code === 'fuel'
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

  const editable = !claimApi.data || isExpenseEditable(claimApi.data.status)
  const currentClaimId = claimApi.data?.id ?? claimId
  const isClaimNonEur = claimCurrency !== 'EUR'
  const totalAmount = form.lineItems.reduce(
    (sum, item) =>
      sum +
      (item.totalCost ?? item.quantity * item.unitPrice) * (isClaimNonEur ? (claimFxRate ?? 1) : 1),
    0,
  )

  // Mileage claims are always EUR — no currency selector needed
  useEffect(() => {
    if (isMileage && claimCurrency !== 'EUR') {
      setClaimCurrency('EUR')
      setClaimFxRate(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMileage])

  // Auto-compute one line item per mileage leg whenever a leg's distance/addresses
  // or the effective rate changes
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
        // Always re-derive from quantity * unitPrice — a stale persisted totalCost
        // from before a distance/rate correction must not survive the recompute.
        totalCost: null,
        currency: 'EUR',
        fxRate: null,
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

  // ── Save ──────────────────────────────────────────────────────────────────────

  const fetchAndApplyEcbRate = async (currency: string, date: string) => {
    if (currency === 'EUR' || !date) return
    setFxRateLoading(true)
    try {
      const resp = await sharedApi.get<{ rateToEur: number }>(
        `v1/expenses/fx-rate?currency=${encodeURIComponent(currency)}&date=${encodeURIComponent(date)}`,
      )
      setClaimFxRate(resp.data.rateToEur)
    } catch {
      // silently ignore — user can enter FX rate manually
    } finally {
      setFxRateLoading(false)
    }
  }

  const saveClaim = async (submitAfterSave: boolean) => {
    setSubmitError(undefined)
    setInfoMessage(undefined)

    const errors: {
      iban?: string
      ibanAccountName?: string
      expenseDate?: string
      lineItems?: string
      mileageLegs?: string
      hetu?: string
    } = {}
    const lineTotal = form.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    if (lineTotal <= 0) errors.lineItems = t('expenses.messages.zeroTotal')
    if (isFuel && form.lineItems.some((item) => !item.costCentreCode)) {
      errors.lineItems = t('expenses.validation.aircraftRequired')
    } else if (
      isFuel &&
      // Airport/date are only required for new line items — pre-existing (persisted)
      // ones may predate this field and must remain editable/submittable as-is.
      form.lineItems.some((item) => !item.id && (!item.date || !item.airport))
    ) {
      errors.lineItems = t('expenses.validation.airportRequired')
    }
    if (!form.iban.trim()) errors.iban = t('expenses.messages.ibanRequired')
    if (!form.ibanAccountName.trim())
      errors.ibanAccountName = t('expenses.messages.ibanAccountNameRequired')
    if (!form.expenseDate) errors.expenseDate = t('expenses.messages.expenseDateRequired')
    if (isMileage) {
      const maxKm = Number(import.meta.env.VITE_MILEAGE_MAX_KM) || 100
      const legInvalid = mileageLegs.some((leg) => {
        const km = Number(leg.distanceKm) || 0
        const needsJustification =
          !!leg.directDistanceKm && km > leg.directDistanceKm * 1.2 && !leg.justificationNote.trim()
        return (
          !leg.startAddress ||
          !leg.endAddress ||
          !leg.journeyDate ||
          km <= 0 ||
          (km > maxKm && !leg.boardApproved) ||
          needsJustification
        )
      })
      if (legInvalid) {
        errors.mileageLegs = t('expenses.validation.mileageDetailsRequired')
      } else if (hetu.trim() && !validateHetu(hetu)) {
        errors.hetu = t('expenses.mileage.hetuInvalid')
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    const payload: CreateExpenseClaim = {
      ...form,
      description: form.description || undefined,
      aircraftId: form.aircraftId || undefined,
      flightLogId: form.flightLogId || undefined,
      iban: form.iban || undefined,
      ibanAccountName: form.ibanAccountName || undefined,
      currency: claimCurrency as CreateExpenseClaim['currency'],
      fxRate: claimCurrency !== 'EUR' ? claimFxRate : null,
      lineItems: form.lineItems.map((item, index) => ({
        ...item,
        sortOrder: index,
      })),
      mileageLegs: isMileage
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
      // Empty means "leave unchanged" — the API never returns the HETU unmasked,
      // so this field is blank unless the user retyped it.
      hetu: isMileage ? hetu.trim() || undefined : undefined,
    }

    const response = currentClaimId
      ? await mutation.trigger('PUT', payload, currentClaimId)
      : await mutation.trigger('POST', payload)

    if (response.error) {
      setSubmitError(response.error.detail)
      return
    }

    const savedClaimId = response.data?.id ?? currentClaimId
    if (!savedClaimId) {
      setSubmitError('Failed to save expense claim.')
      return
    }

    if (submitAfterSave) {
      const submitResponse = await mutation.trigger('POST', {}, `${savedClaimId}/submit`)
      if (submitResponse.error) {
        setSubmitError(submitResponse.error.detail)
        return
      }
      navigate(`/expenses/${savedClaimId}`)
      return
    }

    setInfoMessage('Draft saved.')
    if (!currentClaimId) {
      navigate(`/expenses/${savedClaimId}/edit`)
      return
    }
    await claimApi.mutate()
  }

  const deleteClaim = async () => {
    if (!currentClaimId) return
    setDeleting(true)
    const response = await mutation.trigger('DELETE', undefined, currentClaimId)
    setDeleting(false)
    if (response.error) {
      setSubmitError(response.error.detail)
      setDeleteDialogOpen(false)
      return
    }
    navigate('/expenses')
  }

  // ── Receipt handlers ──────────────────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    if (!currentClaimId) {
      setUploadError('Save the draft before uploading receipts.')
      return
    }
    setUploadError(undefined)
    // Sanity ceiling only, matching the backend's raw upload cap (issue #1075) — the
    // server compresses images down after upload, so pre-checking against the much
    // smaller *post-compression* target here (as this used to) rejected ordinary phone
    // photos before they ever got a chance to be compressed. PDFs still have their own
    // tighter 5MB backend cap, enforced server-side after upload.
    const maxBytes = 40 * 1024 * 1024
    if (file.size > maxBytes) {
      setUploadError(t('expenses.messages.fileTooLarge'))
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    const response = await mutation.trigger<FormData, ExpenseClaimReceipt>(
      'POST',
      formData,
      `${currentClaimId}/receipt`,
    )
    if (response.error) {
      setUploadError(response.error.detail)
      return
    }
    if (response.data) setReceipt(response.data as ExpenseClaimReceipt)
  }

  const openReceipt = async () => {
    if (!currentClaimId) return
    const response = await mutation.trigger<undefined, { url: string }>(
      'GET',
      undefined,
      `${currentClaimId}/receipt`,
    )
    if (response.data?.url) window.open(response.data.url, '_blank', 'noopener,noreferrer')
  }

  const deleteReceipt = async () => {
    if (!currentClaimId) return
    const response = await mutation.trigger('DELETE', undefined, `${currentClaimId}/receipt`)
    if (response.error) {
      setUploadError(response.error.detail)
      return
    }
    setReceipt(undefined)
  }

  // ── Attachment handlers (issue #955 — multi-file replacement for the receipt above) ──

  const handleAttachmentsUpload = async (files: File[]) => {
    if (!currentClaimId) {
      setUploadError('Save the draft before uploading receipts.')
      return
    }
    setUploadError(undefined)
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    const response = await mutation.trigger<FormData, ExpenseClaimAttachment[]>(
      'POST',
      formData,
      `${currentClaimId}/attachments`,
    )
    if (response.error) {
      setUploadError(response.error.detail)
      return
    }
    if (response.data) setAttachments((prev) => [...prev, ...response.data!])
  }

  const deleteAttachment = async (attachmentId: number) => {
    if (!currentClaimId) return
    const response = await mutation.trigger(
      'DELETE',
      undefined,
      `${currentClaimId}/attachments/${attachmentId}`,
    )
    if (response.error) {
      setUploadError(response.error.detail)
      return
    }
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
  }

  const previewMergedAttachments = async () => {
    if (!currentClaimId) return
    const res = await sharedApi.get(`v1/expenses/${currentClaimId}/attachments/merged-preview`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Box>
      <Title label={claimId ? form.title || t('expenses.title') : t('expenses.new')} />
      <RemoteContent
        isLoading={categoryApi.isLoading || claimApi.isLoading}
        error={categoryApi.error ?? claimApi.error}
      >
        {!editable && (
          <Alert severity='info' sx={{ mb: 2 }}>
            This claim is no longer editable.
          </Alert>
        )}
        {claimApi.data?.status === ExpenseClaimStatus.PENDING_INFO && (
          <Alert severity='warning' sx={{ mb: 2 }}>
            {t('expenses.pendingInfoEditNotice')}
          </Alert>
        )}
        {!!submitError && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {submitError}
          </Alert>
        )}
        {!!infoMessage && (
          <Alert severity='success' sx={{ mb: 2 }}>
            {infoMessage}
          </Alert>
        )}

        <Stack spacing={3}>
          {/* ── Claim details ── */}
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <TextField
                select
                label={t('expenses.fields.category')}
                value={form.categoryId}
                disabled={!editable}
                fullWidth
                onChange={(e) => {
                  const newId = Number(e.target.value)
                  const newCode = categories.find((c) => c.id === newId)?.code
                  const newUnit = defaultUnitForCategory(newCode)
                  setForm((c) => ({
                    ...c,
                    categoryId: newId,
                    lineItems: c.lineItems.map((li) =>
                      li.unit === defaultUnitForCategory(selectedCategory?.code)
                        ? { ...li, unit: newUnit }
                        : li,
                    ),
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
                disabled={!editable}
                fullWidth
                onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
                slotProps={{
                  htmlInput: { maxLength: 200 },
                }}
              />

              <TextField
                label={t('expenses.fields.description')}
                multiline
                minRows={4}
                value={form.description ?? ''}
                disabled={!editable}
                fullWidth
                onChange={(e) =>
                  setForm((c) => ({ ...c, description: e.target.value || undefined }))
                }
                slotProps={{
                  htmlInput: { maxLength: 2000 },
                }}
              />

              <DatePicker
                label={t('expenses.fields.expenseDate')}
                value={form.expenseDate ? dayjs(form.expenseDate) : null}
                disabled={!editable}
                disableFuture
                onChange={(newValue: Dayjs | null) => {
                  const dateStr = newValue?.isValid() ? newValue.format('YYYY-MM-DD') : undefined
                  setForm((current) => ({ ...current, expenseDate: dateStr }))
                  if (dateStr) setFieldErrors((e) => ({ ...e, expenseDate: undefined }))
                  if (dateStr && claimCurrency !== 'EUR') {
                    void fetchAndApplyEcbRate(claimCurrency, dateStr)
                  }
                }}
                slotProps={{
                  textField: {
                    sx: { maxWidth: 200 },
                    error: !!fieldErrors.expenseDate,
                    helperText: fieldErrors.expenseDate,
                  },
                }}
              />

              {!isMileage && (
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                  sx={{
                    alignItems: 'flex-start',
                  }}
                >
                  <TextField
                    select
                    label={t('expenses.fields.currency')}
                    value={claimCurrency}
                    disabled={!editable}
                    onChange={(event) => {
                      const newCur = event.target.value
                      setClaimCurrency(newCur)
                      setClaimFxRate(null)
                      if (newCur !== 'EUR' && form.expenseDate) {
                        void fetchAndApplyEcbRate(newCur, form.expenseDate)
                      }
                    }}
                    sx={{ minWidth: 120 }}
                  >
                    {MIK_SUPPORTED_CURRENCIES.map((cur) => (
                      <MenuItem key={cur} value={cur}>
                        {cur}
                      </MenuItem>
                    ))}
                  </TextField>
                  {claimCurrency !== 'EUR' && (
                    <TextField
                      type='number'
                      label={t('expenses.fields.fxRate')}
                      placeholder={t('expenses.fields.fxRatePlaceholder')}
                      value={claimFxRate ?? ''}
                      disabled={!editable}
                      onFocus={(e) => e.target.select()}
                      onChange={(event) =>
                        setClaimFxRate(event.target.value ? Number(event.target.value) : null)
                      }
                      helperText={
                        fxRateLoading
                          ? t('expenses.fields.fxRateLookingUp')
                          : claimFxRate
                            ? `1 ${claimCurrency} = ${claimFxRate} EUR`
                            : undefined
                      }
                      sx={{ minWidth: 200 }}
                    />
                  )}
                </Stack>
              )}

              <TextField
                label={t('expenses.wizard.flightLogId')}
                value={form.flightLogId ?? ''}
                disabled={!editable}
                onChange={(e) =>
                  setForm((c) => ({
                    ...c,
                    flightLogId: e.target.value || undefined,
                  }))
                }
              />
            </Stack>
          </Paper>

          {/* ── Mileage legs (only for mileage claims) ── */}
          {isMileage && (
            <Paper sx={{ p: 3 }}>
              <MileageLegsEditor
                legs={mileageLegs}
                onChange={(legs) => {
                  setMileageLegs(legs)
                  setFieldErrors((e) => ({ ...e, mileageLegs: undefined }))
                }}
                disabled={!editable}
                effectiveRatePerKm={mileageAllowance?.effectiveRatePerKm}
                maxKm={Number(import.meta.env.VITE_MILEAGE_MAX_KM) || 100}
              />
              {!!fieldErrors.mileageLegs && (
                <Alert severity='error' sx={{ mt: 2 }}>
                  {fieldErrors.mileageLegs}
                </Alert>
              )}
              <TextField
                label={t('expenses.mileage.hetu')}
                value={hetu}
                disabled={!editable}
                fullWidth
                type='password'
                autoComplete='off'
                error={!!fieldErrors.hetu}
                helperText={fieldErrors.hetu ?? t('expenses.mileage.hetuHint')}
                onChange={(e) => {
                  setHetu(e.target.value.toUpperCase())
                  setFieldErrors((err) => ({ ...err, hetu: undefined }))
                }}
                slotProps={{ htmlInput: { maxLength: 11 } }}
                sx={{ mt: 2 }}
              />
            </Paper>
          )}

          {/* ── Bank details ── */}
          <Paper sx={{ p: 3 }}>
            <Typography variant='h6' sx={{ mb: 2 }}>
              {t('expenses.fields.bankDetails')}
            </Typography>
            <BankDetailsFields
              iban={form.iban}
              ibanAccountName={form.ibanAccountName}
              disabled={!editable}
              ibanError={fieldErrors.iban}
              ibanAccountNameError={fieldErrors.ibanAccountName}
              onChange={(iban, ibanAccountName) => {
                setForm((c) => ({ ...c, iban, ibanAccountName }))
                if (iban.trim()) setFieldErrors((e) => ({ ...e, iban: undefined }))
                if (ibanAccountName.trim())
                  setFieldErrors((e) => ({ ...e, ibanAccountName: undefined }))
              }}
            />
          </Paper>

          {/* ── Line items (hidden for mileage — auto-computed from distance) ── */}
          {!isMileage && (
            <Paper sx={{ p: 3 }}>
              <Stack
                direction='row'
                sx={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 2,
                }}
              >
                <Typography variant='h6'>{t('expenses.fields.lineItems')}</Typography>
                {editable && (
                  <Button
                    startIcon={<Icon icon='mdi:plus' />}
                    onClick={() =>
                      setForm((c) => ({
                        ...c,
                        lineItems: [
                          ...c.lineItems,
                          makeDefaultLineItem(defaultUnitForCategory(selectedCategory?.code)),
                        ],
                      }))
                    }
                  >
                    {t('expenses.actions.addLineItem')}
                  </Button>
                )}
              </Stack>
              <LineItemsTable
                items={form.lineItems}
                disabled={!editable}
                showErrors={Object.keys(fieldErrors).length > 0}
                expenseClaimItems={expenseClaimItems}
                costCentres={costCentres ?? []}
                isFuel={isFuel}
                onChange={(lineItems) => {
                  setForm((c) => ({ ...c, lineItems }))
                  const total = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0)
                  if (total > 0) setFieldErrors((e) => ({ ...e, lineItems: undefined }))
                }}
                claimCurrency={claimCurrency}
                claimFxRate={claimFxRate}
              />
              {!!fieldErrors.lineItems && (
                <Alert severity='error' sx={{ mt: 1 }}>
                  {fieldErrors.lineItems}
                </Alert>
              )}
              <Box sx={{ mt: 2, textAlign: 'right' }}>
                <Typography variant='h6'>
                  {t('expenses.fields.totalAmount')}: {formatExpenseAmount(totalAmount)}
                </Typography>
              </Box>
            </Paper>
          )}

          {/* ── Receipt / attachments (not applicable for mileage claims) ── */}
          {!isMileage && (
            <Paper sx={{ p: 3 }}>
              <Typography variant='h6' sx={{ mb: 2 }}>
                {t('expenses.fields.receipt')}
              </Typography>
              {receipt ? (
                <ReceiptUploadZone
                  receipt={receipt}
                  onUpload={handleUpload}
                  onDelete={editable ? deleteReceipt : undefined}
                  onOpen={openReceipt}
                  disabled={!editable}
                  error={uploadError}
                  requireSaveDraftFirst={!currentClaimId}
                />
              ) : (
                <AttachmentsUploadZone
                  attachments={attachments}
                  onUpload={handleAttachmentsUpload}
                  onDelete={editable ? deleteAttachment : undefined}
                  onPreview={previewMergedAttachments}
                  disabled={!editable}
                  error={uploadError}
                  requireSaveDraftFirst={!currentClaimId}
                />
              )}
            </Paper>
          )}

          {/* ── Actions ── */}
          <Stack
            direction='row'
            spacing={2}
            sx={{
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant='outlined'
              component={Link}
              to={claimId ? `/expenses/${claimId}` : '/expenses'}
            >
              {t('general.cancel')}
            </Button>
            {claimApi.data?.status === ExpenseClaimStatus.DRAFT && currentClaimId && (
              <Button
                variant='outlined'
                color='error'
                disabled={deleting}
                startIcon={<Icon icon='mdi:delete-outline' />}
                onClick={() => setDeleteDialogOpen(true)}
              >
                {t('expenses.actions.delete')}
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            <Button
              variant='outlined'
              disabled={!editable || mutation.isMutating}
              onClick={() => void saveClaim(false)}
            >
              {t('expenses.actions.saveDraft')}
            </Button>
            <Button
              variant='contained'
              disabled={!editable || mutation.isMutating}
              onClick={() => setSubmitDialogOpen(true)}
            >
              {claimApi.data?.status === ExpenseClaimStatus.PENDING_INFO
                ? t('expenses.actions.resubmit')
                : t('expenses.actions.submit')}
            </Button>
          </Stack>

          {/* ── Submit confirmation dialog ── */}
          <Dialog
            open={submitDialogOpen}
            onClose={() => setSubmitDialogOpen(false)}
            maxWidth='xs'
            fullWidth
          >
            <DialogTitle>{t('expenses.submitDialog.title')}</DialogTitle>
            <DialogContent>
              <DialogContentText>{t('expenses.submitDialog.body')}</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSubmitDialogOpen(false)} disabled={mutation.isMutating}>
                {t('general.cancel')}
              </Button>
              <Button
                color='primary'
                variant='contained'
                disabled={mutation.isMutating}
                onClick={() => {
                  setSubmitDialogOpen(false)
                  void saveClaim(true)
                }}
              >
                {t('expenses.submitDialog.confirm')}
              </Button>
            </DialogActions>
          </Dialog>

          {/* ── Delete confirmation dialog ── */}
          <Dialog
            open={deleteDialogOpen}
            onClose={() => setDeleteDialogOpen(false)}
            maxWidth='xs'
            fullWidth
          >
            <DialogTitle>{t('expenses.deleteDialog.title')}</DialogTitle>
            <DialogContent>
              <DialogContentText>{t('expenses.deleteDialog.body')}</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
                {t('general.cancel')}
              </Button>
              <Button
                color='error'
                variant='contained'
                disabled={deleting}
                onClick={() => void deleteClaim()}
              >
                {t('expenses.actions.delete')}
              </Button>
            </DialogActions>
          </Dialog>
        </Stack>
      </RemoteContent>
    </Box>
  )
}
