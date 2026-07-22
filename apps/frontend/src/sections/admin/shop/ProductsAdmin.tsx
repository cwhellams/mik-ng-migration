import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Switch,
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
import { Link } from 'react-router-dom'
import { Title } from '../../../components/Title'
import useApi from '../../../hooks/useApi'
import { RemoteContent } from '../../../components/RemoteContent'
import type {
  Product,
  Category,
  ProductProperty,
  PropertyUpsert,
} from '@backend/routes/shop/models'

// ── Localised field ───────────────────────────────────────────────────────────

interface LocalisedValues {
  en: string
  fi: string
  sv: string
}
type Lang = 'en' | 'fi' | 'sv'

function LocalisedField({
  label,
  values,
  required,
  multiline,
  onChange,
}: Readonly<{
  label: string
  values: LocalisedValues
  required?: boolean
  multiline?: boolean
  onChange: (lang: Lang, value: string) => void
}>) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
      }}
    >
      <Typography
        variant='caption'
        sx={{
          color: 'text.secondary',
          display: 'block',
          mb: 1,
        }}
      >
        {label}
        {required && ' *'}
      </Typography>
      {(['en', 'fi', 'sv'] as Lang[]).map((lang, i) => (
        <Box
          key={lang}
          sx={{
            display: 'flex',
            alignItems: multiline ? 'flex-start' : 'center',
            gap: 1,
            mt: i > 0 ? 1 : 0,
          }}
        >
          <Chip label={lang.toUpperCase()} size='small' sx={{ width: 38, flexShrink: 0 }} />
          <TextField
            size='small'
            fullWidth
            value={values[lang]}
            onChange={(e) => onChange(lang, e.target.value)}
            multiline={multiline}
            rows={multiline ? 2 : undefined}
          />
        </Box>
      ))}
    </Box>
  )
}

// ── Variants tab ──────────────────────────────────────────────────────────────

const QUICK_SIZES: LocalisedValues[] = [
  { en: 'S', fi: 'S', sv: 'S' },
  { en: 'M', fi: 'M', sv: 'M' },
  { en: 'L', fi: 'L', sv: 'L' },
  { en: 'XL', fi: 'XL', sv: 'XL' },
]

function parseStockQuantity(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number.parseInt(value)
  if (Number.isNaN(parsed) || parsed < 0) return null
  return parsed
}

const emptyPropertyForm = (sortOrder = 0): PropertyUpsert => ({
  name: { en: '', fi: '', sv: '' },
  isRequired: false,
  sortOrder,
  options: [],
})

