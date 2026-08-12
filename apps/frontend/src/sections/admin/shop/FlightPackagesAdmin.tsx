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
  Typography,
  Divider,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Title } from '../../../components/Title'
import useApi from '../../../hooks/useApi'
import { useSnackbar } from '../../../hooks/useSnackbar'
import { LocalisedTextField, withLocalisedField } from '../../../components/LocalisedTextField'
import { RemoteContent } from '../../../components/RemoteContent'
import type { PrepaidPackage, MemberPackage } from '@backend/routes/prepaid-hours/models'
import type { AircraftListResponse } from '@backend/routes/aircrafts/models'
import type { ItemListResponse } from '@backend/routes/invoicing/models'

interface PackageForm {
  nameEn: string
  nameFi: string
  nameSv: string
  descriptionEn: string
  descriptionFi: string
  descriptionSv: string
  aircraftRegistration: string
  minutesPerPackage: string
  perMinRate: string
  totalPackagesAvailable: string
  maxPerMember: string
  simplbooksItemId: string
  vatPercent: string
  lowStockThreshold: string
  expiresAt: string
  isActive: boolean
}

const today = new Date().toISOString().slice(0, 10)
const emptyForm: PackageForm = {
  nameEn: '',
  nameFi: '',
  nameSv: '',
  descriptionEn: '',
  descriptionFi: '',
  descriptionSv: '',
  aircraftRegistration: '',
  minutesPerPackage: '',
  perMinRate: '',
  totalPackagesAvailable: '',
  maxPerMember: '',
  simplbooksItemId: '',
  vatPercent: '0',
  lowStockThreshold: '',
  expiresAt: today,
  isActive: true,
}

function formatMinutes(minutes: number): string {
  return `${minutes} min`
}

function formatMemberDisplay(memberPackage: MemberPackage): string {
  if (!memberPackage.member) return memberPackage.memberId
  const member = memberPackage.member
  const fullName = `${member.firstName} ${member.lastName}`
  return `${fullName} | ${member.email} | ${member.phoneNumber ?? 'n/a'}`
}

function packageToForm(p: PrepaidPackage): PackageForm {
  return {
    nameEn: p.nameEn ?? '',
    nameFi: p.nameFi ?? '',
    nameSv: p.nameSv ?? '',
    descriptionEn: p.descriptionEn ?? '',
    descriptionFi: p.descriptionFi ?? '',
    descriptionSv: p.descriptionSv ?? '',
    aircraftRegistration: p.aircraftRegistration,
    minutesPerPackage: String(p.minutesPerPackage),
    perMinRate: String(p.perMinRate),
    totalPackagesAvailable: String(p.totalPackagesAvailable),
    maxPerMember: p.maxPerMember == null ? '' : String(p.maxPerMember),
    simplbooksItemId: p.simplbooksItemId ?? '',
    vatPercent: String(p.vatPercent ?? 0),
    lowStockThreshold: p.lowStockThreshold == null ? '' : String(p.lowStockThreshold),
    expiresAt: p.expiresAt.slice(0, 10),
    isActive: p.isActive,
  }
}

function formToPayload(f: PackageForm) {
  return {
    nameEn: f.nameEn,
    nameFi: f.nameFi,
    nameSv: f.nameSv,
    descriptionEn: f.descriptionEn || undefined,
    descriptionFi: f.descriptionFi || undefined,
    descriptionSv: f.descriptionSv || undefined,
    aircraftRegistration: f.aircraftRegistration,
    minutesPerPackage: Number.parseInt(f.minutesPerPackage) || 0,
    perMinRate: Number.parseFloat(f.perMinRate) || 0,
    totalPackagesAvailable: Number.parseInt(f.totalPackagesAvailable) || 0,
    maxPerMember: f.maxPerMember ? Number.parseInt(f.maxPerMember) : null,
    simplbooksItemId: f.simplbooksItemId || null,
    vatPercent: Number.parseFloat(f.vatPercent) || 0,
    lowStockThreshold: f.lowStockThreshold ? Number.parseInt(f.lowStockThreshold) : null,
    expiresAt: f.expiresAt,
    isActive: f.isActive,
  }
}

