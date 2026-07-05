import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import type { AircraftListResponse } from '@backend/routes/aircrafts/models'
import type { ItemListResponse } from '@backend/routes/invoicing/models'
import {
  MIK_SUPPORTED_CURRENCIES,
  type CreateExpenseClaim,
  type ExpenseCategory,
  type ExpenseClaim,
  type ExpenseClaimReceipt,
  ExpenseClaimStatus,
} from '@backend/routes/expenses/models'
import useApi from '../../hooks/useApi'
import { sharedApi } from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import { formatExpenseAmount, getExpenseCategoryLabel, isExpenseEditable } from './expenseUi'
import {
  BankDetailsFields,
  type EditableLineItem,
  LineItemsTable,
  ReceiptUploadZone,
  defaultUnitForCategory,
  makeDefaultLineItem,
} from './expenseShared'
import {
  MileageDetailFields,
  type MileageDetailForm,
  makeMileageDetailForm,
} from './MileageDetailFields'

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
  const [submitError, setSubmitError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<{
    iban?: string
    ibanAccountName?: string
    expenseDate?: string
    lineItems?: string
  }>({})
  const [uploadError, setUploadError] = useState<string>()
  const [infoMessage, setInfoMessage] = useState<string>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [mileageDetail, setMileageDetail] = useState<MileageDetailForm>(makeMileageDetailForm())
  const [fxRateLoading, setFxRateLoading] = useState(false)

  const categoryApi = useApi<ExpenseCategory[]>({ url: 'v1/expenses/categories' })
  const aircraftApi = useApi<AircraftListResponse>({
    url: 'v1/aircrafts',
    params: { activeOnly: true },
  })
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
      fuelLitres: claimApi.data.fuelLitres ?? undefined,
      fuelType: (claimApi.data.fuelType as CreateExpenseClaim['fuelType']) ?? undefined,
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
        vatPercent: item.vatPercent,
        sortOrder: item.sortOrder,
        costCentreCode: item.costCentreCode ?? null,
      })) ?? [makeDefaultLineItem()],
    })
    setClaimCurrency(claimApi.data.currency ?? 'EUR')
    setClaimFxRate(claimApi.data.fxRate ?? null)
    setReceipt(claimApi.data.receipt)
    if (claimApi.data.mileageDetail) {
      const md = claimApi.data.mileageDetail
      setMileageDetail({
        route: md.route ?? '',
        journeyDate: md.journeyDate ?? new Date().toISOString().substring(0, 10),
        distanceKm: String(md.distanceKm),
        passengers: md.passengers ?? [],
        hetu: '', // never pre-fill HETU from API (returned masked)
        boardApproved: md.boardApproved ?? false,
      })
    }
  }, [claimApi.data])

  const categories = categoryApi.data ?? []
  const selectedCategory = useMemo(
    () => categories.find((cat) => cat.id === form.categoryId),
    [categories, form.categoryId],
  )
  const isMileage = selectedCategory?.code === 'mileage'
  const expenseClaimItems = useMemo(
    () =>
      (invoiceItemsData?.items ?? [])
        .filter((item) => item.expense_claim_item)
        .map((item) => ({ id: item.id, code: item.code, name: item.name })),
    [invoiceItemsData?.items],
  )

  const editable = !claimApi.data || isExpenseEditable(claimApi.data.status)
  const currentClaimId = claimApi.data?.id ?? claimId
  const isClaimNonEur = claimCurrency !== 'EUR'
  const totalAmount = form.lineItems.reduce(
    (sum, item) =>
      sum +
      item.quantity *
        item.unitPrice *
        (isClaimNonEur ? (claimFxRate ?? 1) : 1) *
        (1 + item.vatPercent / 100),
    0,
  )

  // Auto-compute the mileage line item whenever distance or effective rate changes
  useEffect(() => {
    if (!isMileage || !mileageAllowance?.effectiveRatePerKm) return
    const km = Number(mileageDetail.distanceKm) || 0
    const rate = mileageAllowance.effectiveRatePerKm
    setForm((f) => ({
      ...f,
      lineItems: [
        {
          ...f.lineItems[0],
          description: mileageDetail.route.trim() || t('expenses.mileage.lineItemDescription'),
          quantity: km,
          unit: 'km',
          unitPrice: rate,
          currency: 'EUR',
          fxRate: null,
        },
      ],
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMileage,
    mileageDetail.distanceKm,
    mileageDetail.route,
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
    } = {}
    const lineTotal = form.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    if (lineTotal <= 0) errors.lineItems = t('expenses.messages.zeroTotal')
    if (!form.iban.trim()) errors.iban = t('expenses.messages.ibanRequired')
    if (!form.ibanAccountName.trim())
      errors.ibanAccountName = t('expenses.messages.ibanAccountNameRequired')
    if (!form.expenseDate) errors.expenseDate = t('expenses.messages.expenseDateRequired')

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
      fuelLitres: form.fuelLitres || undefined,
      fuelType: form.fuelType || undefined,
      iban: form.iban || undefined,
      ibanAccountName: form.ibanAccountName || undefined,
      currency: claimCurrency as CreateExpenseClaim['currency'],
      fxRate: claimCurrency !== 'EUR' ? claimFxRate : null,
      lineItems: form.lineItems.map((item, index) => ({
        ...item,
        sortOrder: index,
      })),
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
    const maxBytes = file.type === 'application/pdf' ? 5 * 1024 * 1024 : 1 * 1024 * 1024
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Box>
      <Title label={claimId ? form.title || t('expenses.title') : t('expenses.new')} />
      <RemoteContent
        isLoading={categoryApi.isLoading || aircraftApi.isLoading || claimApi.isLoading}
        error={categoryApi.error ?? aircraftApi.error ?? claimApi.error}
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
                select
                label={t('expenses.fields.aircraft')}
                value={form.aircraftId ?? ''}
                disabled={!editable}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    aircraftId: event.target.value || undefined,
                  }))
                }
              >
                {!selectedCategory?.requiresAircraft && <MenuItem value=''>N/A</MenuItem>}
                {aircraftApi.data?.aircrafts.map((aircraft) => (
                  <MenuItem key={aircraft.registration} value={aircraft.registration}>
                    {aircraft.registration} – {aircraft.displayName}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label={t('expenses.fields.title')}
                value={form.title}
                disabled={!editable}
                fullWidth
                inputProps={{ maxLength: 200 }}
                onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
              />

              <TextField
                label={t('expenses.fields.description')}
                multiline
                minRows={4}
                value={form.description ?? ''}
                disabled={!editable}
                fullWidth
                inputProps={{ maxLength: 2000 }}
                onChange={(e) =>
                  setForm((c) => ({ ...c, description: e.target.value || undefined }))
                }
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

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems='flex-start'>
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
                          : t('expenses.fields.fxRateHelper')
                    }
                    sx={{ minWidth: 200 }}
                  />
                )}
              </Stack>

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

              {selectedCategory?.code === 'fuel' && (
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    label={t('expenses.fields.fuelLitres')}
                    type='number'
                    value={form.fuelLitres ?? ''}
                    disabled={!editable}
                    onChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        fuelLitres: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                  />
                  <TextField
                    select
                    label={t('expenses.fields.fuelType')}
                    value={form.fuelType ?? ''}
                    disabled={!editable}
                    sx={{ minWidth: 140 }}
                    onChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        fuelType: (e.target.value as CreateExpenseClaim['fuelType']) || undefined,
                      }))
                    }
                  >
                    {['98', '100LL', 'JetA1'].map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              )}
            </Stack>
          </Paper>

          {/* ── Mileage detail (only for mileage claims) ── */}
          {isMileage && (
            <Paper sx={{ p: 3 }}>
              <MileageDetailFields
                value={mileageDetail}
                onChange={setMileageDetail}
                disabled={!editable}
                effectiveRatePerKm={mileageAllowance?.effectiveRatePerKm}
                maxKm={Number(import.meta.env.VITE_MILEAGE_MAX_KM) || 100}
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
                justifyContent='space-between'
                alignItems='center'
                sx={{ mb: 2 }}
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

          {/* ── Receipt (not applicable for mileage claims) ── */}
          {!isMileage && (
            <Paper sx={{ p: 3 }}>
              <Typography variant='h6' sx={{ mb: 2 }}>
                {t('expenses.fields.receipt')}
              </Typography>
              <ReceiptUploadZone
                receipt={receipt}
                onUpload={handleUpload}
                onDelete={editable ? deleteReceipt : undefined}
                onOpen={openReceipt}
                disabled={!editable}
                error={uploadError}
                requireSaveDraftFirst={!currentClaimId}
              />
            </Paper>
          )}

          {/* ── Actions ── */}
          <Stack direction='row' spacing={2} flexWrap='wrap'>
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