function VariantsTab({ productId }: Readonly<{ productId: string }>) {
  const { t } = useTranslation()
  const {
    data: properties,
    mutate,
    isLoading,
    error,
    mutation,
  } = useApi<ProductProperty[]>({
    url: `v1/shop/products/${productId}/properties`,
  })
  const [propForm, setPropForm] = useState<PropertyUpsert | null>(null)
  const [snack, setSnack] = useState<{
    msg: string
    sev: 'success' | 'error'
  } | null>(null)

  const addOption = () =>
    setPropForm((f) =>
      f
        ? {
            ...f,
            options: [
              ...f.options,
              {
                value: { en: '', fi: '', sv: '' },
                sortOrder: f.options.length,
                isActive: true,
                stockQuantity: null,
              },
            ],
          }
        : f,
    )

  const addQuickSizes = () =>
    setPropForm((f) => {
      if (!f) return f
      const next = QUICK_SIZES.map((v, i) => ({
        value: v,
        sortOrder: f.options.length + i,
        isActive: true,
        stockQuantity: null,
      }))
      return { ...f, options: [...f.options, ...next] }
    })

  const setOptionValue = (idx: number, lang: Lang, val: string) =>
    setPropForm((f) =>
      f
        ? {
            ...f,
            options: f.options.map((o, i) =>
              i === idx
                ? {
                    ...o,
                    value: { ...(o.value as LocalisedValues), [lang]: val },
                  }
                : o,
            ),
          }
        : f,
    )

  const setOptionStockQuantity = (idx: number, value: string) => {
    const stockQuantity = parseStockQuantity(value)
    setPropForm((f) =>
      f
        ? {
            ...f,
            options: f.options.map((o, i) => (i === idx ? { ...o, stockQuantity } : o)),
          }
        : f,
    )
  }

  const removeOption = (idx: number) =>
    setPropForm((f) => (f ? { ...f, options: f.options.filter((_, i) => i !== idx) } : f))

  const handleSaveProperty = async () => {
    if (!propForm) return
    const result = await mutation.trigger('PUT', propForm)
    if (result.error) {
      setSnack({ msg: t('common.error'), sev: 'error' })
    } else {
      await mutate()
      setPropForm(null)
      setSnack({ msg: t('common.saved'), sev: 'success' })
    }
  }

  const handleDeleteProperty = async (propertyId: number) => {
    if (!globalThis.confirm(t('common.confirmDelete'))) return
    const result = await mutation.trigger('DELETE', {}, `${propertyId}`)
    if (result.error) {
      setSnack({ msg: t('common.error'), sev: 'error' })
    } else {
      await mutate()
      setSnack({ msg: t('common.deleted'), sev: 'success' })
    }
  }

  const startEdit = (prop: ProductProperty) => {
    const n = prop.name as LocalisedValues
    setPropForm({
      propertyId: prop.propertyId,
      name: { en: n?.en ?? '', fi: n?.fi ?? '', sv: n?.sv ?? '' },
      isRequired: prop.isRequired,
      sortOrder: prop.sortOrder,
      options: (prop.options ?? []).map((o) => {
        const v = o.value as LocalisedValues
        return {
          optionId: o.optionId,
          value: { en: v?.en ?? '', fi: v?.fi ?? '', sv: v?.sv ?? '' },
          sortOrder: o.sortOrder,
          isActive: o.isActive,
          stockQuantity: o.stockQuantity ?? null,
        }
      }),
    })
  }

  return (
    <Box sx={{ mt: 1 }}>
      <RemoteContent isLoading={isLoading} error={error}>
        {properties?.length === 0 && !propForm && (
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
              mb: 2,
            }}
          >
            {t('shop.noVariants')}
          </Typography>
        )}

        {properties?.map((prop) => {
          const name = prop.name as LocalisedValues
          return (
            <Paper key={prop.propertyId} variant='outlined' sx={{ p: 1.5, mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                  variant='body2'
                  sx={{
                    fontWeight: 'medium',
                    flex: 1,
                  }}
                >
                  {name?.en}
                  {prop.isRequired && (
                    <Chip label={t('shop.required')} size='small' color='primary' sx={{ ml: 1 }} />
                  )}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {(prop.options ?? []).map((o) => (
                    <Chip key={o.optionId} label={(o.value as LocalisedValues)?.en} size='small' />
                  ))}
                </Box>
                <IconButton size='small' onClick={() => startEdit(prop)}>
                  <Icon icon='mdi:pencil' />
                </IconButton>
                <IconButton
                  size='small'
                  color='error'
                  onClick={() => handleDeleteProperty(prop.propertyId)}
                >
                  <Icon icon='mdi:delete' />
                </IconButton>
              </Box>
            </Paper>
          )
        })}

        {propForm === null ? (
          <Button
            size='small'
            startIcon={<Icon icon='mdi:plus' />}
            onClick={() => setPropForm(emptyPropertyForm(properties?.length ?? 0))}
          >
            {t('shop.addVariant')}
          </Button>
        ) : (
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'primary.main',
              borderRadius: 1,
              p: 2,
              mt: 1,
            }}
          >
            <Typography variant='subtitle2' sx={{ mb: 1.5 }}>
              {t('shop.addVariant')}
            </Typography>

            <LocalisedField
              label={t('shop.variantName')}
              values={propForm.name as LocalisedValues}
              required
              onChange={(lang, val) =>
                setPropForm((f) =>
                  f
                    ? {
                        ...f,
                        name: { ...(f.name as LocalisedValues), [lang]: val },
                      }
                    : f,
                )
              }
            />

            <FormControlLabel
              sx={{ mt: 1 }}
              control={
                <Switch
                  checked={propForm.isRequired}
                  onChange={(e) =>
                    setPropForm((f) => (f ? { ...f, isRequired: e.target.checked } : f))
                  }
                />
              }
              label={t('shop.required')}
            />

            <Divider sx={{ my: 1.5 }} />

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 1,
              }}
            >
              <Typography
                variant='caption'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('shop.optionValues')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size='small' onClick={addQuickSizes}>
                  {t('shop.quickSizes')}
                </Button>
                <Button size='small' startIcon={<Icon icon='mdi:plus' />} onClick={addOption}>
                  {t('shop.addOption')}
                </Button>
              </Box>
            </Box>

            {propForm.options.map((opt, idx) => (
              <Box
                key={`${opt.optionId ?? 'new'}-${opt.sortOrder}-${(opt.value as LocalisedValues).en}`}
                sx={{
                  display: 'flex',
                  gap: 1,
                  mb: 1,
                  alignItems: 'flex-start',
                }}
              >
                <Box sx={{ flex: 1 }}>
                  {(['en', 'fi', 'sv'] as Lang[]).map((lang, i) => (
                    <Box
                      key={lang}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: i < 2 ? 0.5 : 0,
                      }}
                    >
                      <Chip
                        label={lang.toUpperCase()}
                        size='small'
                        sx={{ width: 38, flexShrink: 0 }}
                      />
                      <TextField
                        size='small'
                        fullWidth
                        value={(opt.value as LocalisedValues)[lang]}
                        onChange={(e) => setOptionValue(idx, lang, e.target.value)}
                      />
                    </Box>
                  ))}

                  <TextField
                    size='small'
                    fullWidth
                    type='number'
                    label={t('shop.stock')}
                    value={opt.stockQuantity == null ? '' : String(opt.stockQuantity)}
                    onChange={(e) => setOptionStockQuantity(idx, e.target.value)}
                  />
                </Box>
                <IconButton
                  size='small'
                  color='error'
                  sx={{ mt: 1 }}
                  onClick={() => removeOption(idx)}
                >
                  <Icon icon='mdi:delete' />
                </IconButton>
              </Box>
            ))}

            <Box
              sx={{
                display: 'flex',
                gap: 1,
                mt: 2,
                justifyContent: 'flex-end',
              }}
            >
              <Button size='small' onClick={() => setPropForm(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                size='small'
                variant='contained'
                disabled={!(propForm.name as LocalisedValues).en.trim() || mutation.isMutating}
                onClick={handleSaveProperty}
              >
                {t('common.save')}
              </Button>
            </Box>
          </Box>
        )}
      </RemoteContent>
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

