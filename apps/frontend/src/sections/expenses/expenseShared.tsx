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
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import type {
  ExpenseLineItem,
  ExpenseClaimReceipt,
  ExpenseClaimAttachment,
} from '@backend/routes/expenses/models'
import type { AirfieldListResponse } from '@backend/routes/flight-log/models'
import useApi from '../../hooks/useApi'

// ─── IBAN validation (MOD-97 algorithm) ──────────────────────────────────────

export function validateIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, '').toUpperCase()
  if (iban.length < 15 || iban.length > 34) return false
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  const numeric = rearranged
    .split('')
    .map((ch) => (ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch))
    .join('')
  let remainder = 0
  for (const ch of numeric) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97
  }
  return remainder === 1
}

// ─── HETU validation (Finnish personal identity code checksum) ────────────────

const HETU_CHECK_CHARACTERS = '0123456789ABCDEFHJKLMNPRSTUVWXY'
const HETU_CENTURY_BASE_YEAR: Record<string, number> = { '+': 1800, '-': 1900, A: 2000 }

export function validateHetu(raw: string): boolean {
  const hetu = raw.trim().toUpperCase()
  const match = /^(\d{2})(\d{2})(\d{2})([+\-A])(\d{3})([0-9A-Z])$/.exec(hetu)
  if (!match) return false
  const [, day, month, yearOfCentury, centurySign, individualNumber, checkChar] = match

  const centuryBase = HETU_CENTURY_BASE_YEAR[centurySign]
  const year = centuryBase + Number(yearOfCentury)
  const date = new Date(year, Number(month) - 1, Number(day))
  const isRealDate =
    date.getFullYear() === year &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
  if (!isRealDate) return false

  const digits = Number(`${day}${month}${yearOfCentury}${individualNumber}`)
  return HETU_CHECK_CHARACTERS[digits % 31] === checkChar
}

// ─── Unit defaults ────────────────────────────────────────────────────────────

export function defaultUnitForCategory(code: string | undefined): ExpenseLineItem['unit'] {
  switch (code) {
    case 'fuel':
      return 'l'
    case 'mileage':
      return 'km'
    default:
      return 'pcs'
  }
}

// ─── Editable line item type (date always a string, never null) ───────────────

export type EditableLineItem = Omit<ExpenseLineItem, 'date'> & {
  date: string
  costCentreCode?: string | null
  airport?: string | null
}

export const makeDefaultLineItem = (
  unit: EditableLineItem['unit'] = 'pcs',
  costCentreCode?: string,
): EditableLineItem => ({
  itemId: null,
  description: '',
  date: new Date().toISOString().substring(0, 10),
  quantity: 1,
  unit,
  unitPrice: 0,
  sortOrder: 0,
  costCentreCode: costCentreCode ?? null,
  airport: null,
  paidWithClubCard: false,
})

// ─── Item code → aircraft (cost centre) matching ───────────────────────────────

/**
 * Fuel invoice item codes end with the aircraft registration's last 3 letters
 * (e.g. an item code ending in "IHQ" is fuel for OH-IHQ). Cost centre codes are
 * the aircraft registrations themselves, so matching on that suffix lets us
 * pre-select the aircraft cost centre once a fuel item is chosen.
 */
export function matchAircraftCostCentre(
  itemCode: string,
  costCentres: { code: string; description: string }[],
): string | undefined {
  const suffix = itemCode.slice(-3).toUpperCase()
  if (suffix.length < 3) return undefined
  return costCentres.find((cc) => cc.code.slice(-3).toUpperCase() === suffix)?.code
}

/**
 * Whether an ICAO airport code lies outside Finland (issue #1020) — Finnish
 * aerodromes all use the EFxx prefix, so anything else counts as abroad.
 */
