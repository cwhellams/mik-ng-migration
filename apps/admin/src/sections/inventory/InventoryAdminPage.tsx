import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import { useSnackbar } from '@mik/ui/hooks/useSnackbar'
import { RemoteContent } from '@mik/ui/components/RemoteContent'

import { InventoryItemHistory } from './InventoryItemHistory'
import { LocalisedTextField, withLocalisedField } from '@mik/ui/components/LocalisedTextField'
import {
  ItemConditionEnum,
  type ItemCondition,
  type InventoryItem,
  type InventoryCategory,
  type InventoryLocation,
} from '@mik/contracts/inventory'
import {
  ItemUnitStatusEnum,
  type ItemUnit,
  type ItemUnitListResponse,
  type ItemUnitStatus,
} from '@mik/contracts/inventory-units'
import { absolute, endpoints } from '../../api/endpoints'
import { localText as localName, resolveLanguage } from '@mik/ui/utils/localisedText'

// ── Localized CRUD tab (shared by Categories & Locations) ───────────────────────

interface LocalizedFormState {
  nameEn: string
  nameFi: string
  nameSv: string
  descEn: string
  descFi: string
  descSv: string
}

const emptyLocalizedForm: LocalizedFormState = {
  nameEn: '',
  nameFi: '',
  nameSv: '',
  descEn: '',
  descFi: '',
  descSv: '',
}

function toLocalizedPayload(f: LocalizedFormState) {
  return {
    name: { en: f.nameEn, fi: f.nameFi, sv: f.nameSv },
    description: { en: f.descEn, fi: f.descFi, sv: f.descSv },
  }
}

interface LocalizedEntity {
  name: unknown
  description?: unknown
  isActive: boolean
}

function entityToForm(e: LocalizedEntity): LocalizedFormState {
  const n = e.name as Record<string, string>
  const d = e.description as Record<string, string> | undefined
  return {
    nameEn: n?.en ?? '',
    nameFi: n?.fi ?? '',
    nameSv: n?.sv ?? '',
    descEn: d?.en ?? '',
    descFi: d?.fi ?? '',
    descSv: d?.sv ?? '',
  }
}

interface LocalizedCrudTabProps<T extends LocalizedEntity> {
  url: string
  getId: (entity: T) => string
  addLabel: string
  editLabel: string
  allowDeactivate?: boolean
}

