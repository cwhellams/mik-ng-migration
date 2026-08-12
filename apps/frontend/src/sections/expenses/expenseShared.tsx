/**
 * Shared components and utilities for expense claim forms (wizard + edit form).
 * Single source of truth for BankDetailsFields, LineItemsTable, ReceiptUploadZone.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import type { ExpenseClaimReceipt, ExpenseClaimAttachment } from '@mik/contracts/expenses'
import type { AirfieldListResponse } from '@mik/contracts/flight-log'
import useApi from '../../hooks/useApi'
import { matchAircraftCostCentre, type EditableLineItem } from './expenseHelpers'
import { validateIban } from './validation'

// ─── EUR formatter ────────────────────────────────────────────────────────────

export const eurFormatter = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' })

// ─── BankDetailsFields ────────────────────────────────────────────────────────

interface BankDetailsFieldsProps {
  iban: string
  ibanAccountName: string
  onChange: (iban: string, ibanAccountName: string) => void
  disabled?: boolean
  /** Show a success badge when IBAN was pre-filled from member profile */
  ibanFromProfile?: boolean
  /** Field-level error (e.g. "IBAN is required") — shown even when the field is empty */
  ibanError?: string
  /** Field-level error for the account holder name field */
  ibanAccountNameError?: string
}

export function BankDetailsFields({
  iban,
  ibanAccountName,
  onChange,
  disabled,
  ibanFromProfile,
  ibanError,
  ibanAccountNameError,
}: BankDetailsFieldsProps) {
  const { t } = useTranslation()
  const ibanEntered = iban.trim().length > 0
  const ibanOk = ibanEntered ? validateIban(iban) : true
  const showError = !!ibanError || (ibanEntered && !ibanOk)
  const helperMsg =
    ibanError ??
    (ibanEntered && !ibanOk ? t('expenses.wizard.ibanInvalid') : t('expenses.fields.ibanHelper'))

  return (
    <Stack spacing={2}>
      {ibanFromProfile && (
        <Alert severity='success' icon={<Icon icon='mdi:check-circle-outline' />}>
          {t('expenses.wizard.ibanFromProfile')}
        </Alert>
      )}
      <TextField
        label={t('expenses.fields.iban')}
        value={iban}
        disabled={disabled}
        required
        placeholder='FI12 3456 7890 1234 56'
        onChange={(e) =>
          onChange(e.target.value.replace(/\s+/g, '').toUpperCase(), ibanAccountName)
        }
        error={showError}
        helperText={helperMsg}
        slotProps={{
          input: {
            endAdornment: ibanEntered ? (
              <InputAdornment position='end'>
                <Icon
                  icon={ibanOk ? 'mdi:check-circle' : 'mdi:alert-circle'}
                  color={ibanOk ? 'green' : 'red'}
                  width={22}
                />
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
      <TextField
        label={t('expenses.fields.ibanAccountName')}
        value={ibanAccountName}
        disabled={disabled}
        required
        onChange={(e) => onChange(iban, e.target.value)}
        error={!!ibanAccountNameError}
        helperText={ibanAccountNameError}
        slotProps={{
          htmlInput: { maxLength: 200 },
        }}
      />
    </Stack>
  )
}

// ─── LineItemsTable ───────────────────────────────────────────────────────────

interface LineItemsTableProps {
  items: EditableLineItem[]
  onChange: (items: EditableLineItem[]) => void
  disabled?: boolean
  claimCurrency?: string
  claimFxRate?: number | null
  expenseClaimItems?: Array<{ id: number; code: string; name: string }>
  /** When true, show validation errors on all fields immediately (e.g. after a failed save attempt) */
  showErrors?: boolean
  /** Available cost centre codes for the dropdown */
  costCentres?: { code: string; description: string }[]
  /** Fuel claims: ask for litres of uplift + total cost paid (capped at the EFNU price) instead of a per-unit price */
  isFuel?: boolean
  /** Set false to hide the delete-row control even when not disabled — e.g. the
   * treasurer's restricted edit dialog can correct existing rows but not add/remove
   * them (issue #1028). Defaults to true. */
  allowRowRemoval?: boolean
}

export function LineItemsTable({
  items,
  onChange,
  disabled,
  claimCurrency,
  claimFxRate,
  expenseClaimItems,
  showErrors,
  costCentres,
  isFuel,
  allowRowRemoval = true,
}: LineItemsTableProps) {
  const { t } = useTranslation()
  const isNonEur = (claimCurrency ?? 'EUR') !== 'EUR'
  const [touched, setTouched] = useState<Set<string>>(new Set())

  const { data: airfieldData } = useApi<AirfieldListResponse>(
    { url: 'v1/flight-logs/airfields', skipFetch: !isFuel },
    { revalidateIfStale: false, revalidateOnFocus: false, revalidateOnReconnect: false },
  )
  const airfields = airfieldData?.airfields ?? []

  const touch = (key: string) => setTouched((prev) => new Set(prev).add(key))
  const shouldShow = (key: string) => showErrors || touched.has(key)

  const update = (idx: number, patch: Partial<EditableLineItem>) =>
    onChange(items.map((li, i) => (i === idx ? { ...li, ...patch } : li)))

  // The total cost is persisted alongside the derived unitPrice (issue #1024) so it
  // round-trips exactly on reload instead of being reconstructed as quantity * unitPrice,
  // which drifts once unitPrice is rounded to its stored precision.
  const applyTotalCost = (idx: number, totalCost: number, quantity: number) => {
    const unitPrice = quantity > 0 ? totalCost / quantity : 0
    update(idx, { totalCost, unitPrice })
  }

  // Grand total across every item (issue #1037) — mirrors the per-item EUR
  // conversion below so it's unavailable (rather than silently wrong) until an
  // FX rate is known for non-EUR claims.
  const grandTotal: number | null =
    isNonEur && claimFxRate == null
      ? null
      : items.reduce((sum, item) => {
          const itemTotal = item.totalCost ?? item.quantity * item.unitPrice
          return sum + (isNonEur ? itemTotal * (claimFxRate as number) : itemTotal)
        }, 0)

  return (
    <Stack spacing={2}>
      {items.map((item, idx) => {
        const lineTotal = item.quantity * item.unitPrice
        const displayedTotalCost = item.totalCost ?? lineTotal
        const eurTotal = isNonEur
          ? claimFxRate != null
            ? displayedTotalCost * claimFxRate
            : null
          : displayedTotalCost

        return (
          <Paper key={idx} variant='outlined' sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Stack direction='row' spacing={1} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  size='small'
                  fullWidth
                  multiline
                  minRows={2}
                  label={t('expenses.wizard.col.description')}
                  value={item.description}
                  disabled={disabled}
                  required
                  onChange={(e) => update(idx, { description: e.target.value })}
                  onBlur={() => touch(`${idx}-description`)}
                  error={shouldShow(`${idx}-description`) && !item.description.trim()}
                  helperText={
                    shouldShow(`${idx}-description`) && !item.description.trim()
                      ? t('expenses.validation.descriptionRequired')
                      : undefined
                  }
                />
                {!disabled && allowRowRemoval && items.length > 1 && (
                  <IconButton
                    size='small'
                    color='error'
                    onClick={() => onChange(items.filter((_, i) => i !== idx))}
                  >
                    <Icon icon='mdi:delete-outline' />
                  </IconButton>
                )}
              </Stack>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(160px, 1fr))' },
                  gap: 2,
                }}
              >
                {isFuel && (
                  <TextField
                    size='small'
                    type='date'
                    label={t('expenses.wizard.col.date')}
                    value={item.date}
                    disabled={disabled}
                    required
                    onChange={(e) => update(idx, { date: e.target.value })}
                    onBlur={() => touch(`${idx}-date`)}
                    error={shouldShow(`${idx}-date`) && !item.date && !item.id}
                    helperText={
                      shouldShow(`${idx}-date`) && !item.date && !item.id
                        ? t('expenses.validation.fuelDateRequired')
                        : undefined
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                )}
                {isFuel && (
                  <Autocomplete
                    size='small'
                    options={airfields}
                    disabled={disabled}
                    value={airfields.find((af) => af.ident === item.airport) ?? null}
                    getOptionLabel={(option) => `${option.ident}: ${option.name}`}
                    onChange={(_e, value) => update(idx, { airport: value?.ident ?? null })}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={t('expenses.wizard.col.airport')}
                        required
                        placeholder='ICAO'
                        onBlur={() => touch(`${idx}-airport`)}
                        error={shouldShow(`${idx}-airport`) && !item.airport && !item.id}
                        helperText={
                          shouldShow(`${idx}-airport`) && !item.airport && !item.id
                            ? t('expenses.validation.airportRequired')
                            : undefined
                        }
                      />
                    )}
                  />
                )}
                <TextField
                  size='small'
                  type='number'
                  label={isFuel ? t('expenses.wizard.col.litres') : t('expenses.wizard.col.qty')}
                  value={item.quantity || ''}
                  disabled={disabled}
                  required
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const quantity = Number(e.target.value) || 0
                    if (isFuel) {
                      update(idx, {
                        quantity,
                        totalCost: displayedTotalCost,
                        unitPrice: quantity > 0 ? displayedTotalCost / quantity : 0,
                      })
                    } else {
                      update(idx, { quantity })
                    }
                  }}
                  onBlur={() => touch(`${idx}-quantity`)}
                  error={shouldShow(`${idx}-quantity`) && item.quantity < 1}
                  helperText={
                    shouldShow(`${idx}-quantity`) && item.quantity < 1
                      ? t('expenses.validation.quantityMin')
                      : undefined
                  }
                />
                {isFuel ? (
                  <TextField
                    size='small'
                    type='number'
                    label={t('expenses.wizard.col.totalCost', {
                      currency: claimCurrency ?? 'EUR',
                    })}
                    value={displayedTotalCost || ''}
                    disabled={disabled}
                    required
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      applyTotalCost(idx, Number(e.target.value) || 0, item.quantity)
                    }
                    onBlur={() => touch(`${idx}-unitPrice`)}
                    error={shouldShow(`${idx}-unitPrice`) && item.unitPrice <= 0}
                    helperText={
                      shouldShow(`${idx}-unitPrice`) && item.unitPrice <= 0
                        ? t('expenses.validation.unitPriceRequired')
                        : t('expenses.wizard.totalCostTooltip', {
                            currency: claimCurrency ?? 'EUR',
                          })
                    }
                  />
                ) : (
                  <TextField
                    size='small'
                    type='number'
                    label={t('expenses.wizard.col.unitPrice', {
                      currency: claimCurrency ?? 'EUR',
                    })}
                    value={item.unitPrice || ''}
                    disabled={disabled}
                    required
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => update(idx, { unitPrice: Number(e.target.value) || 0 })}
                    onBlur={() => touch(`${idx}-unitPrice`)}
                    error={shouldShow(`${idx}-unitPrice`) && item.unitPrice <= 0}
                    helperText={
                      shouldShow(`${idx}-unitPrice`) && item.unitPrice <= 0
                        ? t('expenses.validation.unitPriceRequired')
                        : t('expenses.wizard.unitPriceTooltip', {
                            currency: claimCurrency ?? 'EUR',
                          })
                    }
                  />
                )}
                {expenseClaimItems && (
                  <TextField
                    size='small'
                    select
                    label={t('expenses.wizard.col.itemId')}
                    value={item.itemId ?? ''}
                    disabled={disabled}
                    onChange={(e) => {
                      const itemId = e.target.value === '' ? null : Number(e.target.value)
                      const patch: Partial<EditableLineItem> = { itemId }
                      if (isFuel && itemId != null && costCentres?.length) {
                        const selected = expenseClaimItems?.find((i) => i.id === itemId)
                        const matched =
                          selected && matchAircraftCostCentre(selected.code, costCentres)
                        if (matched) patch.costCentreCode = matched
                      }
                      update(idx, patch)
                    }}
                  >
                    <MenuItem value=''>
                      <em>—</em>
                    </MenuItem>
                    {expenseClaimItems.map((invoiceItem) => (
                      <MenuItem key={invoiceItem.id} value={invoiceItem.id}>
                        {invoiceItem.id} — {invoiceItem.code} ({invoiceItem.name})
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                {costCentres && (
                  <TextField
                    size='small'
                    select
                    required={isFuel}
                    label={t('expenses.wizard.col.costCentre')}
                    value={item.costCentreCode ?? ''}
                    disabled={disabled}
                    onChange={(e) => update(idx, { costCentreCode: e.target.value || null })}
                    onBlur={() => touch(`${idx}-costCentreCode`)}
                    error={isFuel && shouldShow(`${idx}-costCentreCode`) && !item.costCentreCode}
                    helperText={
                      isFuel && shouldShow(`${idx}-costCentreCode`) && !item.costCentreCode
                        ? t('expenses.validation.aircraftRequired')
                        : t('expenses.wizard.aircraftSelectorTooltip')
                    }
                  >
                    {!isFuel && (
                      <MenuItem value=''>
                        <em>—</em>
                      </MenuItem>
                    )}
                    {costCentres.map((cc) => (
                      <MenuItem key={cc.code} value={cc.code}>
                        {cc.code}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                {isFuel && (
                  <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size='small'
                          checked={!!item.paidWithClubCard}
                          disabled={disabled}
                          onChange={(e) => update(idx, { paidWithClubCard: e.target.checked })}
                        />
                      }
                      label={t('expenses.wizard.col.paidWithClubCard')}
                    />
                    <FormHelperText sx={{ mt: -0.5 }}>
                      {t('expenses.wizard.paidWithClubCardTooltip')}
                    </FormHelperText>
                  </Box>
                )}
              </Box>

              <Typography variant='body2' sx={{ textAlign: 'right', color: 'text.secondary' }}>
                {isNonEur
                  ? `${t('expenses.fields.totalAmount')} EUR`
                  : t('expenses.fields.totalAmount')}
                : {eurTotal != null ? eurFormatter.format(eurTotal) : '—'}
              </Typography>
            </Stack>
          </Paper>
        )
      })}
      <Divider />
      <Typography variant='subtitle1' sx={{ textAlign: 'right' }}>
        {isNonEur ? `${t('expenses.fields.totalAmount')} EUR` : t('expenses.fields.totalAmount')}:{' '}
        {grandTotal != null ? eurFormatter.format(grandTotal) : '—'}
      </Typography>
    </Stack>
  )
}

// ─── ReceiptUploadZone ────────────────────────────────────────────────────────

interface ReceiptUploadZoneProps {
  receipt?: ExpenseClaimReceipt
  onUpload: (file: File) => Promise<void>
  onDelete?: () => Promise<void>
  onOpen?: () => Promise<void>
  disabled?: boolean
  error?: string
  /** Show a "save draft first" note instead of the upload area */
  requireSaveDraftFirst?: boolean
}

// Matches the backend's raw upload ceiling (apps/backend/src/util/imageUpload.ts) — the
// server compresses images down after upload, so this is a sanity ceiling on the
// original file, not the effective size limit (issue #1075).
const MAX_RECEIPT_UPLOAD_BYTES = 40 * 1024 * 1024

export function ReceiptUploadZone({
  receipt,
  onUpload,
  onDelete,
  onOpen,
  disabled,
  error,
  requireSaveDraftFirst,
}: ReceiptUploadZoneProps) {
  const { t } = useTranslation()
  const [dragActive, setDragActive] = useState(false)
  const [sizeError, setSizeError] = useState<string>()

  const trySelectFile = (file: File) => {
    if (file.size > MAX_RECEIPT_UPLOAD_BYTES) {
      setSizeError(t('expenses.wizard.receiptTooLarge', { maxSize: '40 MB' }))
      return
    }
    setSizeError(undefined)
    void onUpload(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) trySelectFile(file)
  }

  return (
    <Stack spacing={2}>
      <Alert severity='info'>{t('expenses.wizard.receiptUploadInfo')}</Alert>
      {requireSaveDraftFirst && (
        <Alert severity='warning'>{t('expenses.wizard.saveDraftBeforeReceipt')}</Alert>
      )}
      {receipt ? (
        <Paper variant='outlined' sx={{ p: 2 }}>
          <Stack
            direction='row'
            sx={{
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Box>
              <Typography variant='body2'>{receipt.fileName}</Typography>
              <Typography
                variant='caption'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {Math.round(receipt.fileSize / 1024)} kB
              </Typography>
            </Box>
            <Stack
              direction='row'
              spacing={1}
              sx={{
                alignItems: 'center',
              }}
            >
              {onOpen && (
                <Button size='small' onClick={() => void onOpen()}>
                  Open
                </Button>
              )}
              {onDelete && !disabled && (
                <IconButton size='small' color='error' onClick={() => void onDelete()}>
                  <Icon icon='mdi:delete-outline' />
                </IconButton>
              )}
            </Stack>
          </Stack>
        </Paper>
      ) : (
        !disabled &&
        !requireSaveDraftFirst && (
          <Paper
            variant='outlined'
            component='label'
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragActive(true)
            }}
            onDragEnter={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragActive(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragActive(false)
            }}
            onDrop={handleDrop}
            sx={{
              p: 4,
              textAlign: 'center',
              border: '2px dashed',
              borderColor: dragActive ? 'primary.main' : 'divider',
              bgcolor: dragActive ? 'action.hover' : 'transparent',
              cursor: 'pointer',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
            }}
          >
            <Icon icon='mdi:upload' width={40} />
            <Typography variant='body1' sx={{ mt: 1 }}>
              {t('expenses.wizard.dropOrClick')}
            </Typography>
            <Typography
              variant='caption'
              sx={{
                color: 'text.secondary',
              }}
            >
              {t('expenses.wizard.receiptFileTypes')}
            </Typography>
            <input
              type='file'
              hidden
              accept='image/*,application/pdf'
              capture='environment'
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) trySelectFile(file)
                e.target.value = ''
              }}
            />
          </Paper>
        )
      )}
      {!!sizeError && <Alert severity='error'>{sizeError}</Alert>}
      {!!error && <Alert severity='error'>{error}</Alert>}
      {!receipt && !requireSaveDraftFirst && (
        <Alert severity='warning'>{t('expenses.wizard.receiptSkipWarning')}</Alert>
      )}
    </Stack>
  )
}

// ─── AttachmentsUploadZone ──────────────────────────────────────────────────────
// Newer multi-file replacement for ReceiptUploadZone (issue #955) — up to
// MAX_ATTACHMENTS_PER_CLAIM files are merged server-side into a single PDF for
// SimplBooks (which only accepts one attachment per purchase). Existing claims
// created before this feature keep showing the old singular ReceiptUploadZone.

interface AttachmentsUploadZoneProps {
  attachments?: ExpenseClaimAttachment[]
  onUpload: (files: File[]) => Promise<void>
  onDelete?: (attachmentId: number) => Promise<void>
  onPreview?: () => Promise<void>
  disabled?: boolean
  error?: string
  /** Show a "save draft first" note instead of the upload area */
  requireSaveDraftFirst?: boolean
  /** Mileage claims have nothing to attach; every other category does (issue: silent
   * submit-time rejection was confusing) — when true, the empty state is shown as a
   * blocking requirement instead of a skippable suggestion. */
  required?: boolean
}

// Matches the backend's per-claim attachment limit (apps/backend/src/routes/expenses/api.ts).
const MAX_ATTACHMENTS_PER_CLAIM = 10
// Matches the backend's raw upload ceiling — see ReceiptUploadZone's MAX_RECEIPT_UPLOAD_BYTES.
const MAX_ATTACHMENT_UPLOAD_BYTES = 40 * 1024 * 1024

export function AttachmentsUploadZone({
  attachments,
  onUpload,
  onDelete,
  onPreview,
  disabled,
  error,
  requireSaveDraftFirst,
  required,
}: AttachmentsUploadZoneProps) {
  const { t } = useTranslation()
  const [dragActive, setDragActive] = useState(false)
  const [sizeError, setSizeError] = useState<string>()

  const remainingSlots = MAX_ATTACHMENTS_PER_CLAIM - (attachments?.length ?? 0)

  const trySelectFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (!files.length) return
    if (files.length > remainingSlots) {
      setSizeError(t('expenses.wizard.tooManyAttachments', { max: MAX_ATTACHMENTS_PER_CLAIM }))
      return
    }
    if (files.some((file) => file.size > MAX_ATTACHMENT_UPLOAD_BYTES)) {
      setSizeError(t('expenses.wizard.receiptTooLarge', { maxSize: '40 MB' }))
      return
    }
    setSizeError(undefined)
    void onUpload(files)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.length) trySelectFiles(e.dataTransfer.files)
  }

  return (
    <Stack spacing={2}>
      <Alert severity='info'>{t('expenses.wizard.attachmentsUploadInfo')}</Alert>
      {requireSaveDraftFirst && (
        <Alert severity='warning'>{t('expenses.wizard.saveDraftBeforeReceipt')}</Alert>
      )}
      {!!attachments?.length && (
        <Stack spacing={1}>
          {attachments.map((attachment) => (
            <Paper key={attachment.id} variant='outlined' sx={{ p: 2 }}>
              <Stack
                direction='row'
                sx={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant='body2'>{attachment.fileName}</Typography>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {Math.round(attachment.fileSize / 1024)} kB
                  </Typography>
                </Box>
                {onDelete && !disabled && (
                  <IconButton
                    size='small'
                    color='error'
                    onClick={() => void onDelete(attachment.id)}
                  >
                    <Icon icon='mdi:delete-outline' />
                  </IconButton>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
      {!disabled && !requireSaveDraftFirst && remainingSlots > 0 && (
        <Paper
          variant='outlined'
          component='label'
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragActive(true)
          }}
          onDragEnter={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragActive(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragActive(false)
          }}
          onDrop={handleDrop}
          sx={{
            p: 4,
            textAlign: 'center',
            border: '2px dashed',
            borderColor: dragActive ? 'primary.main' : 'divider',
            bgcolor: dragActive ? 'action.hover' : 'transparent',
            cursor: 'pointer',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
          }}
        >
          <Icon icon='mdi:upload' width={40} />
          <Typography variant='body1' sx={{ mt: 1 }}>
            {t('expenses.wizard.dropOrClick')}
          </Typography>
          <Typography
            variant='caption'
            sx={{
              color: 'text.secondary',
            }}
          >
            {t('expenses.wizard.receiptFileTypes')}
          </Typography>
          <input
            type='file'
            hidden
            multiple
            accept='image/*,application/pdf'
            capture='environment'
            onChange={(e) => {
              if (e.target.files?.length) trySelectFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </Paper>
      )}
      {!!sizeError && <Alert severity='error'>{sizeError}</Alert>}
      {!!error && <Alert severity='error'>{error}</Alert>}
      {!!attachments?.length && onPreview && (
        <Button
          variant='outlined'
          startIcon={<Icon icon='mdi:file-pdf-box' />}
          onClick={() => void onPreview()}
        >
          {t('expenses.wizard.previewMergedPdf')}
        </Button>
      )}
      {!attachments?.length && !requireSaveDraftFirst && (
        <Alert severity={required ? 'error' : 'warning'}>
          {required
            ? t('expenses.wizard.receiptRequiredWarning')
            : t('expenses.wizard.receiptSkipWarning')}
        </Alert>
      )}
    </Stack>
  )
}
