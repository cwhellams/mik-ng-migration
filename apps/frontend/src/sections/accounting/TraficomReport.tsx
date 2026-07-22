import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
} from '@mui/material'
import { Grid } from '@mui/system'
import { dayjs } from '../../utils/date'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import Papa from 'papaparse'
import { Download } from '@mui/icons-material'
import { formatHHMM } from '../../utils/format'

const FILTER_OPTIONS = ['ALL', 'PRIVATE', 'SCHOOL', 'DTO_SCHOOL', 'NON_DTO_SCHOOL'] as const
type TraficomFilter = (typeof FILTER_OPTIONS)[number]

interface TraficomReportEntry {
  aircraftRegistration: string
  flights: number
  landings: number
  zzzzLandings: number
  yearTotalFlightMins: number
  lifetimeTotalFlightMins: number
  lifetimeTotalLandings: number
}

interface TraficomReportResponse {
  data: TraficomReportEntry[]
  filters: {
    year: number
    filter: TraficomFilter
  }
}

export const TraficomReport = () => {
  const { t } = useTranslation()
  // Default to the previous calendar year, since the report is typically run
  // for the previous year.
  const [year, setYear] = useState<number>(dayjs().year() - 1)
  const [filter, setFilter] = useState<TraficomFilter>('ALL')
  const [shouldFetch, setShouldFetch] = useState(false)

  const currentYear = dayjs().year()
  const validationError =
    !Number.isInteger(year) || year < 1900 || year > currentYear
      ? t('invoicing.traficomReport.errors.invalidYear', { max: currentYear })
      : null
  const canFetch = shouldFetch && !validationError

  const {
    data: reportData,
    isLoading,
    error,
  } = useApi<TraficomReportResponse>({
    url: 'v1/traficom-reports',
    params: canFetch ? { year, filter } : {},
    skipFetch: !canFetch,
  })

  const handleGenerateReport = () => {
    if (validationError) return
    setShouldFetch(true)
  }

  const handleExportCSV = () => {
    if (!reportData?.data) return

    const csvData = reportData.data.map((entry) => ({
      [t('invoicing.traficomReport.table.aircraft')]: entry.aircraftRegistration,
      [t('invoicing.traficomReport.table.flights')]: entry.flights,
      [t('invoicing.traficomReport.table.landings')]: entry.landings,
      [t('invoicing.traficomReport.table.zzzzLandings')]: entry.zzzzLandings,
      [t('invoicing.traficomReport.table.yearHours')]: formatHHMM(entry.yearTotalFlightMins),
      [t('invoicing.traficomReport.table.lifetimeHours')]: formatHHMM(
        entry.lifetimeTotalFlightMins,
      ),
      [t('invoicing.traficomReport.table.lifetimeLandings')]: entry.lifetimeTotalLandings,
    }))

    const csv = Papa.unparse(csvData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    link.setAttribute('href', url)
    // Generate filename
    const title = t('invoicing.traficomReport.title')
    const filterLabel = t(`invoicing.traficomReport.filterOptions.${filter}`)
    const toFilenameCompatible = (s: string) => s.toLowerCase().replace(/[^a-z0-9-_]/g, '')

    const filename = `${toFilenameCompatible(title)}-${year}-${toFilenameCompatible(filterLabel)}.csv`

    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <Typography variant='h5' gutterBottom>
          {t('invoicing.traficomReport.title')}
        </Typography>
        <Typography
          variant='body2'
          gutterBottom
          sx={{
            color: 'text.secondary',
            mb: 3,
          }}
        >
          {t('invoicing.traficomReport.description')}
        </Typography>

        <Box sx={{ mb: 4 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                label={t('invoicing.traficomReport.filters.year')}
                type='number'
                value={Number.isFinite(year) ? year : ''}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                fullWidth
                slotProps={{
                  htmlInput: { min: 1900, max: currentYear, step: 1 },
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControl fullWidth>
                <InputLabel id='traficom-filter-label'>
                  {t('invoicing.traficomReport.filters.filter')}
                </InputLabel>
                <Select
                  labelId='traficom-filter-label'
                  value={filter}
                  label={t('invoicing.traficomReport.filters.filter')}
                  onChange={(e) => setFilter(e.target.value as TraficomFilter)}
                >
                  {FILTER_OPTIONS.map((opt) => (
                    <MenuItem key={opt} value={opt}>
                      {t(`invoicing.traficomReport.filterOptions.${opt}`)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Button
                variant='contained'
                onClick={handleGenerateReport}
                disabled={!!validationError}
                fullWidth
                sx={{ height: '56px' }}
              >
                {t('invoicing.traficomReport.filters.generate')}
              </Button>
            </Grid>
            {reportData?.data && reportData.data.length > 0 && (
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Button
                  variant='outlined'
                  startIcon={<Download />}
                  onClick={handleExportCSV}
                  fullWidth
                  sx={{ height: '56px' }}
                >
                  {t('invoicing.traficomReport.filters.export')}
                </Button>
              </Grid>
            )}
          </Grid>

          {validationError && (
            <Alert severity='error' sx={{ mt: 2 }}>
              {validationError}
            </Alert>
          )}
        </Box>

        <RemoteContent isLoading={isLoading} error={error}>
          {reportData?.data && reportData.data.length > 0 ? (
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
              <Table size='small' sx={{ minWidth: { xs: 600, md: 'auto' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('invoicing.traficomReport.table.aircraft')}</TableCell>
                    <TableCell align='right'>
                      {t('invoicing.traficomReport.table.flights')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('invoicing.traficomReport.table.landings')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('invoicing.traficomReport.table.zzzzLandings')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('invoicing.traficomReport.table.yearHours')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('invoicing.traficomReport.table.lifetimeHours')}
                      <Typography
                        variant='caption'
                        sx={{
                          display: 'block',
                          color: 'text.secondary',
                        }}
                      >
                        {t('invoicing.traficomReport.table.lifetimeNote')}
                      </Typography>
                    </TableCell>
                    <TableCell align='right'>
                      {t('invoicing.traficomReport.table.lifetimeLandings')}
                      <Typography
                        variant='caption'
                        sx={{
                          display: 'block',
                          color: 'text.secondary',
                        }}
                      >
                        {t('invoicing.traficomReport.table.lifetimeNote')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reportData.data.map((row) => (
                    <TableRow key={row.aircraftRegistration}>
                      <TableCell>{row.aircraftRegistration}</TableCell>
                      <TableCell align='right'>{row.flights}</TableCell>
                      <TableCell align='right'>{row.landings}</TableCell>
                      <TableCell align='right'>{row.zzzzLandings}</TableCell>
                      <TableCell align='right'>{formatHHMM(row.yearTotalFlightMins)}</TableCell>
                      <TableCell align='right'>{formatHHMM(row.lifetimeTotalFlightMins)}</TableCell>
                      <TableCell align='right'>{row.lifetimeTotalLandings}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : shouldFetch ? (
            <Alert severity='info'>{t('invoicing.traficomReport.noData')}</Alert>
          ) : null}
        </RemoteContent>
      </CardContent>
    </Card>
  )
}