// Categories and Locations are structurally identical CRUD screens (a localized
// name/description form over a table) differing only in their API url, id field
// and whether rows can be deactivated — so they share one implementation.
function LocalizedCrudTab<T extends LocalizedEntity>({
  url,
  getId,
  addLabel,
  editLabel,
  allowDeactivate = false,
}: LocalizedCrudTabProps<T>) {
  const { t } = useTranslation()
  const { showSnackbar } = useSnackbar()
  const {
    data: rows,
    mutate,
    isLoading,
    error,
    mutation,
  } = useApi<T[]>({ url, params: { includeInactive: true } })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const [form, setForm] = useState<LocalizedFormState>(emptyLocalizedForm)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyLocalizedForm)
    setDialogOpen(true)
  }
  const openEdit = (entity: T) => {
    setEditing(entity)
    setForm(entityToForm(entity))
    setDialogOpen(true)
  }
  const close = () => setDialogOpen(false)

  const handleSave = async () => {
    const payload = toLocalizedPayload(form)
    const result = editing
      ? await mutation.trigger('PUT', payload, getId(editing))
      : await mutation.trigger('POST', payload)
    if (result.error) {
      showSnackbar(t('common.error'), { severity: 'error' })
    } else {
      await mutate()
      showSnackbar(t('common.saved'), { severity: 'success' })
      close()
    }
  }

  const handleDeactivate = async (id: string) => {
    if (!globalThis.confirm(t('common.confirmDelete'))) return
    const result = await mutation.trigger('DELETE', {}, id)
    if (result.error) {
      showSnackbar(t('common.error'), { severity: 'error' })
    } else {
      await mutate()
      showSnackbar(t('common.deleted'), { severity: 'success' })
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant='contained' startIcon={<Icon icon='mdi:plus' />} onClick={openCreate}>
          {t(addLabel)}
        </Button>
      </Box>
      <RemoteContent isLoading={isLoading} error={error}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('common.name')} (EN)</TableCell>
                <TableCell>{t('common.name')} (FI)</TableCell>
                <TableCell>{t('inventory.status')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows?.map((entity) => {
                const n = entity.name as Record<string, string>
                const id = getId(entity)
                return (
                  <TableRow key={id} hover>
                    <TableCell>{n?.en}</TableCell>
                    <TableCell>{n?.fi}</TableCell>
                    <TableCell>
                      <Chip
                        label={entity.isActive ? t('common.active') : t('common.inactive')}
                        size='small'
                        color={entity.isActive ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align='right'>
                      <IconButton
                        size='small'
                        aria-label={`${t('common.edit')} ${n?.en}`}
                        onClick={() => openEdit(entity)}
                      >
                        <Icon icon='mdi:pencil' />
                      </IconButton>
                      {allowDeactivate && entity.isActive && (
                        <IconButton
                          size='small'
                          color='error'
                          aria-label={`${t('general.delete')} ${n?.en}`}
                          onClick={() => handleDeactivate(id)}
                        >
                          <Icon icon='mdi:delete' />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </RemoteContent>

      <Dialog open={dialogOpen} onClose={close} maxWidth='sm' fullWidth>
        <DialogTitle>{editing ? t(editLabel) : t(addLabel)}</DialogTitle>
        <DialogContent
          sx={{ pt: '8px !important', display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <LocalisedTextField
            label={t('common.name')}
            required
            values={{ en: form.nameEn, fi: form.nameFi, sv: form.nameSv }}
            onChange={(lang, val) => setForm((f) => withLocalisedField(f, 'name', lang, val))}
          />
          <LocalisedTextField
            label={t('common.description')}
            values={{ en: form.descEn, fi: form.descFi, sv: form.descSv }}
            onChange={(lang, val) => setForm((f) => withLocalisedField(f, 'desc', lang, val))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button
            variant='contained'
            onClick={handleSave}
            disabled={!form.nameEn.trim() || mutation.isMutating}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ── Item form state ───────────────────────────────────────────────────────────

interface ItemFormState {
  nameEn: string
  nameFi: string
  nameSv: string
  descEn: string
  descFi: string
  descSv: string
  categoryId: string
  locationId: string
  itemType: 'ASSET' | 'CONSUMABLE'
  quantity: string
  lowStockThreshold: string
  condition: string
  serialNumber: string
  imageUrl: string
  notes: string
  tags: string
  isActive: boolean
  isReservable: boolean
}

const emptyItemForm: ItemFormState = {
  nameEn: '',
  nameFi: '',
  nameSv: '',
  descEn: '',
  descFi: '',
  descSv: '',
  categoryId: '',
  locationId: '',
  itemType: 'CONSUMABLE',
  quantity: '0',
  lowStockThreshold: '',
  condition: 'UNKNOWN',
  serialNumber: '',
  imageUrl: '',
  notes: '',
  tags: '',
  isActive: true,
  isReservable: false,
}

function itemToForm(item: InventoryItem): ItemFormState {
  const n = item.name as Record<string, string>
  const d = item.description as Record<string, string> | undefined
  return {
    nameEn: n?.en ?? '',
    nameFi: n?.fi ?? '',
    nameSv: n?.sv ?? '',
    descEn: d?.en ?? '',
    descFi: d?.fi ?? '',
    descSv: d?.sv ?? '',
    categoryId: item.categoryId,
    locationId: item.locationId ?? '',
    itemType: item.itemType as 'ASSET' | 'CONSUMABLE',
    quantity: String(item.quantity),
    lowStockThreshold: item.lowStockThreshold != null ? String(item.lowStockThreshold) : '',
    condition: item.condition,
    serialNumber: item.serialNumber ?? '',
    imageUrl: item.imageUrl ?? '',
    notes: item.notes ?? '',
    tags: (item.tags ?? []).join(', '),
    isActive: item.isActive,
    isReservable: item.isReservable,
  }
}

// Parse a non-negative integer from a form field, returning null for blank or
// invalid input rather than silently producing NaN.
function parseNonNegativeInt(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

// Empty is allowed (imageUrl is optional); otherwise must be a valid http(s) URL,
// matching the backend's InventoryItemUpsertSchema validation.
function isValidImageUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') return true
  try {
    return /^https?:\/\//i.test(trimmed) && !!new URL(trimmed)
  } catch {
    return false
  }
}

function formToItemPayload(f: ItemFormState) {
  return {
    name: { en: f.nameEn, fi: f.nameFi, sv: f.nameSv },
    description: { en: f.descEn, fi: f.descFi, sv: f.descSv },
    categoryId: f.categoryId,
    locationId: f.locationId || undefined,
    itemType: f.itemType,
    quantity: parseNonNegativeInt(f.quantity) ?? 0,
    lowStockThreshold: parseNonNegativeInt(f.lowStockThreshold),
    condition: f.condition,
    serialNumber: f.serialNumber || null,
    imageUrl: f.imageUrl || null,
    notes: f.notes || null,
    tags: f.tags
      ? f.tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    isActive: f.isActive,
    isReservable: f.isReservable,
  }
}

// ── Items Tab ─────────────────────────────────────────────────────────────────

function ItemsTab() {
  const { t, i18n } = useTranslation()
  const { showSnackbar } = useSnackbar()
  const lang = resolveLanguage(i18n.language)

  const {
    data: items,
    mutate,
    isLoading,
    error,
    mutation,
  } = useApi<InventoryItem[]>({
    url: 'v1/inventory/items',
    params: { includeInactive: 'true' },
  })
  const { data: categories } = useApi<InventoryCategory[]>({
    url: 'v1/inventory/categories',
    params: { includeInactive: 'true' },
  })
  const { data: locations } = useApi<InventoryLocation[]>({
    url: 'v1/inventory/locations',
    params: { includeInactive: 'true' },
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [form, setForm] = useState<ItemFormState>(emptyItemForm)
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)

  // quantity adjustment dialog
  const [adjustDialog, setAdjustDialog] = useState<{ itemId: string; name: string } | null>(null)
  // The audit trail moved here from the member app's item page (#1233), where it
  // sat behind an isAdmin branch on a page every member can open.
  const [historyDialog, setHistoryDialog] = useState<{ itemId: string; name: string } | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const { mutation: adjustMutation } = useApi<InventoryItem>({ url: '', skipFetch: true })

  // Ticking "reservable" is only half of making an item reservable: capacity is
  // counted from the item's units, so one with none is offered in the
  // reservation calendar's item picker and then refuses every reservation with
  // "0 of 0 units are free for that time". The editor over there already warns
  // about it; without the same warning here, the tab the admin never opened is
  // the one thing not on screen.
  //
  // Only fetched while the dialog is open on an existing item that is ticked —
  // a brand-new item has no id to ask about, and gets the "after saving" note
  // below instead.
  const { data: unitData } = useApi<ItemUnitListResponse>({
    url: endpoints.inventoryUnits.forItem(editing?.itemId ?? 'no-item'),
    skipFetch: !dialogOpen || !editing || !form.isReservable,
  })

  // `unitData &&` rather than `?? 0`: while the request is in flight the count
  // is unknown, not zero, and warning first and retracting it reads as a bug.
  const reservableWithoutUnits =
    form.isReservable && !!editing && !!unitData && unitData.inServiceCount === 0
  const reservableBeforeSaving = form.isReservable && !editing

  const nameError = attemptedSubmit && !form.nameEn.trim()
  const categoryError = attemptedSubmit && !form.categoryId
  const imageUrlError = !isValidImageUrl(form.imageUrl)
  const formHasErrors = !form.nameEn.trim() || !form.categoryId || imageUrlError

  const openCreate = () => {
    setEditing(null)
    setForm(emptyItemForm)
    setAttemptedSubmit(false)
    setDialogOpen(true)
  }
  const openEdit = (item: InventoryItem) => {
    setEditing(item)
    setForm(itemToForm(item))
    setAttemptedSubmit(false)
    setDialogOpen(true)
  }
  const close = () => setDialogOpen(false)

  const handleSave = async () => {
    if (formHasErrors) {
      setAttemptedSubmit(true)
      return
    }
    const payload = formToItemPayload(form)
    const result = editing
      ? await mutation.trigger('PUT', payload, editing.itemId)
      : await mutation.trigger('POST', payload)
    if (result.error) {
      showSnackbar(result.error.detail ?? result.error.title ?? t('common.error'), {
        severity: 'error',
      })
    } else {
      await mutate()
      showSnackbar(t('common.saved'), { severity: 'success' })
      close()
    }
  }

  const handleDelete = async (id: string) => {
    if (!globalThis.confirm(t('common.confirmDelete'))) return
    const result = await mutation.trigger('DELETE', {}, id)
    if (result.error) {
      showSnackbar(t('common.error'), { severity: 'error' })
    } else {
      await mutate()
      showSnackbar(t('common.deleted'), { severity: 'success' })
    }
  }

  const handleAdjust = async () => {
    if (!adjustDialog) return
    const delta = parseInt(adjustDelta, 10)
    if (isNaN(delta)) return
    const result = await adjustMutation.trigger(
      'POST',
      { delta, notes: adjustNotes || null },
      `v1/inventory/items/${adjustDialog.itemId}/adjust-quantity`,
    )
    if (result.error) {
      showSnackbar(t('common.error'), { severity: 'error' })
    } else {
      await mutate()
      showSnackbar(t('common.saved'), { severity: 'success' })
      setAdjustDialog(null)
      setAdjustDelta('')
      setAdjustNotes('')
    }
  }

  const field = (
    key: keyof ItemFormState,
    label: string,
    type: 'text' | 'number' = 'text',
    opts?: { error?: boolean; helperText?: string },
  ) => (
    <TextField
      key={key}
      label={label}
      size='small'
      fullWidth
      type={type}
      slotProps={type === 'number' ? { htmlInput: { min: 0, step: 1 } } : undefined}
      value={form[key]}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      error={opts?.error}
      helperText={opts?.error ? opts.helperText : undefined}
      sx={{ mb: 2 }}
    />
  )

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant='contained' startIcon={<Icon icon='mdi:plus' />} onClick={openCreate}>
          {t('inventory.admin.addItem')}
        </Button>
      </Box>
      <RemoteContent isLoading={isLoading} error={error}>
        <TableContainer component={Paper}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>{t('common.name')}</TableCell>
                <TableCell>{t('inventory.category')}</TableCell>
                <TableCell>{t('inventory.location')}</TableCell>
                <TableCell>{t('inventory.itemType')}</TableCell>
                <TableCell>{t('inventory.qty')}</TableCell>
                <TableCell>{t('inventory.status')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {items?.map((item) => {
                const name = localName(item.name as Record<string, string>, lang)
                const catName = item.category
                  ? localName(item.category.name as Record<string, string>, lang)
                  : ''
                const locName = item.location
                  ? localName(item.location.name as Record<string, string>, lang)
                  : ''
                const isLowStock =
                  item.itemType === 'CONSUMABLE' &&
                  item.lowStockThreshold != null &&
                  item.quantity <= item.lowStockThreshold
                return (
                  <TableRow key={item.itemId} hover>
                    <TableCell>{name}</TableCell>
                    <TableCell>{catName}</TableCell>
                    <TableCell>{locName}</TableCell>
                    <TableCell>
                      <Chip
                        label={t(`inventory.type.${item.itemType}`)}
                        size='small'
                        variant='outlined'
                      />
                    </TableCell>
                    <TableCell>
                      {item.itemType === 'CONSUMABLE' ? (
                        <Typography
                          variant='body2'
                          color={isLowStock ? 'warning.main' : 'text.primary'}
                        >
                          {item.quantity}
                          {isLowStock && ' ⚠'}
                        </Typography>
                      ) : (
                        <Chip label={t(`inventory.condition.${item.condition}`)} size='small' />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={item.isActive ? t('common.active') : t('common.inactive')}
                        size='small'
                        color={item.isActive ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align='right'>
                      {item.itemType === 'CONSUMABLE' && (
                        <IconButton
                          size='small'
                          title={t('inventory.admin.adjustQuantity')}
                          aria-label={`${t('inventory.admin.adjustQuantity')} ${name}`}
                          onClick={() => setAdjustDialog({ itemId: item.itemId, name })}
                        >
                          <Icon icon='mdi:plus-minus' />
                        </IconButton>
                      )}
                      <IconButton
                        size='small'
                        title={t('inventory.auditLog')}
                        aria-label={`${t('inventory.auditLog')} ${name}`}
                        onClick={() => setHistoryDialog({ itemId: item.itemId, name })}
                      >
                        <Icon icon='mdi:history' />
                      </IconButton>
                      <IconButton
                        size='small'
                        aria-label={`${t('common.edit')} ${name}`}
                        onClick={() => openEdit(item)}
                      >
                        <Icon icon='mdi:pencil' />
                      </IconButton>
                      {item.isActive && (
                        <IconButton
                          size='small'
                          color='error'
                          aria-label={`${t('general.delete')} ${name}`}
                          onClick={() => handleDelete(item.itemId)}
                        >
                          <Icon icon='mdi:delete' />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </RemoteContent>

      {/* Item history */}
      <Dialog
        open={historyDialog !== null}
        onClose={() => setHistoryDialog(null)}
        maxWidth='md'
        fullWidth
      >
        <DialogTitle>{historyDialog?.name}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {historyDialog && <InventoryItemHistory itemId={historyDialog.itemId} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialog(null)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Item upsert dialog */}
      <Dialog open={dialogOpen} onClose={close} maxWidth='sm' fullWidth>
        <DialogTitle>
          {editing ? t('inventory.admin.editItem') : t('inventory.admin.addItem')}
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
            <LocalisedTextField
              label={t('common.name')}
              required
              error={nameError}
              helperText={t('inventory.admin.fieldRequired')}
              values={{ en: form.nameEn, fi: form.nameFi, sv: form.nameSv }}
              onChange={(lang, val) => setForm((f) => withLocalisedField(f, 'name', lang, val))}
            />
            <LocalisedTextField
              label={t('common.description')}
              values={{ en: form.descEn, fi: form.descFi, sv: form.descSv }}
              onChange={(lang, val) => setForm((f) => withLocalisedField(f, 'desc', lang, val))}
            />
          </Box>

          <FormControl size='small' fullWidth error={categoryError} sx={{ mb: 2 }}>
            <InputLabel id='inventory-item-category-label'>{t('inventory.category')} *</InputLabel>
            <Select
              labelId='inventory-item-category-label'
              value={form.categoryId}
              label={`${t('inventory.category')} *`}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            >
              {categories?.map((c) => (
                <MenuItem key={c.categoryId} value={c.categoryId}>
                  {localName(c.name as Record<string, string>, lang)}
                </MenuItem>
              ))}
            </Select>
            {categoryError && <FormHelperText>{t('inventory.admin.fieldRequired')}</FormHelperText>}
          </FormControl>

          <FormControl size='small' fullWidth sx={{ mb: 2 }}>
            <InputLabel id='inventory-item-location-label'>{t('inventory.location')}</InputLabel>
            <Select
              labelId='inventory-item-location-label'
              value={form.locationId}
              label={t('inventory.location')}
              onChange={(e) => setForm((f) => ({ ...f, locationId: e.target.value }))}
            >
              <MenuItem value=''>{t('common.none')}</MenuItem>
              {locations?.map((l) => (
                <MenuItem key={l.locationId} value={l.locationId}>
                  {localName(l.name as Record<string, string>, lang)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size='small' fullWidth sx={{ mb: 2 }}>
            <InputLabel id='inventory-item-type-label'>{t('inventory.itemType')}</InputLabel>
            <Select
              labelId='inventory-item-type-label'
              value={form.itemType}
              label={t('inventory.itemType')}
              onChange={(e) =>
                setForm((f) => ({ ...f, itemType: e.target.value as 'ASSET' | 'CONSUMABLE' }))
              }
            >
              <MenuItem value='ASSET'>{t('inventory.asset')}</MenuItem>
              <MenuItem value='CONSUMABLE'>{t('inventory.consumable')}</MenuItem>
            </Select>
          </FormControl>

          {form.itemType === 'CONSUMABLE' && (
            <>
              {/* Initial stock is only set at creation; afterwards quantity is
                  changed exclusively through the adjust-quantity dialog so every
                  movement is recorded in the audit log. */}
              {!editing && field('quantity', t('inventory.qty'), 'number')}
              {field('lowStockThreshold', t('inventory.lowStockThreshold'), 'number')}
            </>
          )}

          {form.itemType === 'ASSET' && (
            <>
              <FormControl size='small' fullWidth sx={{ mb: 2 }}>
                <InputLabel id='inventory-item-condition-label'>
                  {t('inventory.condition.label')}
                </InputLabel>
                <Select
                  labelId='inventory-item-condition-label'
                  value={form.condition}
                  label={t('inventory.condition.label')}
                  onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
                >
                  <MenuItem value='GOOD'>{t('inventory.condition.GOOD')}</MenuItem>
                  <MenuItem value='FAIR'>{t('inventory.condition.FAIR')}</MenuItem>
                  <MenuItem value='POOR'>{t('inventory.condition.POOR')}</MenuItem>
                  <MenuItem value='UNKNOWN'>{t('inventory.condition.UNKNOWN')}</MenuItem>
                </Select>
              </FormControl>
              {field('serialNumber', t('inventory.serialNumber'))}
            </>
          )}

          {field('imageUrl', t('inventory.imageUrl'), 'text', {
            error: imageUrlError,
            helperText: t('inventory.admin.invalidImageUrl'),
          })}
          {field('notes', t('inventory.notes'))}
          {field('tags', t('inventory.tagsHint'))}

          <FormControlLabel
            control={
              <Checkbox
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
            }
            label={t('common.active')}
          />

          {/* Opt-in, so the reservation calendar's item picker stays a short
              list of things worth reserving rather than the whole catalog. */}
          <FormControlLabel
            control={
              <Checkbox
                checked={form.isReservable}
                onChange={(e) => setForm((f) => ({ ...f, isReservable: e.target.checked }))}
              />
            }
            label={t('inventory.isReservable')}
          />
          <FormHelperText>{t('inventory.isReservableHint')}</FormHelperText>

          {reservableWithoutUnits && (
            <Alert severity='warning' sx={{ mt: 2 }}>
              {t('inventory.admin.reservableNoUnits')}
            </Alert>
          )}

          {reservableBeforeSaving && (
            <Alert severity='info' sx={{ mt: 2 }}>
              {t('inventory.admin.reservableAddUnitsAfterSaving')}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button
            variant='contained'
            onClick={handleSave}
            disabled={mutation.isMutating || (attemptedSubmit && formHasErrors)}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Quantity adjustment dialog */}
      <Dialog open={!!adjustDialog} onClose={() => setAdjustDialog(null)} maxWidth='xs' fullWidth>
        <DialogTitle>
          {t('inventory.admin.adjustQuantity')}: {adjustDialog?.name}
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField
            label={t('inventory.admin.delta')}
            size='small'
            fullWidth
            type='number'
            value={adjustDelta}
            onChange={(e) => setAdjustDelta(e.target.value)}
            helperText={t('inventory.admin.deltaHint')}
            sx={{ mb: 2 }}
          />
          <TextField
            label={t('inventory.notes')}
            size='small'
            fullWidth
            multiline
            rows={2}
            value={adjustNotes}
            onChange={(e) => setAdjustNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustDialog(null)}>{t('common.cancel')}</Button>
          <Button
            variant='contained'
            onClick={handleAdjust}
            disabled={!adjustDelta || isNaN(parseInt(adjustDelta, 10)) || adjustMutation.isMutating}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ── Units Tab ─────────────────────────────────────────────────────────────────

/**
 * The physical units of a reservable item (#1139).
 *
 * Its own tab rather than a control on the Items tab, because a unit is a row
 * in its own right — a tag, a condition, a status — and the item table has no
 * room to nest one list inside another. Only reservable items are offered: an
 * item nobody can reserve has no use for per-unit identity.
 */
function UnitsTab() {
  const { t, i18n } = useTranslation()
  const { showSnackbar } = useSnackbar()
  const lang = resolveLanguage(i18n.language)

  const { data: items } = useApi<InventoryItem[]>({
    url: 'v1/inventory/items',
    params: { reservableOnly: 'true', includeInactive: 'true' },
  })

  const [itemId, setItemId] = useState('')

  // `skipFetch` nulls SWR's key, so the placeholder id is never fetched — it
  // only satisfies `url`'s string type while no item is chosen.
  const {
    data: unitData,
    mutate,
    isLoading,
    error,
  } = useApi<ItemUnitListResponse>({
    url: endpoints.inventoryUnits.forItem(itemId || 'no-item'),
    skipFetch: !itemId,
  })

  // Writes go to three different paths (create under the item, update and
  // status under the unit), so they ride a separate mutation-only hook and pass
  // an absolute path each time rather than sharing the list hook's url.
  const { mutation: unitMutation } = useApi<ItemUnit>({ url: '', skipFetch: true })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ItemUnit | null>(null)
  const [tag, setTag] = useState('')
  const [condition, setCondition] = useState<ItemCondition>('UNKNOWN')
  const [notes, setNotes] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [statusDialog, setStatusDialog] = useState<ItemUnit | null>(null)
  const [nextStatus, setNextStatus] = useState<ItemUnitStatus>('AVAILABLE')
  const [statusNotes, setStatusNotes] = useState('')

  const openCreate = () => {
    setEditing(null)
    setTag('')
    setCondition('UNKNOWN')
    setNotes('')
    setIsActive(true)
    setDialogOpen(true)
  }

  const openEdit = (unit: ItemUnit) => {
    setEditing(unit)
    setTag(unit.tag ?? '')
    setCondition(unit.condition)
    setNotes(unit.notes ?? '')
    setIsActive(unit.isActive)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const payload = { tag: tag.trim() || null, condition, notes: notes.trim() || null, isActive }
    const result = editing
      ? await unitMutation.trigger(
          'PUT',
          payload,
          absolute(endpoints.inventoryUnits.byId(editing.unitId)),
        )
      : await unitMutation.trigger(
          'POST',
          payload,
          absolute(endpoints.inventoryUnits.forItem(itemId)),
        )

    if (result.error) {
      showSnackbar(result.error.detail ?? t('common.error'), { severity: 'error' })
      return
    }
    await mutate()
    showSnackbar(t('common.saved'), { severity: 'success' })
    setDialogOpen(false)
  }

  const handleStatusChange = async () => {
    if (!statusDialog) return

    const result = await unitMutation.trigger(
      'POST',
      { status: nextStatus, notes: statusNotes.trim() || null },
      absolute(endpoints.inventoryUnits.status(statusDialog.unitId)),
    )
    if (result.error) {
      showSnackbar(result.error.detail ?? t('common.error'), { severity: 'error' })
      return
    }
    await mutate()
    showSnackbar(t('common.saved'), { severity: 'success' })
    setStatusDialog(null)
    setStatusNotes('')
  }

  const units = unitData?.units ?? []

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <FormControl size='small' sx={{ minWidth: 260 }}>
          <InputLabel id='inventory-units-item-label'>{t('inventory.admin.selectItem')}</InputLabel>
          <Select
            labelId='inventory-units-item-label'
            value={itemId}
            label={t('inventory.admin.selectItem')}
            onChange={(e) => setItemId(e.target.value)}
          >
            {items?.map((item) => (
              <MenuItem key={item.itemId} value={item.itemId}>
                {localName(item.name as Record<string, string>, lang)}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>{t('inventory.admin.onlyReservableItems')}</FormHelperText>
        </FormControl>

        <Button
          variant='contained'
          startIcon={<Icon icon='mdi:plus' />}
          onClick={openCreate}
          disabled={!itemId}
        >
          {t('inventory.addUnit')}
        </Button>
      </Box>

      {!itemId ? (
        <Typography variant='body2' color='text.secondary'>
          {t('inventory.admin.selectItemFirst')}
        </Typography>
      ) : (
        <RemoteContent isLoading={isLoading} error={error}>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
            {t('inventory.unitsInService', {
              count: unitData?.inServiceCount ?? 0,
              total: units.length,
            })}
          </Typography>

          {units.length === 0 ? (
            <Typography variant='body2'>{t('inventory.noUnits')}</Typography>
          ) : (
            <TableContainer component={Paper}>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('inventory.unitTag')}</TableCell>
                    <TableCell>{t('inventory.unitStatus.label')}</TableCell>
                    <TableCell>{t('inventory.condition.label')}</TableCell>
                    <TableCell>{t('inventory.notes')}</TableCell>
                    <TableCell>{t('inventory.status')}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {units.map((unit) => (
                    <TableRow key={unit.unitId} hover>
                      <TableCell>{unit.tag ?? unit.unitId}</TableCell>
                      <TableCell>
                        <Chip label={t(`inventory.unitStatus.${unit.status}`)} size='small' />
                      </TableCell>
                      <TableCell>{t(`inventory.condition.${unit.condition}`)}</TableCell>
                      <TableCell>{unit.notes ?? ''}</TableCell>
                      <TableCell>
                        <Chip
                          label={unit.isActive ? t('common.active') : t('common.inactive')}
                          size='small'
                          color={unit.isActive ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell align='right'>
                        <IconButton
                          size='small'
                          aria-label={`${t('inventory.changeUnitStatus')} ${unit.tag ?? unit.unitId}`}
                          onClick={() => {
                            setStatusDialog(unit)
                            setNextStatus(unit.status)
                            setStatusNotes('')
                          }}
                        >
                          <Icon icon='mdi:swap-horizontal' />
                        </IconButton>
                        <IconButton
                          size='small'
                          aria-label={`${t('common.edit')} ${unit.tag ?? unit.unitId}`}
                          onClick={() => openEdit(unit)}
                        >
                          <Icon icon='mdi:pencil' />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </RemoteContent>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth='xs' fullWidth>
        <DialogTitle>{editing ? t('inventory.editUnit') : t('inventory.addUnit')}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField
            label={t('inventory.unitTag')}
            size='small'
            fullWidth
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            sx={{ mb: 2 }}
          />
          <FormControl size='small' fullWidth sx={{ mb: 2 }}>
            <InputLabel id='inventory-unit-condition-label'>
              {t('inventory.condition.label')}
            </InputLabel>
            <Select
              labelId='inventory-unit-condition-label'
              value={condition}
              label={t('inventory.condition.label')}
              onChange={(e) => setCondition(e.target.value as ItemCondition)}
            >
              {ItemConditionEnum.options.map((option) => (
                <MenuItem key={option} value={option}>
                  {t(`inventory.condition.${option}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label={t('inventory.notes')}
            size='small'
            fullWidth
            multiline
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            sx={{ mb: 1 }}
          />
          <FormControlLabel
            control={
              <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            }
            label={t('common.active')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant='contained' onClick={handleSave} disabled={unitMutation.isMutating}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Status moves through their own dialog so each one can carry a note and
          land in the item's audit log — the same reason stock only moves
          through the adjust-quantity dialog. */}
      <Dialog open={!!statusDialog} onClose={() => setStatusDialog(null)} maxWidth='xs' fullWidth>
        <DialogTitle>{t('inventory.changeUnitStatus')}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <FormControl size='small' fullWidth sx={{ mb: 2 }}>
            <InputLabel id='inventory-unit-status-label'>
              {t('inventory.unitStatus.label')}
            </InputLabel>
            <Select
              labelId='inventory-unit-status-label'
              value={nextStatus}
              label={t('inventory.unitStatus.label')}
              onChange={(e) => setNextStatus(e.target.value as ItemUnitStatus)}
            >
              {ItemUnitStatusEnum.options.map((option) => (
                <MenuItem key={option} value={option}>
                  {t(`inventory.unitStatus.${option}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label={t('inventory.notes')}
            size='small'
            fullWidth
            multiline
            rows={2}
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialog(null)}>{t('common.cancel')}</Button>
          <Button
            variant='contained'
            onClick={handleStatusChange}
            disabled={unitMutation.isMutating}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ── Main Admin Page ───────────────────────────────────────────────────────────

export default function InventoryAdminPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState(0)

  return (
    <Box>
      <Title label={t('inventory.admin.title')} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={t('inventory.admin.tabItems')} />
        <Tab label={t('inventory.admin.tabUnits')} />
        <Tab label={t('inventory.admin.tabCategories')} />
        <Tab label={t('inventory.admin.tabLocations')} />
      </Tabs>
      {tab === 0 && <ItemsTab />}
      {tab === 1 && <UnitsTab />}
      {tab === 2 && (
        <LocalizedCrudTab<InventoryCategory>
          url='v1/inventory/categories'
          getId={(c) => c.categoryId}
          addLabel='inventory.admin.addCategory'
          editLabel='inventory.admin.editCategory'
        />
      )}
      {tab === 3 && (
        <LocalizedCrudTab<InventoryLocation>
          url='v1/inventory/locations'
          getId={(l) => l.locationId}
          addLabel='inventory.admin.addLocation'
          editLabel='inventory.admin.editLocation'
          allowDeactivate
        />
      )}
    </Box>
  )
}
