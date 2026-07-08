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
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
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
import { Title } from '../../../components/Title'
import useApi from '../../../hooks/useApi'
import { RemoteContent } from '../../../components/RemoteContent'
import type {
  InventoryItem,
  InventoryCategory,
  InventoryLocation,
} from '@backend/routes/inventory/models'
import { resolveLanguage, localName } from '../../inventory/localized'

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
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null)

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
      setSnack({ msg: t('common.error'), sev: 'error' })
    } else {
      await mutate()
      setSnack({ msg: t('common.saved'), sev: 'success' })
      close()
    }
  }

  const handleDeactivate = async (id: string) => {
    if (!globalThis.confirm(t('common.confirmDelete'))) return
    const result = await mutation.trigger('DELETE', {}, id)
    if (result.error) {
      setSnack({ msg: t('common.error'), sev: 'error' })
    } else {
      await mutate()
      setSnack({ msg: t('common.saved'), sev: 'success' })
    }
  }

  const field = (key: keyof LocalizedFormState, label: string) => (
    <TextField
      key={key}
      label={label}
      size='small'
      fullWidth
      value={form[key]}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      sx={{ mb: 2 }}
    />
  )

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
                      <IconButton size='small' onClick={() => openEdit(entity)}>
                        <Icon icon='mdi:pencil' />
                      </IconButton>
                      {allowDeactivate && entity.isActive && (
                        <IconButton size='small' color='error' onClick={() => handleDeactivate(id)}>
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
        <DialogContent sx={{ pt: '8px !important' }}>
          {field('nameEn', `${t('common.name')} (EN) *`)}
          {field('nameFi', `${t('common.name')} (FI)`)}
          {field('nameSv', `${t('common.name')} (SV)`)}
          {field('descEn', `${t('common.description')} (EN)`)}
          {field('descFi', `${t('common.description')} (FI)`)}
          {field('descSv', `${t('common.description')} (SV)`)}
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

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={snack?.sev ?? 'info'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
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
  quantity: number
  lowStockThreshold: string
  condition: string
  serialNumber: string
  imageUrl: string
  notes: string
  tags: string
  isActive: boolean
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
  quantity: 0,
  lowStockThreshold: '',
  condition: 'UNKNOWN',
  serialNumber: '',
  imageUrl: '',
  notes: '',
  tags: '',
  isActive: true,
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
    quantity: item.quantity,
    lowStockThreshold: item.lowStockThreshold != null ? String(item.lowStockThreshold) : '',
    condition: item.condition,
    serialNumber: item.serialNumber ?? '',
    imageUrl: item.imageUrl ?? '',
    notes: item.notes ?? '',
    tags: (item.tags ?? []).join(', '),
    isActive: item.isActive,
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

function formToItemPayload(f: ItemFormState) {
  return {
    name: { en: f.nameEn, fi: f.nameFi, sv: f.nameSv },
    description: { en: f.descEn, fi: f.descFi, sv: f.descSv },
    categoryId: f.categoryId,
    locationId: f.locationId || undefined,
    itemType: f.itemType,
    quantity: f.quantity,
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
  }
}

// ── Items Tab ─────────────────────────────────────────────────────────────────

function ItemsTab() {
  const { t, i18n } = useTranslation()
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
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null)

  // quantity adjustment dialog
  const [adjustDialog, setAdjustDialog] = useState<{ itemId: string; name: string } | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const { mutation: adjustMutation } = useApi<InventoryItem>({ url: '' })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyItemForm)
    setDialogOpen(true)
  }
  const openEdit = (item: InventoryItem) => {
    setEditing(item)
    setForm(itemToForm(item))
    setDialogOpen(true)
  }
  const close = () => setDialogOpen(false)

  const handleSave = async () => {
    const payload = formToItemPayload(form)
    const result = editing
      ? await mutation.trigger('PUT', payload, editing.itemId)
      : await mutation.trigger('POST', payload)
    if (result.error) {
      setSnack({ msg: t('common.error'), sev: 'error' })
    } else {
      await mutate()
      setSnack({ msg: t('common.saved'), sev: 'success' })
      close()
    }
  }

  const handleDelete = async (id: string) => {
    if (!globalThis.confirm(t('common.confirmDelete'))) return
    const result = await mutation.trigger('DELETE', {}, id)
    if (result.error) {
      setSnack({ msg: t('common.error'), sev: 'error' })
    } else {
      await mutate()
      setSnack({ msg: t('common.deleted'), sev: 'success' })
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
      setSnack({ msg: t('common.error'), sev: 'error' })
    } else {
      await mutate()
      setSnack({ msg: t('common.saved'), sev: 'success' })
      setAdjustDialog(null)
      setAdjustDelta('')
      setAdjustNotes('')
    }
  }

  const field = (key: keyof ItemFormState, label: string, type: 'text' | 'number' = 'text') => (
    <TextField
      key={key}
      label={label}
      size='small'
      fullWidth
      type={type}
      slotProps={type === 'number' ? { htmlInput: { min: 0, step: 1 } } : undefined}
      value={form[key]}
      onChange={(e) =>
        setForm((f) => ({
          ...f,
          [key]: type === 'number' ? Number(e.target.value) : e.target.value,
        }))
      }
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
                          onClick={() => setAdjustDialog({ itemId: item.itemId, name })}
                        >
                          <Icon icon='mdi:plus-minus' />
                        </IconButton>
                      )}
                      <IconButton size='small' onClick={() => openEdit(item)}>
                        <Icon icon='mdi:pencil' />
                      </IconButton>
                      {item.isActive && (
                        <IconButton
                          size='small'
                          color='error'
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

      {/* Item upsert dialog */}
      <Dialog open={dialogOpen} onClose={close} maxWidth='sm' fullWidth>
        <DialogTitle>
          {editing ? t('inventory.admin.editItem') : t('inventory.admin.addItem')}
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {field('nameEn', `${t('common.name')} (EN) *`)}
          {field('nameFi', `${t('common.name')} (FI)`)}
          {field('nameSv', `${t('common.name')} (SV)`)}
          {field('descEn', `${t('common.description')} (EN)`)}
          {field('descFi', `${t('common.description')} (FI)`)}
          {field('descSv', `${t('common.description')} (SV)`)}

          <FormControl size='small' fullWidth sx={{ mb: 2 }}>
            <InputLabel>{t('inventory.category')} *</InputLabel>
            <Select
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
          </FormControl>

          <FormControl size='small' fullWidth sx={{ mb: 2 }}>
            <InputLabel>{t('inventory.location')}</InputLabel>
            <Select
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
            <InputLabel>{t('inventory.itemType')}</InputLabel>
            <Select
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
                <InputLabel>{t('inventory.condition.label')}</InputLabel>
                <Select
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

          {field('imageUrl', t('inventory.imageUrl'))}
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
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button
            variant='contained'
            onClick={handleSave}
            disabled={!form.nameEn.trim() || !form.categoryId || mutation.isMutating}
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

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={snack?.sev ?? 'info'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
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
        <Tab label={t('inventory.admin.tabCategories')} />
        <Tab label={t('inventory.admin.tabLocations')} />
      </Tabs>
      {tab === 0 && <ItemsTab />}
      {tab === 1 && (
        <LocalizedCrudTab<InventoryCategory>
          url='v1/inventory/categories'
          getId={(c) => c.categoryId}
          addLabel='inventory.admin.addCategory'
          editLabel='inventory.admin.editCategory'
        />
      )}
      {tab === 2 && (
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
