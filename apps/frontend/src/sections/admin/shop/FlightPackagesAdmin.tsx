import {
  Alert,
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
  Snackbar,
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
import { RemoteContent } from '../../../components/RemoteContent'
import type {
  PrepaidPackage,
  MemberPackage,
} from '@backend/routes/prepaid-hours/models'
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
    lowStockThreshold:
      p.lowStockThreshold == null ? '' : String(p.lowStockThreshold),
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
    lowStockThreshold: f.lowStockThreshold
      ? Number.parseInt(f.lowStockThreshold)
      : null,
    expiresAt: f.expiresAt,
    isActive: f.isActive,
  }
}

export default function FlightPackagesAdmin() {
  const { t } = useTranslation()

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

  const [snack, setSnack] = useState<{
    msg: string
    sev: 'success' | 'error'
  } | null>(null)

  const [filterAircraft, setFilterAircraft] = useState('')
  const [filterActive, setFilterActive] = useState('all')
  const [filterYear, setFilterYear] = useState('')

  const filterAircraftOptions = [
    ...new Set((packages ?? []).map((p) => p.aircraftRegistration)),
  ].sort((a, b) => a.localeCompare(b))
  const expiryYears = [
    ...new Set(
      (packages ?? []).map((p) =>
        new Date(p.expiresAt).getFullYear().toString()
      )
    ),
  ].sort((a, b) => a.localeCompare(b))
  const filteredPackages = (packages ?? []).filter((p) => {
    if (filterAircraft && p.aircraftRegistration !== filterAircraft)
      return false
    if (filterActive === 'active' && !p.isActive) return false
    if (filterActive === 'inactive' && p.isActive) return false
    if (
      filterYear &&
      new Date(p.expiresAt).getFullYear().toString() !== filterYear
    )
      return false
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
    }, {})
  ).sort(
    (a, b) =>
      a.aircraft.localeCompare(b.aircraft) ||
      Number(b.active) - Number(a.active)
  )

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

  const set =
    (key: keyof PackageForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSave = async () => {
    const result = editingPkg
      ? await packagesMutation.trigger(
          'PUT',
          formToPayload(form),
          editingPkg.productId
        )
      : await packagesMutation.trigger('POST', formToPayload(form))
    if (result.error) {
      setSnack({ msg: t('common.error'), sev: 'error' })
    } else {
      await mutatePackages()
      setSnack({ msg: t('common.saved'), sev: 'success' })
      closePkg()
    }
  }

  const handleExtend = async () => {
    const result = await extendMutation.trigger('POST', {
      aircraftRegistration: extendAircraft,
      daysToAdd: Number.parseInt(extendDays),
    })
    if (result.error) {
      setSnack({ msg: t('common.error'), sev: 'error' })
    } else {
      await Promise.all([mutatePackages(), mutateMemberPackages()])
      setSnack({
        msg: t('shop.admin.expiryExtended', {
          count: result.data?.updated ?? 0,
        }),
        sev: 'success',
      })
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
          <Button
            variant='contained'
            startIcon={<Icon icon='mdi:plus' />}
            onClick={openCreate}
          >
            {t('shop.admin.addPackage')}
          </Button>
        </Box>
      </Box>

      <Typography variant='h6' sx={{ mb: 1 }}>
        {t('shop.admin.availablePackages')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size='small' sx={{ minWidth: 150 }}>
          <InputLabel>{t('shop.admin.aircraft')}</InputLabel>
          <Select
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
          <InputLabel>{t('common.status')}</InputLabel>
          <Select
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
          <InputLabel>{t('shop.admin.expiresAt')}</InputLabel>
          <Select
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
              {filteredPackages.map((p) => (
                <TableRow key={p.productId} hover>
                  <TableCell>
                    <strong>{p.aircraftRegistration}</strong>
                  </TableCell>
                  <TableCell>{formatMinutes(p.minutesPerPackage)}</TableCell>
                  <TableCell>€{p.perMinRate}/min</TableCell>
                  <TableCell>
                    {p.soldCount} / {p.totalPackagesAvailable}
                  </TableCell>
                  <TableCell>
                    {new Date(p.expiresAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {p.simplbooksItemId ?? t('shop.admin.noSimplbooksItem')}
                  </TableCell>
                  <TableCell>{p.lowStockThreshold ?? '–'}</TableCell>
                  <TableCell>
                    <Chip
                      size='small'
                      label={p.isActive ? t('common.yes') : t('common.no')}
                      color={p.isActive ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align='right'>
                    <IconButton size='small' onClick={() => openEdit(p)}>
                      <Icon icon='mdi:pencil' />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </RemoteContent>

      <Divider sx={{ mb: 3 }} />

      <Typography variant='h6' sx={{ mb: 1 }}>
        {t('shop.admin.memberPackages')}
      </Typography>
      <RemoteContent
        isLoading={memberPackagesLoading}
        error={memberPackagesError}
      >
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
                  <TableCell>
                    {mp.package?.aircraftRegistration ?? '–'}
                  </TableCell>
                  <TableCell>
                    {`${formatMinutes(mp.remainingMinutes)} / ${formatMinutes(mp.totalMinutes)}`}
                  </TableCell>
                  <TableCell>
                    {new Date(mp.expiresAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size='small'
                      label={
                        mp.isExpired
                          ? t('shop.admin.expired')
                          : t('shop.admin.active')
                      }
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
      <RemoteContent
        isLoading={memberPackagesLoading}
        error={memberPackagesError}
      >
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
                <TableRow
                  key={`${row.aircraft}-${row.active ? 'active' : 'inactive'}`}
                  hover
                >
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
          {editingPkg
            ? t('shop.admin.editPackage')
            : t('shop.admin.addPackage')}
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Product name (multilingual) */}
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
                color='text.secondary'
                sx={{ display: 'block', mb: 1 }}
              >
                {t('common.name')} *
              </Typography>
              {(['en', 'fi', 'sv'] as const).map((lang, i) => (
                <Box
                  key={lang}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mt: i > 0 ? 1 : 0,
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
                    value={
                      form[
                        `name${lang.charAt(0).toUpperCase() + lang.slice(1)}` as
                          | 'nameEn'
                          | 'nameFi'
                          | 'nameSv'
                      ]
                    }
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [`name${lang.charAt(0).toUpperCase() + lang.slice(1)}`]:
                          e.target.value,
                      }))
                    }
                  />
                </Box>
              ))}
            </Box>

            {/* Product description (multilingual) */}
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
                color='text.secondary'
                sx={{ display: 'block', mb: 1 }}
              >
                {t('common.description')}
              </Typography>
              {(['en', 'fi', 'sv'] as const).map((lang, i) => (
                <Box
                  key={lang}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mt: i > 0 ? 1 : 0,
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
                    multiline
                    minRows={2}
                    value={
                      form[
                        `description${lang.charAt(0).toUpperCase() + lang.slice(1)}` as
                          | 'descriptionEn'
                          | 'descriptionFi'
                          | 'descriptionSv'
                      ]
                    }
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [`description${lang.charAt(0).toUpperCase() + lang.slice(1)}`]:
                          e.target.value,
                      }))
                    }
                  />
                </Box>
              ))}
            </Box>

            <Box
              sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}
            >
              <FormControl size='small' fullWidth required>
                <InputLabel>{t('shop.admin.aircraft')}</InputLabel>
                <Select
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
                inputProps={{ step: '1', min: '1' }}
              />

              <TextField
                label={`${t('shop.admin.perMinRate')} *`}
                size='small'
                fullWidth
                type='number'
                value={form.perMinRate}
                onChange={set('perMinRate')}
                inputProps={{ step: '0.001', min: '0' }}
              />

              <TextField
                label={t('shop.vatPercent')}
                size='small'
                fullWidth
                type='number'
                value={form.vatPercent}
                onChange={set('vatPercent')}
                inputProps={{ step: '1', min: '0' }}
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
                InputProps={{ readOnly: true }}
                sx={{ '& .MuiInputBase-input': { color: 'text.secondary' } }}
              />

              <TextField
                label={`${t('shop.admin.totalQty')} *`}
                size='small'
                fullWidth
                type='number'
                value={form.totalPackagesAvailable}
                onChange={set('totalPackagesAvailable')}
                inputProps={{ min: '1' }}
              />

              <TextField
                label={t('shop.admin.maxPerMember')}
                size='small'
                fullWidth
                type='number'
                value={form.maxPerMember}
                onChange={set('maxPerMember')}
                inputProps={{ min: '1' }}
              />

              <TextField
                label={`${t('shop.admin.expiresAt')} *`}
                size='small'
                fullWidth
                type='date'
                value={form.expiresAt}
                onChange={set('expiresAt')}
                InputLabelProps={{ shrink: true }}
              />

              <FormControl size='small' fullWidth sx={{ gridColumn: '1 / -1' }}>
                <InputLabel>{t('shop.admin.simplbooksId')}</InputLabel>
                <Select
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
                inputProps={{ step: '1', min: '0' }}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isActive: e.target.checked }))
                    }
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
            <InputLabel>{t('shop.admin.aircraft')}</InputLabel>
            <Select
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
            inputProps={{ min: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExtendDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant='contained'
            onClick={handleExtend}
            disabled={
              !extendAircraft || !extendDays || extendMutation.isMutating
            }
          >
            {t('shop.admin.extend')}
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
