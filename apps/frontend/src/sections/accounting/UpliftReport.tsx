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
  Chip,
  Stack,
} from '@mui/material'
import { Grid } from '@mui/system'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { dayjs } from '../../utils/date'
import type { Dayjs } from 'dayjs'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import Papa from 'papaparse'
import { Download, OpenInNew } from '@mui/icons-material'
import { Link } from 'react-router-dom'
import { useTimezone } from '../../hooks/useTimezone'
import type { AircraftListResponse } from '@backend/routes/aircrafts/models'

interface UpliftReportEntry {
  flightId: string
  offBlockTimeUtc: string
  picName: string
  fuelUpliftLitres: number | null
  oilUpliftLitres: number | null
}

interface UpliftReportSummary {
  totalFuelUpliftLitres: number
  totalOilUpliftLitres: number
  fuelTypes: string[]
}

interface UpliftReportResponse {
  data: UpliftReportEntry[]
  summary: UpliftReportSummary
  filters: {
    aircraftRegistration: string
    startDate: string
    endDate: string
  }
}

const QUICK_RANGES = ['1w', '1m', '3m', '12m'] as const
type QuickRange = (typeof QUICK_RANGES)[number]

const quickRangeStart = (range: QuickRange): Dayjs => {
  const now = dayjs()
  switch (range) {
    case '1w':
      return now.subtract(1, 'week')
    case '1m':
      return now.subtract(1, 'month')
    case '3m':
      return now.subtract(3, 'months')
    case '12m':
      return now.subtract(12, 'months')
  }
}