// ── Product form ──────────────────────────────────────────────────────────────

interface ProductForm {
  nameEn: string
  nameFi: string
  nameSv: string
  descEn: string
  descFi: string
  descSv: string
  categoryId: string
  simplbooksItemId: string
  price: string
  vatPercent: string
  stockQuantity: string
  lowStockThreshold: string
  maxPerMemberQty: string
  imageUrl: string
  tags: string
  isActive: boolean
  isPublished: boolean
}

const emptyForm: ProductForm = {
  nameEn: '',
  nameFi: '',
  nameSv: '',
  descEn: '',
  descFi: '',
  descSv: '',
  categoryId: '',
  simplbooksItemId: '',
  price: '',
  vatPercent: '24',
  stockQuantity: '0',
  lowStockThreshold: '',
  maxPerMemberQty: '',
  imageUrl: '',
  tags: '',
  isActive: true,
  isPublished: false,
}

function productToForm(p: Product): ProductForm {
  const n = p.name as Record<string, string>
  const d = p.description as Record<string, string> | null | undefined
  return {
    nameEn: n?.en ?? '',
    nameFi: n?.fi ?? '',
    nameSv: n?.sv ?? '',
    descEn: d?.en ?? '',
    descFi: d?.fi ?? '',
    descSv: d?.sv ?? '',
    categoryId: p.categoryId,
    simplbooksItemId: p.simplbooksItemId ?? '',
    price: String(p.price),
    vatPercent: String(p.vatPercent),
    stockQuantity: String(p.stockQuantity),
    lowStockThreshold: p.lowStockThreshold == null ? '' : String(p.lowStockThreshold),
    maxPerMemberQty: p.maxOrderQuantity == null ? '' : String(p.maxOrderQuantity),
    imageUrl: p.imageUrl ?? '',
    tags: p.tags?.join(', ') ?? '',
    isActive: p.isActive,
    isPublished: p.isPublished,
  }
}

