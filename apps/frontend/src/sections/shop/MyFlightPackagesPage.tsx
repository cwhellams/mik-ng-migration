import {
  Alert,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type {
  UnbilledTimeByAircraft,
  MemberPackage,
} from '@backend/routes/prepaid-hours/models'
import type { EquipmentFeeStatus } from '@backend/routes/invoicing/models'
import { Icon } from '@iconify/react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Title } from '../../components/Title'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'

function formatMinutes(minutes: number): string {
  return `${minutes} min`
}

function resolveLanguage(language: string): 'fi' | 'sv' | 'en' {
  if (language.startsWith('fi')) return 'fi'
  if (language.startsWith('sv')) return 'sv'
  return 'en'
}

export default function MyFlightPackagesPage() {
  const { t, i18n } = useTranslation()
  const lang = resolveLanguage(i18n.language)

  const {
    data: memberPackages,
    isLoading,
    error,
  } = useApi<MemberPackage[]>({ url: 'v1/prepaid-hours/member-packages' })

  const { data: unbilledTime } = useApi<UnbilledTimeByAircraft[]>({
    url: 'v1/prepaid-hours/unbilled-time',
  })

  const { data: equipmentFeeStatus } = useApi<EquipmentFeeStatus>({
    url: 'v1/invoices/equipmentFeeStatus',
  })

  const activePackages = (memberPackages ?? []).filter((mp) => !mp.isExpired)
  const historicalPackages = (memberPackages ?? []).filter((mp) => mp.isExpired)

  const localPackageName = (pkg: MemberPackage['package']): string => {
    if (!pkg) return '-'
    if (lang === 'fi') return pkg.nameFi ?? pkg.nameEn ?? '-'
    if (lang === 'sv') return pkg.nameSv ?? pkg.nameEn ?? '-'
    return pkg.nameEn ?? '-'
  }

  const renderTable = (rows: MemberPackage[]) => (
    <TableContainer component={Paper}>
      <Table size='small'>
        <TableHead>
          <TableRow>
            <TableCell>{t('common.name')}</TableCell>
            <TableCell>{t('shop.admin.aircraft')}</TableCell>
            <TableCell>{t('shop.admin.perMinRate')}</TableCell>
            <TableCell>{t('shop.admin.remaining')}</TableCell>
            <TableCell>{t('shop.admin.unbilledMins')}</TableCell>
            <TableCell>{t('shop.admin.remainingAfterInvoicing')}</TableCell>
            <TableCell>{t('shop.admin.expiredMins')}</TableCell>
            <TableCell>{t('shop.admin.expiresAt')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.memberPackageId} hover>
              <TableCell>{localPackageName(row.package)}</TableCell>
              <TableCell>{row.package?.aircraftRegistration ?? '-'}</TableCell>
              <TableCell>
                {row.package?.perMinRate == null
                  ? '-'
                  : `€${row.package.perMinRate}/min`}
              </TableCell>
              <TableCell>{`${formatMinutes(row.remainingMinutes)} / ${formatMinutes(row.totalMinutes)}`}</TableCell>
              <TableCell>
                {row.unbilledMinutes == null
                  ? '-'
                  : formatMinutes(row.unbilledMinutes)}
              </TableCell>
              <TableCell>
                {row.unbilledMinutes == null
                  ? '-'
                  : formatMinutes(
                      Math.max(0, row.remainingMinutes - row.unbilledMinutes)
                    )}
              </TableCell>
              <TableCell>
                {row.isExpired
                  ? formatMinutes(row.remainingMinutes)
                  : t('common.notApplicable')}
              </TableCell>
              <TableCell>
                {new Date(row.expiresAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  return (
    <Box>
      <Title label={t('shop.myFlightPackages')} />

      <Button
        component={Link}
        to='/shop'
        startIcon={<Icon icon='mdi:arrow-left' />}
        sx={{ mb: 2 }}
      >
        {t('shop.continueShopping')}
      </Button>

      {equipmentFeeStatus != null && !equipmentFeeStatus.hasPaid && (
        <Alert severity='warning' sx={{ mb: 3 }}>
          {t('shop.equipmentFeeWarning', { year: equipmentFeeStatus.year })}
        </Alert>
      )}

      {(unbilledTime?.length ?? 0) > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant='h6' sx={{ mb: 1 }}>
            {t('shop.admin.unbilledFlightsByAircraft')}
          </Typography>
          <TableContainer component={Paper}>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>{t('shop.admin.aircraft')}</TableCell>
                  <TableCell>{t('shop.admin.airborneMins')}</TableCell>
                  <TableCell>{t('shop.admin.blockMins')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(unbilledTime ?? []).map((row) => (
                  <TableRow key={row.aircraftRegistration} hover>
                    <TableCell>{row.aircraftRegistration}</TableCell>
                    <TableCell>{formatMinutes(row.airborneMinutes)}</TableCell>
                    <TableCell>{formatMinutes(row.blockMinutes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <RemoteContent isLoading={isLoading} error={error}>
        {!isLoading && (memberPackages?.length ?? 0) === 0 && (
          <Alert severity='info' sx={{ mb: 2 }}>
            {t('shop.noFlightPackages')}
          </Alert>
        )}

        {!isLoading && (memberPackages?.length ?? 0) === 0 && (
          <Button component={Link} to='/shop' variant='contained'>
            {t('shop.shopNow')}
          </Button>
        )}

        {activePackages.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Typography variant='h6' sx={{ mb: 1 }}>
              {t('shop.currentFlightPackages')}
            </Typography>
            {renderTable(activePackages)}
          </Box>
        )}

        {historicalPackages.length > 0 && (
          <Box>
            <Typography variant='h6' sx={{ mb: 1 }}>
              {t('shop.historicalFlightPackages')}
            </Typography>
            {renderTable(historicalPackages)}
          </Box>
        )}
      </RemoteContent>
    </Box>
  )
}