export default function FlightPackagesAdmin() {
  const { t } = useTranslation()
  const { showSnackbar } = useSnackbar()

  const {
    data: packages,
    mutate: mutatePackages,
    isLoading: packagesLoading,
    error: packagesError,
    mutation: packagesMutation,
  } = useApi<PrepaidPackage[]>({ url: 'v1/prepaid-hours/packages' })
  const {
    data: memberPackages,
    mutate: mutateMemberPackages,
    isLoading: memberPackagesLoading,
    error: memberPackagesError,
  } = useApi<MemberPackage[]>({ url: 'v1/prepaid-hours/member-packages' })
  const { data: aircraftData } = useApi<AircraftListResponse>({
    url: 'v1/aircrafts',
    params: { activeOnly: true },
  })
  const { data: invoiceItemsData } = useApi<ItemListResponse>({
    url: 'v1/invoices/items',
  })
  const activeAircraft = aircraftData?.aircrafts ?? []
  const simplbooksItems = invoiceItemsData?.items ?? []

  const { mutation: extendMutation } = useApi<{ updated: number }>({
    url: 'v1/prepaid-hours/extend-expiry',
    skipFetch: true,
  })

  const [pkgDialogOpen, setPkgDialogOpen] = useState(false)
  const [editingPkg, setEditingPkg] = useState<PrepaidPackage | null>(null)
  const [form, setForm] = useState<PackageForm>(emptyForm)

  const [extendDialogOpen, setExtendDialogOpen] = useState(false)
  const [extendAircraft, setExtendAircraft] = useState('')
  const [extendDays, setExtendDays] = useState('30')

  const [filterAircraft, setFilterAircraft] = useState('')
  const [filterActive, setFilterActive] = useState('all')
  const [filterYear, setFilterYear] = useState('')

  const filterAircraftOptions = [
    ...new Set((packages ?? []).map((p) => p.aircraftRegistration)),
  ].sort((a, b) => a.localeCompare(b))
  const expiryYears = [
    ...new Set((packages ?? []).map((p) => new Date(p.expiresAt).getFullYear().toString())),
  ].sort((a, b) => a.localeCompare(b))
  const filteredPackages = (packages ?? []).filter((p) => {
    if (filterAircraft && p.aircraftRegistration !== filterAircraft) return false
    if (filterActive === 'active' && !p.isActive) return false
    if (filterActive === 'inactive' && p.isActive) return false
    if (filterYear && new Date(p.expiresAt).getFullYear().toString() !== filterYear) return false
    return true
  })

  const memberPackageTotals = Object.values(
    (memberPackages ?? []).reduce<
      Record<
        string,
        {
          aircraft: string
          active: boolean
          remainingMinutes: number
          totalMinutes: number
        }
      >
    >((acc, mp) => {
      const aircraft = mp.package?.aircraftRegistration ?? '–'
      const active = !mp.isExpired
      const key = `${aircraft}:${active ? 'active' : 'inactive'}`
      const current = acc[key] ?? {
        aircraft,
        active,
        remainingMinutes: 0,
        totalMinutes: 0,
      }
      current.remainingMinutes += mp.remainingMinutes
      current.totalMinutes += mp.totalMinutes
      acc[key] = current
      return acc
    }, {}),
  ).sort((a, b) => a.aircraft.localeCompare(b.aircraft) || Number(b.active) - Number(a.active))

  const openCreate = () => {
    setEditingPkg(null)
    setForm(emptyForm)
    setPkgDialogOpen(true)
  }
  const openEdit = (p: PrepaidPackage) => {
    setEditingPkg(p)
    setForm(packageToForm(p))
    setPkgDialogOpen(true)
  }
  const closePkg = () => setPkgDialogOpen(false)

  const set = (key: keyof PackageForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSave = async () => {
    const result = editingPkg
      ? await packagesMutation.trigger('PUT', formToPayload(form), editingPkg.productId)
      : await packagesMutation.trigger('POST', formToPayload(form))
    if (result.error) {
      showSnackbar(t('common.error'), { severity: 'error' })
    } else {
      await mutatePackages()
      showSnackbar(t('common.saved'), { severity: 'success' })
      closePkg()
    }
  }

  const handleExtend = async () => {
    const result = await extendMutation.trigger('POST', {
      aircraftRegistration: extendAircraft,
      daysToAdd: Number.parseInt(extendDays),
    })
    if (result.error) {
      showSnackbar(t('common.error'), { severity: 'error' })
    } else {
      await Promise.all([mutatePackages(), mutateMemberPackages()])
      showSnackbar(
        t('shop.admin.expiryExtended', {
          count: result.data?.updated ?? 0,
        }),
        { severity: 'success' },
      )
      setExtendDialogOpen(false)
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
        <Title label={t('shop.admin.flightPackages')} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant='outlined'
            startIcon={<Icon icon='mdi:calendar-clock' />}
            onClick={() => setExtendDialogOpen(true)}
          >
            {t('shop.admin.extendExpiry')}
          </Button>
          <Button variant='contained' startIcon={<Icon icon='mdi:plus' />} onClick={openCreate}>
            {t('shop.admin.addPackage')}
          </Button>
        </Box>
      </Box>
      <Typography variant='h6' sx={{ mb: 1 }}>
        {t('shop.admin.availablePackages')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size='small' sx={{ minWidth: 150 }}>
          <InputLabel id='package-filter-aircraft-label'>{t('shop.admin.aircraft')}</InputLabel>
          <Select
            labelId='package-filter-aircraft-label'
            value={filterAircraft}
            label={t('shop.admin.aircraft')}
            onChange={(e) => setFilterAircraft(e.target.value)}
          >
            <MenuItem value=''>{t('common.all')}</MenuItem>
            {filterAircraftOptions.map((reg) => (
              <MenuItem key={reg} value={reg}>
                {reg}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size='small' sx={{ minWidth: 140 }}>
          <InputLabel id='package-filter-status-label'>{t('common.status')}</InputLabel>
          <Select
            labelId='package-filter-status-label'
            value={filterActive}
            label={t('common.status')}
            onChange={(e) => setFilterActive(e.target.value)}
          >
            <MenuItem value='all'>{t('common.all')}</MenuItem>
            <MenuItem value='active'>{t('common.active')}</MenuItem>
            <MenuItem value='inactive'>{t('common.inactive')}</MenuItem>
          </Select>
        </FormControl>
        <FormControl size='small' sx={{ minWidth: 130 }}>
          <InputLabel id='package-filter-year-label'>{t('shop.admin.expiresAt')}</InputLabel>
          <Select
            labelId='package-filter-year-label'
            value={filterYear}
            label={t('shop.admin.expiresAt')}
            onChange={(e) => setFilterYear(e.target.value)}
          >
            <MenuItem value=''>{t('common.all')}</MenuItem>
            {expiryYears.map((y) => (
              <MenuItem key={y} value={y}>
                {y}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      <RemoteContent isLoading={packagesLoading} error={packagesError}>
        <TableContainer component={Paper} sx={{ mb: 4 }}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>{t('shop.admin.aircraft')}</TableCell>
                <TableCell>
                  {t('common.name')} / {t('common.description')}
                </TableCell>
                <TableCell>{t('shop.admin.hoursPerPkg')}</TableCell>
                <TableCell>{t('shop.admin.perMinRate')}</TableCell>
                <TableCell>{t('shop.admin.sold')}</TableCell>
                <TableCell>{t('shop.admin.expiresAt')}</TableCell>
                <TableCell>{t('shop.admin.simplbooksId')}</TableCell>
                <TableCell>{t('shop.lowStockThreshold')}</TableCell>
                <TableCell>{t('common.active')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPackages.map((p) => {
                const isSoldOut = p.soldCount >= p.totalPackagesAvailable
                return (
                  <TableRow
                    key={p.productId}
                    hover={!isSoldOut}
                    sx={
                      isSoldOut
                        ? {
                            bgcolor: 'rgba(211, 47, 47, 0.08)',
                            position: 'relative',
                          }
                        : {}
                    }
                  >
                    <TableCell>
                      <strong>{p.aircraftRegistration}</strong>
                    </TableCell>
                    <TableCell sx={{ position: 'relative' }}>
                      <span>{p.nameFi ?? p.nameEn ?? '–'}</span>
                      <br />
                      <Typography
                        variant='caption'
                        sx={{
                          color: 'text.secondary',
                        }}
                      >
                        {p.descriptionFi ?? p.descriptionEn ?? ''}
                      </Typography>
                      {isSoldOut && (
                        <Typography
                          component='span'
                          sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%) rotate(-15deg)',
                            color: 'rgba(211, 47, 47, 0.35)',
                            fontWeight: 900,
                            fontSize: '1.1rem',
                            letterSpacing: 2,
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                            userSelect: 'none',
                          }}
                        >
                          {t('shop.soldOut')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{formatMinutes(p.minutesPerPackage)}</TableCell>
                    <TableCell>€{p.perMinRate}/min</TableCell>
                    <TableCell>
                      {p.soldCount} / {p.totalPackagesAvailable}
                    </TableCell>
                    <TableCell>{new Date(p.expiresAt).toLocaleDateString()}</TableCell>
                    <TableCell>{p.simplbooksItemId ?? t('shop.admin.noSimplbooksItem')}</TableCell>
                    <TableCell>{p.lowStockThreshold ?? '–'}</TableCell>
                    <TableCell>
                      <Chip
                        size='small'
                        label={p.isActive ? t('common.yes') : t('common.no')}
                        color={p.isActive ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align='right'>
                      <IconButton
                        size='small'
                        aria-label={`${t('common.edit')} ${p.aircraftRegistration}`}
                        onClick={() => openEdit(p)}
                      >
                        <Icon icon='mdi:pencil' />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </RemoteContent>
      <Divider sx={{ mb: 3 }} />
      <Typography variant='h6' sx={{ mb: 1 }}>
        {t('shop.admin.memberPackages')}
      </Typography>
      <RemoteContent isLoading={memberPackagesLoading} error={memberPackagesError}>
        <TableContainer component={Paper}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>{t('shop.member')}</TableCell>
                <TableCell>{t('shop.admin.aircraft')}</TableCell>
                <TableCell>{t('shop.admin.remaining')}</TableCell>
                <TableCell>{t('shop.admin.expiresAt')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {memberPackages?.map((mp) => (
                <TableRow key={mp.memberPackageId} hover>
                  <TableCell>{formatMemberDisplay(mp)}</TableCell>
                  <TableCell>{mp.package?.aircraftRegistration ?? '–'}</TableCell>
                  <TableCell>
                    {`${formatMinutes(mp.remainingMinutes)} / ${formatMinutes(mp.totalMinutes)}`}
                  </TableCell>
                  <TableCell>{new Date(mp.expiresAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip
                      size='small'
                      label={mp.isExpired ? t('shop.admin.expired') : t('shop.admin.active')}
                      color={mp.isExpired ? 'error' : 'success'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </RemoteContent>
      <Typography variant='h6' sx={{ mt: 3, mb: 1 }}>
        {t('shop.admin.totalsByAircraft')}
      </Typography>
      <RemoteContent isLoading={memberPackagesLoading} error={memberPackagesError}>
        <TableContainer component={Paper} sx={{ mb: 4 }}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>{t('shop.admin.aircraft')}</TableCell>
                <TableCell>{t('shop.admin.remaining')}</TableCell>
                <TableCell>{t('common.active')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {memberPackageTotals.map((row) => (
                <TableRow key={`${row.aircraft}-${row.active ? 'active' : 'inactive'}`} hover>
                  <TableCell>{row.aircraft}</TableCell>
                  <TableCell>{`${formatMinutes(row.remainingMinutes)} / ${formatMinutes(row.totalMinutes)}`}</TableCell>
                  <TableCell>
                    <Chip
                      size='small'
                      label={row.active ? t('common.yes') : t('common.no')}
                      color={row.active ? 'success' : 'default'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </RemoteContent>
      {/* Package create / edit dialog */}
      <Dialog open={pkgDialogOpen} onClose={closePkg} maxWidth='sm' fullWidth>
        <DialogTitle>
          {editingPkg ? t('shop.admin.editPackage') : t('shop.admin.addPackage')}
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Product name (multilingual) */}
            <LocalisedTextField
              label={t('common.name')}
              required
              values={{ en: form.nameEn, fi: form.nameFi, sv: form.nameSv }}
              onChange={(lang, val) => setForm((f) => withLocalisedField(f, 'name', lang, val))}
            />

            {/* Product description (multilingual) */}
            <LocalisedTextField
              label={t('common.description')}
              multiline
              values={{
                en: form.descriptionEn,
                fi: form.descriptionFi,
                sv: form.descriptionSv,
              }}
              onChange={(lang, val) =>
                setForm((f) => withLocalisedField(f, 'description', lang, val))
              }
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <FormControl size='small' fullWidth required>
                <InputLabel id='package-aircraft-label'>{t('shop.admin.aircraft')}</InputLabel>
                <Select
                  labelId='package-aircraft-label'
                  value={form.aircraftRegistration}
                  label={`${t('shop.admin.aircraft')} *`}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      aircraftRegistration: e.target.value,
                    }))
                  }
                >
                  {activeAircraft.map((a) => (
                    <MenuItem key={a.registration} value={a.registration}>
                      {a.registration}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label={`${t('shop.admin.hoursPerPkg')} *`}
                size='small'
                fullWidth
                type='number'
                value={form.minutesPerPackage}
                onChange={set('minutesPerPackage')}
                slotProps={{
                  htmlInput: { step: '1', min: '1' },
                }}
              />

              <TextField
                label={`${t('shop.admin.perMinRate')} *`}
                size='small'
                fullWidth
                type='number'
                value={form.perMinRate}
                onChange={set('perMinRate')}
                slotProps={{
                  htmlInput: { step: '0.001', min: '0' },
                }}
              />

              <TextField
                label={t('shop.vatPercent')}
                size='small'
                fullWidth
                type='number'
                value={form.vatPercent}
                onChange={set('vatPercent')}
                slotProps={{
                  htmlInput: { step: '1', min: '0' },
                }}
              />

              <TextField
                label={t('shop.admin.totalPrice')}
                size='small'
                fullWidth
                value={
                  form.perMinRate && form.minutesPerPackage
                    ? `€${(Number.parseFloat(form.perMinRate) * Number.parseInt(form.minutesPerPackage)).toFixed(2)}`
                    : '–'
                }
                sx={{ '& .MuiInputBase-input': { color: 'text.secondary' } }}
                slotProps={{
                  input: { readOnly: true },
                }}
              />

              <TextField
                label={`${t('shop.admin.totalQty')} *`}
                size='small'
                fullWidth
                type='number'
                value={form.totalPackagesAvailable}
                onChange={set('totalPackagesAvailable')}
                slotProps={{
                  htmlInput: { min: '1' },
                }}
              />

              <TextField
                label={t('shop.admin.maxPerMember')}
                size='small'
                fullWidth
                type='number'
                value={form.maxPerMember}
                onChange={set('maxPerMember')}
                slotProps={{
                  htmlInput: { min: '1' },
                }}
              />

              <TextField
                label={`${t('shop.admin.expiresAt')} *`}
                size='small'
                fullWidth
                type='date'
                value={form.expiresAt}
                onChange={set('expiresAt')}
                slotProps={{
                  inputLabel: { shrink: true },
                }}
              />

              <FormControl size='small' fullWidth sx={{ gridColumn: '1 / -1' }}>
                <InputLabel id='package-simplbooks-label'>
                  {t('shop.admin.simplbooksId')}
                </InputLabel>
                <Select
                  labelId='package-simplbooks-label'
                  value={form.simplbooksItemId}
                  label={t('shop.admin.simplbooksId')}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      simplbooksItemId: String(e.target.value),
                    }))
                  }
                  displayEmpty
                >
                  <MenuItem value=''>
                    <em>{t('shop.admin.noSimplbooksItem')}</em>
                  </MenuItem>
                  {simplbooksItems
                    .filter((i) => i.active)
                    .map((i) => (
                      <MenuItem key={i.id} value={String(i.id)}>
                        [{i.code}] {i.name}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>

              <TextField
                label={t('shop.lowStockThreshold')}
                size='small'
                fullWidth
                type='number'
                value={form.lowStockThreshold}
                onChange={set('lowStockThreshold')}
                slotProps={{
                  htmlInput: { step: '1', min: '0' },
                }}
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closePkg}>{t('common.cancel')}</Button>
          <Button
            variant='contained'
            onClick={handleSave}
            disabled={
              !form.nameEn ||
              !form.aircraftRegistration ||
              !form.minutesPerPackage ||
              !form.perMinRate ||
              !form.totalPackagesAvailable ||
              packagesMutation.isMutating
            }
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Extend expiry dialog */}
      <Dialog
        open={extendDialogOpen}
        onClose={() => setExtendDialogOpen(false)}
        maxWidth='xs'
        fullWidth
      >
        <DialogTitle>{t('shop.admin.extendExpiry')}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <FormControl size='small' fullWidth required sx={{ mb: 2 }}>
            <InputLabel id='extend-aircraft-label'>{t('shop.admin.aircraft')}</InputLabel>
            <Select
              labelId='extend-aircraft-label'
              value={extendAircraft}
              label={`${t('shop.admin.aircraft')} *`}
              onChange={(e) => setExtendAircraft(e.target.value)}
            >
              {activeAircraft.map((a) => (
                <MenuItem key={a.registration} value={a.registration}>
                  {a.registration}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label={t('shop.admin.daysToAdd')}
            size='small'
            fullWidth
            type='number'
            value={extendDays}
            onChange={(e) => setExtendDays(e.target.value)}
            slotProps={{
              htmlInput: { min: 1 },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExtendDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant='contained'
            onClick={handleExtend}
            disabled={!extendAircraft || !extendDays || extendMutation.isMutating}
          >
            {t('shop.admin.extend')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