export const UpliftReport = () => {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()
  const [aircraftRegistration, setAircraftRegistration] = useState<string>('')
  const [startDate, setStartDate] = useState<Dayjs | null>(dayjs().subtract(1, 'month'))
  const [endDate, setEndDate] = useState<Dayjs | null>(dayjs())
  const [shouldFetch, setShouldFetch] = useState(false)

  const { data: aircraftData } = useApi<AircraftListResponse>({
    url: 'v1/aircrafts',
    params: { activeOnly: true },
  })

  const {
    data: reportData,
    isLoading,
    error,
  } = useApi<UpliftReportResponse>({
    url: 'v1/uplift-reports',
    params:
      shouldFetch && aircraftRegistration && startDate && endDate
        ? {
            aircraftRegistration,
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
          }
        : {},
    skipFetch: !shouldFetch || !aircraftRegistration || !startDate || !endDate,
  })

  const handleQuickRange = (range: QuickRange) => {
    setStartDate(quickRangeStart(range))
    setEndDate(dayjs())
    setShouldFetch(false)
  }

  const handleGenerateReport = () => {
    if (!aircraftRegistration || !startDate || !endDate) return
    setShouldFetch(true)
  }

  const handleExportCSV = () => {
    if (!reportData?.data) return

    const csvData = reportData.data.map((entry) => ({
      [t('upliftReport.table.dateTime')]: formatDateTime(entry.offBlockTimeUtc),
      [t('upliftReport.table.pic')]: entry.picName,
      [t('upliftReport.table.fuelUplift')]:
        entry.fuelUpliftLitres != null ? entry.fuelUpliftLitres : '',
      [t('upliftReport.table.oilUplift')]:
        entry.oilUpliftLitres != null ? entry.oilUpliftLitres : '',
    }))

    const csv = Papa.unparse(csvData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `uplift-report-${aircraftRegistration}-${startDate?.format('YYYY-MM-DD')}-${endDate?.format('YYYY-MM-DD')}.csv`,
    )
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const getValidationError = (): string | null => {
    if (!aircraftRegistration) return t('upliftReport.errors.aircraftRequired')
    if (!startDate || !endDate) return t('upliftReport.errors.datesRequired')
    if (endDate.isAfter(dayjs(), 'day')) return t('upliftReport.errors.endDateFuture')
    if (startDate.isAfter(endDate)) return t('upliftReport.errors.startAfterEnd')
    return null
  }

  const validationError = getValidationError()

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <Typography variant='h5' gutterBottom>
          {t('upliftReport.title')}
        </Typography>
        <Typography
          variant='body2'
          gutterBottom
          sx={{
            color: 'text.secondary',
            mb: 3,
          }}
        >
          {t('upliftReport.description')}
        </Typography>

        <Box sx={{ mb: 4 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControl fullWidth>
                <InputLabel id='aircraft-label'>{t('upliftReport.filters.aircraft')}</InputLabel>
                <Select
                  labelId='aircraft-label'
                  value={aircraftRegistration}
                  label={t('upliftReport.filters.aircraft')}
                  onChange={({ target }) => {
                    setAircraftRegistration(target.value)
                    setShouldFetch(false)
                  }}
                >
                  {aircraftData?.aircrafts.map((ac) => (
                    <MenuItem key={ac.registration} value={ac.registration}>
                      {ac.registration} – {ac.displayName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label={t('upliftReport.filters.startDate')}
                value={startDate}
                onChange={(newValue) => {
                  setStartDate(newValue)
                  setShouldFetch(false)
                }}
                format={t('general.dateFormat')}
                disableFuture
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label={t('upliftReport.filters.endDate')}
                value={endDate}
                onChange={(newValue) => {
                  setEndDate(newValue)
                  setShouldFetch(false)
                }}
                format={t('general.dateFormat')}
                disableFuture
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Button
                variant='contained'
                onClick={handleGenerateReport}
                disabled={!!validationError}
                fullWidth
                sx={{ height: '56px' }}
              >
                {t('upliftReport.filters.generate')}
              </Button>
            </Grid>
          </Grid>

          <Stack direction='row' spacing={1} sx={{ mt: 2 }}>
            {QUICK_RANGES.map((range) => (
              <Chip
                key={range}
                label={t(`upliftReport.quickRanges.${range}`)}
                onClick={() => handleQuickRange(range)}
                variant='outlined'
                size='small'
                clickable
              />
            ))}
          </Stack>

          {validationError && (
            <Alert severity='error' sx={{ mt: 2 }}>
              {validationError}
            </Alert>
          )}
        </Box>

        <RemoteContent isLoading={isLoading} error={error}>
          {reportData && (
            <>
              {reportData.data.length > 0 ? (
                <>
                  <Box
                    sx={{
                      mb: 2,
                      display: 'flex',
                      gap: 2,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
                      {t('upliftReport.summary.totalFuel', {
                        value: reportData.summary.totalFuelUpliftLitres.toFixed(1),
                      })}
                    </Typography>
                    <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
                      {t('upliftReport.summary.totalOil', {
                        value: reportData.summary.totalOilUpliftLitres.toFixed(1),
                      })}
                    </Typography>
                    {reportData.summary.fuelTypes.length > 0 && (
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 0.5,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <Typography
                          variant='body2'
                          sx={{
                            color: 'text.secondary',
                          }}
                        >
                          {t('upliftReport.summary.fuelTypes')}:
                        </Typography>
                        {reportData.summary.fuelTypes.map((ft) => (
                          <Chip key={ft} label={ft} size='small' />
                        ))}
                      </Box>
                    )}
                    <Box sx={{ ml: 'auto' }}>
                      <Button
                        variant='outlined'
                        startIcon={<Download />}
                        onClick={handleExportCSV}
                        size='small'
                      >
                        {t('upliftReport.filters.export')}
                      </Button>
                    </Box>
                  </Box>

                  <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                    <Table size='small' sx={{ minWidth: { xs: 500, md: 'auto' } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('upliftReport.table.dateTime')}</TableCell>
                          <TableCell>{t('upliftReport.table.pic')}</TableCell>
                          <TableCell align='right'>{t('upliftReport.table.fuelUplift')}</TableCell>
                          <TableCell align='right'>{t('upliftReport.table.oilUplift')}</TableCell>
                          <TableCell align='center'>{t('upliftReport.table.details')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {reportData.data.map((row) => (
                          <TableRow key={row.flightId}>
                            <TableCell>{formatDateTime(row.offBlockTimeUtc)}</TableCell>
                            <TableCell>{row.picName}</TableCell>
                            <TableCell align='right'>
                              {row.fuelUpliftLitres != null
                                ? `${row.fuelUpliftLitres.toFixed(1)} L`
                                : '–'}
                            </TableCell>
                            <TableCell align='right'>
                              {row.oilUpliftLitres != null
                                ? `${row.oilUpliftLitres.toFixed(1)} L`
                                : '–'}
                            </TableCell>
                            <TableCell align='center'>
                              <Button
                                component={Link}
                                to={`/logs/flights/${row.flightId}`}
                                size='small'
                                endIcon={<OpenInNew fontSize='small' />}
                              >
                                {t('upliftReport.table.open')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              ) : shouldFetch ? (
                <Alert severity='info'>{t('upliftReport.noData')}</Alert>
              ) : null}
            </>
          )}
        </RemoteContent>
      </CardContent>
    </Card>
  )
}