function formToPayload(f: ProductForm) {
  return {
    name: { en: f.nameEn, fi: f.nameFi, sv: f.nameSv },
    description: { en: f.descEn, fi: f.descFi, sv: f.descSv },
    categoryId: f.categoryId,
    simplbooksItemId: f.simplbooksItemId || null,
    price: Number.parseFloat(f.price) || 0,
    vatPercent: Number.parseFloat(f.vatPercent) || 24,
    stockQuantity: Number.parseInt(f.stockQuantity) || 0,
    lowStockThreshold: f.lowStockThreshold ? Number.parseInt(f.lowStockThreshold) : null,
    maxOrderQuantity: f.maxPerMemberQty ? Number.parseInt(f.maxPerMemberQty) : null,
    imageUrl: f.imageUrl || null,
    tags: f.tags
      ? f.tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    isActive: f.isActive,
    isPublished: f.isPublished,
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProductsAdmin() {
  const { t } = useTranslation()

  type FilterState = '' | 'true' | 'false'

  const [filterCategory, setFilterCategory] = useState('')
  const [filterActive, setFilterActive] = useState<FilterState>('')
  const [filterPublished, setFilterPublished] = useState<FilterState>('')

  const filterParams = {
    adminView: true,
    ...(filterCategory ? { categoryId: filterCategory } : {}),
    ...(filterActive === '' ? {} : { active: filterActive === 'true' }),
    ...(filterPublished === '' ? {} : { published: filterPublished === 'true' }),
  }
  const {
    data: products,
    mutate,
    isLoading: productsLoading,
    error: productsError,
    mutation,
  } = useApi<Product[]>({ url: 'v1/shop/products', params: filterParams })
  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useApi<Category[]>({ url: 'v1/shop/categories' })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [tabIndex, setTabIndex] = useState(0)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [snack, setSnack] = useState<{
    msg: string
    sev: 'success' | 'error'
  } | null>(null)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setTabIndex(0)
    setDialogOpen(true)
  }
  const openEdit = (p: Product) => {
    setEditing(p)
    setForm(productToForm(p))
    setTabIndex(0)
    setDialogOpen(true)
  }
  const close = () => setDialogOpen(false)

  const set = (key: keyof ProductForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSave = async () => {
    const payload = {
      ...formToPayload(form),
      productType: editing?.productType ?? 'STANDARD',
    } as Partial<Product>
    const result = editing
      ? await mutation.trigger('PUT', payload, editing.productId)
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

  const showDetailsTab = !editing || tabIndex === 0
  const isFlightPackageEdit = editing?.productType === 'FLIGHT_HOURS_PACKAGE'

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
        <Title label={t('shop.admin.products')} />
        <Button variant='contained' startIcon={<Icon icon='mdi:plus' />} onClick={openCreate}>
          {t('shop.admin.addProduct')}
        </Button>
      </Box>

      <RemoteContent
        isLoading={productsLoading || categoriesLoading}
        error={productsError ?? categoriesError}
      >
        {/* Filter bar */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <FormControl size='small' sx={{ minWidth: 160 }}>
            <InputLabel>{t('shop.category')}</InputLabel>
            <Select
              value={filterCategory}
              label={t('shop.category')}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <MenuItem value=''>{t('common.all')}</MenuItem>
              {categories?.map((c) => (
                <MenuItem key={c.categoryId} value={c.categoryId}>
                  {(c.name as Record<string, string>)?.en}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size='small' sx={{ minWidth: 140 }}>
            <InputLabel>{t('common.active')}</InputLabel>
            <Select
              value={filterActive}
              label={t('common.active')}
              onChange={(e) => setFilterActive(e.target.value as '' | 'true' | 'false')}
            >
              <MenuItem value=''>{t('common.all')}</MenuItem>
              <MenuItem value='true'>{t('common.active')}</MenuItem>
              <MenuItem value='false'>{t('common.inactive')}</MenuItem>
            </Select>
          </FormControl>

          <FormControl size='small' sx={{ minWidth: 140 }}>
            <InputLabel>{t('common.status')}</InputLabel>
            <Select
              value={filterPublished}
              label={t('common.status')}
              onChange={(e) => setFilterPublished(e.target.value as '' | 'true' | 'false')}
            >
              <MenuItem value=''>{t('common.all')}</MenuItem>
              <MenuItem value='true'>{t('shop.published')}</MenuItem>
              <MenuItem value='false'>{t('shop.draft')}</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <TableContainer component={Paper}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>{t('common.name')}</TableCell>
                <TableCell>{t('shop.category')}</TableCell>
                <TableCell>{t('shop.price')}</TableCell>
                <TableCell>{t('shop.stock')}</TableCell>
                <TableCell>{t('shop.status')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {products?.map((p) => {
                const n = p.name as Record<string, string>
                const cat = categories?.find((c) => c.categoryId === p.categoryId)
                const catName = (cat?.name as Record<string, string>)?.en ?? p.categoryId
                let stockChip = <Chip size='small' label={`${p.stockQuantity}`} color='success' />
                if (p.stockQuantity === 0) {
                  stockChip = <Chip size='small' label={t('shop.outOfStock')} color='error' />
                } else if (p.stockQuantity <= (p.lowStockThreshold ?? 5)) {
                  stockChip = <Chip size='small' label={`${p.stockQuantity}`} color='warning' />
                }
                return (
                  <TableRow key={p.productId} hover>
                    <TableCell>{n?.en}</TableCell>
                    <TableCell>{catName}</TableCell>
                    <TableCell>€{p.price.toFixed(2)}</TableCell>
                    <TableCell>{stockChip}</TableCell>
                    <TableCell>
                      {p.isPublished ? (
                        <Chip size='small' label={t('shop.published')} color='success' />
                      ) : (
                        <Chip size='small' label={t('shop.draft')} />
                      )}
                    </TableCell>
                    <TableCell align='right'>
                      <IconButton size='small' onClick={() => openEdit(p)}>
                        <Icon icon='mdi:pencil' />
                      </IconButton>
                      <IconButton
                        size='small'
                        color='error'
                        onClick={() => handleDelete(p.productId)}
                        disabled={!!p.hasOrders}
                        title={p.hasOrders ? 'Cannot delete products that have orders' : undefined}
                      >
                        <Icon icon='mdi:delete' />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </RemoteContent>

      <Dialog open={dialogOpen} onClose={close} maxWidth='md' fullWidth>
        <DialogTitle>
          {editing ? t('shop.admin.editProduct') : t('shop.admin.addProduct')}
        </DialogTitle>

        {editing && !isFlightPackageEdit && (
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
            <Tabs value={tabIndex} onChange={(_, v: number) => setTabIndex(v)}>
              <Tab label={t('general.details')} />
              <Tab label={t('shop.variants')} />
            </Tabs>
          </Box>
        )}

        <DialogContent sx={{ pt: '16px !important' }}>
          {isFlightPackageEdit && (
            <Alert severity='info' sx={{ mb: 1 }}>
              {t('shop.admin.flightPackageEditWarning')}
            </Alert>
          )}

          {showDetailsTab && !isFlightPackageEdit && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <LocalisedField
                label={t('common.name')}
                required
                values={{ en: form.nameEn, fi: form.nameFi, sv: form.nameSv }}
                onChange={(lang, val) =>
                  setForm((f) => ({
                    ...f,
                    nameEn: lang === 'en' ? val : f.nameEn,
                    nameFi: lang === 'fi' ? val : f.nameFi,
                    nameSv: lang === 'sv' ? val : f.nameSv,
                  }))
                }
              />

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <FormControl size='small' fullWidth>
                  <InputLabel>{t('shop.category')} *</InputLabel>
                  <Select
                    value={form.categoryId}
                    label={`${t('shop.category')} *`}
                    onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  >
                    {categories?.map((c) => (
                      <MenuItem key={c.categoryId} value={c.categoryId}>
                        {(c.name as Record<string, string>)?.en}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label={t('shop.price')}
                  size='small'
                  fullWidth
                  type='number'
                  value={form.price}
                  onChange={set('price')}
                  slotProps={{ htmlInput: { step: '0.01' } }}
                />
                <TextField
                  label={t('shop.vatPercent')}
                  size='small'
                  fullWidth
                  type='number'
                  value={form.vatPercent}
                  onChange={set('vatPercent')}
                />
                <TextField
                  label={t('shop.stock')}
                  size='small'
                  fullWidth
                  type='number'
                  value={form.stockQuantity}
                  onChange={set('stockQuantity')}
                />
                <TextField
                  label={t('shop.lowStockThreshold')}
                  size='small'
                  fullWidth
                  type='number'
                  value={form.lowStockThreshold}
                  onChange={set('lowStockThreshold')}
                />
                <TextField
                  label={t('shop.maxPerMemberQtyLabel')}
                  size='small'
                  fullWidth
                  type='number'
                  value={form.maxPerMemberQty}
                  onChange={set('maxPerMemberQty')}
                />
                <TextField
                  label={t('shop.simplbooksItemId')}
                  size='small'
                  fullWidth
                  value={form.simplbooksItemId}
                  onChange={set('simplbooksItemId')}
                />
                <TextField
                  label={t('shop.imageUrl')}
                  size='small'
                  fullWidth
                  value={form.imageUrl}
                  onChange={set('imageUrl')}
                  sx={{ gridColumn: '1 / -1' }}
                />
                <TextField
                  label={t('shop.tags')}
                  size='small'
                  fullWidth
                  value={form.tags}
                  onChange={set('tags')}
                  helperText={t('shop.tagsHint')}
                  sx={{ gridColumn: '1 / -1' }}
                />
              </Box>

              <LocalisedField
                label={t('common.description')}
                multiline
                values={{ en: form.descEn, fi: form.descFi, sv: form.descSv }}
                onChange={(lang, val) =>
                  setForm((f) => ({
                    ...f,
                    descEn: lang === 'en' ? val : f.descEn,
                    descFi: lang === 'fi' ? val : f.descFi,
                    descSv: lang === 'sv' ? val : f.descSv,
                  }))
                }
              />

              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    />
                  }
                  label={t('common.active')}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.isPublished}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          isPublished: e.target.checked,
                        }))
                      }
                    />
                  }
                  label={t('shop.published')}
                />
              </Box>
            </Box>
          )}

          {editing && !isFlightPackageEdit && tabIndex === 1 && (
            <VariantsTab productId={editing.productId} />
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={close}>{t('common.cancel')}</Button>
          {isFlightPackageEdit && (
            <Button
              variant='contained'
              component={Link}
              to='/admin/shop/flight-packages'
              onClick={close}
            >
              {t('shop.admin.goToFlightPackages')}
            </Button>
          )}
          {showDetailsTab && !isFlightPackageEdit && (
            <Button
              variant='contained'
              onClick={handleSave}
              disabled={
                !form.nameEn.trim() || !form.categoryId || !form.price || mutation.isMutating
              }
            >
              {t('common.save')}
            </Button>
          )}
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
