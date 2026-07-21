/**
 * Shared components and utilities for expense claim forms (wizard + edit form).
 * Single source of truth for BankDetailsFields, LineItemsTable, ReceiptUploadZone.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
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
import type { ExpenseLineItem, ExpenseClaimReceipt } from '@backend/routes/expenses/models'

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
        InputProps={{
          endAdornment: ibanEntered ? (
            <InputAdornment position='end'>
              <Icon
                icon={ibanOk ? 'mdi:check-circle' : 'mdi:alert-circle'}
                color={ibanOk ? 'green' : 'red'}
                width={22}
              />
            </InputAdornment>
          ) : undefined,
        }}
      />

      <TextField
        label={t('expenses.fields.ibanAccountName')}
        value={ibanAccountName}
        disabled={disabled}
        onChange={(e) => onChange(iban, e.target.value)}
        inputProps={{ maxLength: 200 }}
        error={!!ibanAccountNameError}
        helperText={ibanAccountNameError}
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
}: LineItemsTableProps) {
  const { t } = useTranslation()
  const isNonEur = (claimCurrency ?? 'EUR') !== 'EUR'
  const [touched, setTouched] = useState<Set<string>>(new Set())
  // Total cost as typed by the member for fuel lines — kept separate from the
  // derived unitPrice so the field doesn't jump around while typing.
  const [rawTotals, setRawTotals] = useState<Record<number, number>>({})

  const touch = (key: string) => setTouched((prev) => new Set(prev).add(key))
  const shouldShow = (key: string) => showErrors || touched.has(key)

  const update = (idx: number, patch: Partial<EditableLineItem>) =>
    onChange(items.map((li, i) => (i === idx ? { ...li, ...patch } : li)))

  const applyTotalCost = (idx: number, totalCost: number, quantity: number) => {
    setRawTotals((prev) => ({ ...prev, [idx]: totalCost }))
    const unitPrice = quantity > 0 ? totalCost / quantity : 0
    update(idx, { unitPrice })
  }

  return (
    <Box sx={{ overflowX: 'auto', width: '100%' }}>
      <Table size='small'>
        <TableHead>
          <TableRow>
            <TableCell sx={{ minWidth: 200 }}>{t('expenses.wizard.col.description')}</TableCell>
            <TableCell sx={{ minWidth: 90 }}>
              {isFuel ? t('expenses.wizard.col.litres') : t('expenses.wizard.col.qty')}
            </TableCell>
            <TableCell sx={{ minWidth: 120 }}>
              {isFuel ? (
                <Stack direction='row' spacing={0.5} alignItems='center'>
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
                <Stack direction='row' spacing={0.5} alignItems='center'>
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
                <Stack direction='row' spacing={0.5} alignItems='center'>
                  <span>{t('expenses.wizard.col.costCentre')}</span>
                  <Tooltip title={t('expenses.wizard.aircraftSelectorTooltip')}>
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
            {!disabled && <TableCell sx={{ width: 40 }} />}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item, idx) => {
            const lineTotal = item.quantity * item.unitPrice
            const eurTotal = isNonEur
              ? claimFxRate != null
                ? lineTotal * claimFxRate
                : null
              : lineTotal
            const displayedTotalCost = rawTotals[idx] ?? lineTotal

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
                <TableCell align='right' sx={{ verticalAlign: 'top' }}>
                  {eurTotal != null ? eurFormatter.format(eurTotal) : '—'}
                </TableCell>
                {!disabled && (
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void onUpload(file)
  }

  return (
    <Stack spacing={2}>
      <Alert severity='info'>{t('expenses.wizard.receiptUploadInfo')}</Alert>

      {requireSaveDraftFirst && (
        <Alert severity='warning'>{t('expenses.wizard.saveDraftBeforeReceipt')}</Alert>
      )}

      {receipt ? (
        <Paper variant='outlined' sx={{ p: 2 }}>
          <Stack direction='row' justifyContent='space-between' alignItems='center'>
            <Box>
              <Typography variant='body2'>{receipt.fileName}</Typography>
              <Typography variant='caption' color='text.secondary'>
                {Math.round(receipt.fileSize / 1024)} kB
              </Typography>
            </Box>
            <Stack direction='row' spacing={1} alignItems='center'>
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
            <Typography variant='caption' color='text.secondary'>
              {t('expenses.wizard.receiptFileTypes')}
            </Typography>
            <input
              type='file'
              hidden
              accept='image/*,application/pdf'
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onUpload(file)
                e.target.value = ''
              }}
            />
          </Paper>
        )
      )}

      {!!error && <Alert severity='error'>{error}</Alert>}
      {!receipt && !requireSaveDraftFirst && (
        <Alert severity='warning'>{t('expenses.wizard.receiptSkipWarning')}</Alert>
      )}
    </Stack>
  )
}
