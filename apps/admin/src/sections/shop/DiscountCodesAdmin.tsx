import {
  Box,
  Button,
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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Title } from '@mik/ui/components/Title'
import useApi from '../../hooks/useApi'
import { useSnackbar } from '../../hooks/useSnackbar'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { useLocalisedText } from '@mik/ui/utils/localisedText'
import type { Category, DiscountCode } from '@mik/contracts/shop'

interface CodeForm {
  code: string
  description: string
  categoryIds: string[]
  discountType: 'percent' | 'fixed'
  discountValue: string
  minOrderAmount: string
  maxUses: string
  validFrom: string
  validUntil: string
  isActive: boolean
}

const emptyForm: CodeForm = {
  code: '',
  description: '',
  categoryIds: [],
  discountType: 'percent',
  discountValue: '',
  minOrderAmount: '',
  maxUses: '',
  validFrom: new Date().toISOString().slice(0, 16),
  validUntil: '',
  isActive: true,
}

function codeToForm(c: DiscountCode): CodeForm {
  return {
    code: c.code,
    description: c.description ?? '',
    categoryIds: c.categoryIds ?? [],
    discountType: c.discountType,
    discountValue: String(c.discountValue),
    minOrderAmount: c.minOrderAmount == null ? '' : String(c.minOrderAmount),
    maxUses: c.maxUses == null ? '' : String(c.maxUses),
    validFrom: c.validFrom.slice(0, 16),
    validUntil: c.validUntil ? c.validUntil.slice(0, 16) : '',
    isActive: c.isActive,
  }
}

function formToPayload(f: CodeForm) {
  return {
    code: f.code.toUpperCase().trim(),
    description: f.description || null,
    categoryIds: f.categoryIds,
    discountType: f.discountType,
    discountValue: Number.parseFloat(f.discountValue) || 0,
    minOrderAmount: f.minOrderAmount ? Number.parseFloat(f.minOrderAmount) : null,
    maxUses: f.maxUses ? Number.parseInt(f.maxUses) : null,
    validFrom: new Date(f.validFrom).toISOString(),
    validUntil: f.validUntil ? new Date(f.validUntil).toISOString() : null,
    isActive: f.isActive,
  }
}

export default function DiscountCodesAdmin() {
  const { t } = useTranslation()

  const {
    data: codes,
    mutate,
    isLoading,
    error,
    mutation,
  } = useApi<DiscountCode[]>({ url: 'v1/shop/discount-codes' })

  const { data: categories } = useApi<Category[]>({ url: 'v1/shop/categories' })

  const { localise } = useLocalisedText()

  const { showSnackbar } = useSnackbar()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DiscountCode | null>(null)
  const [form, setForm] = useState<CodeForm>(emptyForm)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }
  const openEdit = (c: DiscountCode) => {
    setEditing(c)
    setForm(codeToForm(c))
    setDialogOpen(true)
  }
  const close = () => setDialogOpen(false)

  const set = (key: keyof CodeForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSave = async () => {
    const payload = formToPayload(form) as Partial<DiscountCode>
    const result = editing
      ? await mutation.trigger('PUT', payload, `${editing.codeId}`)
      : await mutation.trigger('POST', payload)

    if (result.error) {
      showSnackbar(t('common.error'), { severity: 'error' })
    } else {
      await mutate()
      showSnackbar(t('common.saved'), { severity: 'success' })
      close()
    }
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Title label={t('shop.admin.discountCodes')} />
        <Button variant='contained' startIcon={<Icon icon='mdi:plus' />} onClick={openCreate}>
          {t('shop.admin.addCode')}
        </Button>
      </Box>

      <RemoteContent isLoading={isLoading} error={error}>
        <TableContainer component={Paper}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>{t('shop.code')}</TableCell>
                <TableCell>{t('shop.discountValue')}</TableCell>
                <TableCell>{t('shop.uses')}</TableCell>
                <TableCell>{t('shop.validUntil')}</TableCell>
                <TableCell>{t('common.active')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {codes?.map((c) => (
                <TableRow key={c.codeId} hover>
                  <TableCell>
                    <strong>{c.code}</strong>
                  </TableCell>
                  <TableCell>
                    {c.discountType === 'percent' ? `${c.discountValue}%` : `€${c.discountValue}`}
                  </TableCell>
                  <TableCell>
                    {c.usesCount}
                    {c.maxUses == null ? '' : ` / ${c.maxUses}`}
                  </TableCell>
                  <TableCell>
                    {c.validUntil ? new Date(c.validUntil).toLocaleDateString() : '–'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size='small'
                      label={c.isActive ? t('common.yes') : t('common.no')}
                      color={c.isActive ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align='right'>
                    <IconButton size='small' aria-label='Edit' onClick={() => openEdit(c)}>
                      <Icon icon='mdi:pencil' />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </RemoteContent>

      <Dialog open={dialogOpen} onClose={close} maxWidth='sm' fullWidth>
        <DialogTitle>{editing ? t('shop.admin.editCode') : t('shop.admin.addCode')}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label={`${t('shop.code')} *`}
              size='small'
              fullWidth
              value={form.code}
              onChange={set('code')}
              slotProps={{
                htmlInput: { style: { textTransform: 'uppercase' } },
              }}
            />
            <FormControl size='small' fullWidth>
              <InputLabel>{t('shop.discountType')}</InputLabel>
              <Select
                value={form.discountType}
                label={t('shop.discountType')}
                onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))}
              >
                <MenuItem value='percent'>%</MenuItem>
                <MenuItem value='fixed'>€ {t('shop.fixed')}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label={`${t('shop.discountValue')} *`}
              size='small'
              fullWidth
              type='number'
              value={form.discountValue}
              onChange={set('discountValue')}
              slotProps={{ htmlInput: { step: '0.01' } }}
            />
            <TextField
              label={t('shop.minOrderAmount')}
              size='small'
              fullWidth
              type='number'
              value={form.minOrderAmount}
              onChange={set('minOrderAmount')}
              slotProps={{ htmlInput: { step: '0.01' } }}
            />
            <TextField
              label={t('shop.maxUses')}
              size='small'
              fullWidth
              type='number'
              value={form.maxUses}
              onChange={set('maxUses')}
            />
            <FormControl size='small' fullWidth>
              <InputLabel>{t('shop.category')}</InputLabel>
              <Select
                multiple
                value={form.categoryIds}
                label={t('shop.category')}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    categoryIds: e.target.value as string[],
                  }))
                }
              >
                {(categories ?? []).map((category) => (
                  <MenuItem key={category.categoryId} value={category.categoryId}>
                    {localise(category.name) || category.categoryId}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box
              sx={{
                gridColumn: '1 / -1',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 2,
              }}
            >
              <TextField
                label={t('shop.validFrom')}
                size='small'
                fullWidth
                type='datetime-local'
                value={form.validFrom}
                onChange={set('validFrom')}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label={t('shop.validUntil')}
                size='small'
                fullWidth
                type='datetime-local'
                value={form.validUntil}
                onChange={set('validUntil')}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
            <TextField
              label={t('common.description')}
              size='small'
              fullWidth
              value={form.description}
              onChange={set('description')}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
              }
              label={t('common.active')}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button
            variant='contained'
            onClick={handleSave}
            disabled={!form.code.trim() || !form.discountValue || mutation.isMutating}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