export function isAirportOutsideFinland(icao: string | null | undefined): boolean {
  return !!icao && !icao.toUpperCase().startsWith('EF')
}

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

  return (
    <Box sx={{ overflowX: 'auto', width: '100%' }}>
      <Table size='small'>
        <TableHead>
          <TableRow>
            <TableCell sx={{ minWidth: 200 }}>{t('expenses.wizard.col.description')}</TableCell>
            {isFuel && (
              <TableCell sx={{ minWidth: 140 }}>{t('expenses.wizard.col.date')}</TableCell>
            )}
            {isFuel && (
              <TableCell sx={{ minWidth: 200 }}>{t('expenses.wizard.col.airport')}</TableCell>
            )}
            <TableCell sx={{ minWidth: 90 }}>
              {isFuel ? t('expenses.wizard.col.litres') : t('expenses.wizard.col.qty')}
            </TableCell>
            <TableCell sx={{ minWidth: 120 }}>
              {isFuel ? (
                <Stack
                  direction='row'
                  spacing={0.5}
                  sx={{
                    alignItems: 'center',
                  }}
                >
                  <span>
                    {t('expenses.wizard.col.totalCost', { currency: claimCurrency ?? 'EUR' })}
                  </span>
                  <Tooltip
                    title={t('expenses.wizard.totalCostTooltip', {
                      currency: claimCurrency ?? 'EUR',
                    })}
                  >
                    <Icon icon='mdi:help-circle-outline' width={16} />
                  </Tooltip>
                </Stack>
              ) : (
                <Stack
                  direction='row'
                  spacing={0.5}
                  sx={{
                    alignItems: 'center',
                  }}
                >
                  <span>
                    {t('expenses.wizard.col.unitPrice', { currency: claimCurrency ?? 'EUR' })}
                  </span>
                  <Tooltip
                    title={t('expenses.wizard.unitPriceTooltip', {
                      currency: claimCurrency ?? 'EUR',
                    })}
                  >
                    <Icon icon='mdi:help-circle-outline' width={16} />
                  </Tooltip>
                </Stack>
              )}
            </TableCell>
            {expenseClaimItems && (
              <TableCell sx={{ minWidth: 180 }}>{t('expenses.wizard.col.itemId')}</TableCell>
            )}
            {costCentres && (
              <TableCell sx={{ minWidth: 130 }}>
                <Stack
                  direction='row'
                  spacing={0.5}
                  sx={{
                    alignItems: 'center',
                  }}
                >
                  <span>{t('expenses.wizard.col.costCentre')}</span>
                  <Tooltip title={t('expenses.wizard.aircraftSelectorTooltip')}>
                    <Icon icon='mdi:help-circle-outline' width={16} />
                  </Tooltip>
                </Stack>
              </TableCell>
            )}
            {isFuel && (
              <TableCell sx={{ minWidth: 90 }}>
                <Stack direction='row' spacing={0.5} sx={{ alignItems: 'center' }}>
                  <span>{t('expenses.wizard.col.paidWithClubCard')}</span>
                  <Tooltip title={t('expenses.wizard.paidWithClubCardTooltip')}>
                    <Icon icon='mdi:help-circle-outline' width={16} />
                  </Tooltip>
                </Stack>
              </TableCell>
            )}
            <TableCell align='right'>
              {isNonEur
                ? `${t('expenses.fields.totalAmount')} EUR`
                : t('expenses.fields.totalAmount')}
            </TableCell>
            {!disabled && allowRowRemoval && <TableCell sx={{ width: 40 }} />}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item, idx) => {
            const lineTotal = item.quantity * item.unitPrice
            const displayedTotalCost = item.totalCost ?? lineTotal
            const eurTotal = isNonEur
              ? claimFxRate != null
                ? displayedTotalCost * claimFxRate
                : null
              : displayedTotalCost

            return (
              <TableRow key={idx}>
                <TableCell sx={{ minWidth: 200, verticalAlign: 'top' }}>
                  <TextField
                    size='small'
                    fullWidth
                    multiline
                    minRows={4}
                    value={item.description}
                    disabled={disabled}
                    onChange={(e) => update(idx, { description: e.target.value })}
                    onBlur={() => touch(`${idx}-description`)}
                    error={shouldShow(`${idx}-description`) && !item.description.trim()}
                    helperText={
                      shouldShow(`${idx}-description`) && !item.description.trim()
                        ? t('expenses.validation.descriptionRequired')
                        : undefined
                    }
                  />
                </TableCell>
                {isFuel && (
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <TextField
                      size='small'
                      type='date'
                      value={item.date}
                      disabled={disabled}
                      onChange={(e) => update(idx, { date: e.target.value })}
                      onBlur={() => touch(`${idx}-date`)}
                      error={shouldShow(`${idx}-date`) && !item.date && !item.id}
                      helperText={
                        shouldShow(`${idx}-date`) && !item.date && !item.id
                          ? t('expenses.validation.fuelDateRequired')
                          : undefined
                      }
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ width: 150 }}
                    />
                  </TableCell>
                )}
                {isFuel && (
                  <TableCell sx={{ verticalAlign: 'top' }}>
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
                      sx={{ width: 200 }}
                    />
                  </TableCell>
                )}
                <TableCell sx={{ verticalAlign: 'top' }}>
                  <TextField
                    size='small'
                    type='number'
                    value={item.quantity}
                    disabled={disabled}
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
                    sx={{ width: 90 }}
                  />
                </TableCell>
                <TableCell sx={{ verticalAlign: 'top' }}>
                  {isFuel ? (
                    <TextField
                      size='small'
                      type='number'
                      value={displayedTotalCost || ''}
                      disabled={disabled}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        applyTotalCost(idx, Number(e.target.value) || 0, item.quantity)
                      }
                      onBlur={() => touch(`${idx}-unitPrice`)}
                      error={shouldShow(`${idx}-unitPrice`) && item.unitPrice <= 0}
                      helperText={
                        shouldShow(`${idx}-unitPrice`) && item.unitPrice <= 0
                          ? t('expenses.validation.unitPriceRequired')
                          : undefined
                      }
                      sx={{ width: 120 }}
                    />
                  ) : (
                    <TextField
                      size='small'
                      type='number'
                      value={item.unitPrice}
                      disabled={disabled}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => update(idx, { unitPrice: Number(e.target.value) || 0 })}
                      onBlur={() => touch(`${idx}-unitPrice`)}
                      error={shouldShow(`${idx}-unitPrice`) && item.unitPrice <= 0}
                      helperText={
                        shouldShow(`${idx}-unitPrice`) && item.unitPrice <= 0
                          ? t('expenses.validation.unitPriceRequired')
                          : undefined
                      }
                      sx={{ width: 120 }}
                    />
                  )}
                </TableCell>
                {expenseClaimItems && (
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <TextField
                      size='small'
                      select
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
                      sx={{ width: 180 }}
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
                  </TableCell>
                )}
                {costCentres && (
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <TextField
                      size='small'
                      select
                      required={isFuel}
                      value={item.costCentreCode ?? ''}
                      disabled={disabled}
                      onChange={(e) => update(idx, { costCentreCode: e.target.value || null })}
                      onBlur={() => touch(`${idx}-costCentreCode`)}
                      error={isFuel && shouldShow(`${idx}-costCentreCode`) && !item.costCentreCode}
                      helperText={
                        isFuel && shouldShow(`${idx}-costCentreCode`) && !item.costCentreCode
                          ? t('expenses.validation.aircraftRequired')
                          : undefined
                      }
                      sx={{ width: 130 }}
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
                  </TableCell>
                )}
                {isFuel && (
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <Checkbox
                      size='small'
                      checked={!!item.paidWithClubCard}
                      disabled={disabled}
                      onChange={(e) => update(idx, { paidWithClubCard: e.target.checked })}
                    />
                  </TableCell>
                )}
                <TableCell align='right' sx={{ verticalAlign: 'top' }}>
                  {eurTotal != null ? eurFormatter.format(eurTotal) : '—'}
                </TableCell>
                {!disabled && allowRowRemoval && (
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    {items.length > 1 && (
                      <IconButton
                        size='small'
                        color='error'
                        onClick={() => onChange(items.filter((_, i) => i !== idx))}
                      >
                        <Icon icon='mdi:delete-outline' />
                      </IconButton>
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
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
}

// Matches the backend's per-claim attachment limit (apps/backend/src/routes/expenses/api.ts).
const MAX_ATTACHMENTS_PER_CLAIM = 5
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
        <Alert severity='warning'>{t('expenses.wizard.receiptSkipWarning')}</Alert>
      )}
    </Stack>
  )
}
