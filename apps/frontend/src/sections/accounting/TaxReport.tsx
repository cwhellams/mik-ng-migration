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
} from '@mui/material'
import { Grid } from '@mui/system'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { dayjs } from '../../utils/date'
import type { Dayjs } from 'dayjs'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import Papa from 'papaparse'
import { Download } from '@mui/icons-material'
import { formatHHMM } from '../../utils/format'

interface TaxReportEntry {
  month: string
  aircraftRegistration: string
  commercialBlockMins: number
  commercialFlightMins: number
  privateBlockMins: number
  privateFlightMins: number
  totalBlockMins: number
  totalFlightMins: number
}

interface TaxReportResponse {
  data: TaxReportEntry[]
  filters: {
    startDate: string
    endDate: string
  }
}

export const TaxReport = () => {
  const { t } = useTranslation()
  const [startDate, setStartDate] = useState<Dayjs | null>(
    dayjs().startOf('year')
  )
  const [endDate, setEndDate] = useState<Dayjs | null>(dayjs())
  const [shouldFetch, setShouldFetch] = useState(false)

  const {
    data: reportData,
    isLoading,
    error,
  } = useApi<TaxReportResponse>({
    url: 'v1/tax-reports',
    params:
      shouldFetch && startDate && endDate
        ? {
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
          }
        : {},
    skipFetch: !shouldFetch || !startDate || !endDate,
  })

  const handleGenerateReport = () => {
    if (!startDate || !endDate) {
      return
    }

    // Validate dates
    const today = dayjs()
    if (endDate.isAfter(today, 'day')) {
      return
    }

    if (startDate.isAfter(endDate)) {
      return
    }

    setShouldFetch(true)
  }

  const handleExportCSV = () => {
    if (!reportData?.data) return

    const csvData = reportData.data.map((entry) => ({
      Month: entry.month,
      Aircraft: entry.aircraftRegistration,
      'Commercial Block Time': formatHHMM(entry.commercialBlockMins),
      'Commercial Flight Time': formatHHMM(entry.commercialFlightMins),
      'Private Block Time': formatHHMM(entry.privateBlockMins),
      'Private Flight Time': formatHHMM(entry.privateFlightMins),
      'Total Block Time': formatHHMM(entry.totalBlockMins),
      'Total Flight Time': formatHHMM(entry.totalFlightMins),
    }))

    const csv = Papa.unparse(csvData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `tax-report-${startDate?.format('YYYY-MM-DD')}-${endDate?.format('YYYY-MM-DD')}.csv`
    )
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const getValidationError = (): string | null => {
    if (!startDate || !endDate) {
      return t('invoicing.taxReport.errors.required')
    }

    const today = dayjs()
    if (endDate.isAfter(today, 'day')) {
      return t('invoicing.taxReport.errors.endDateFuture')
    }

    if (startDate.isAfter(endDate)) {
      return t('invoicing.taxReport.errors.startAfterEnd')
    }

    return null
  }

  const validationError = getValidationError()

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <Typography variant='h5' gutterBottom>
          {t('invoicing.taxReport.title')}
        </Typography>
        <Typography
          variant='body2'
          color='text.secondary'
          gutterBottom
          sx={{ mb: 3 }}
        >
          {t('invoicing.taxReport.description')}
        </Typography>

        <Box sx={{ mb: 4 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label={t('invoicing.taxReport.filters.startDate')}
                value={startDate}
                onChange={(newValue) => setStartDate(newValue)}
                format={t('general.dateFormat')}
                disableFuture
                slotProps={{
                  textField: {
                    fullWidth: true,
                  },
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label={t('invoicing.taxReport.filters.endDate')}
                value={endDate}
                onChange={(newValue) => setEndDate(newValue)}
                format={t('general.dateFormat')}
                disableFuture
                slotProps={{
                  textField: {
                    fullWidth: true,
                  },
                }}
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
                {t('invoicing.taxReport.filters.generate')}
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
                  {t('invoicing.taxReport.filters.export')}
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
                    <TableCell>
                      {t('invoicing.taxReport.table.month')}
                    </TableCell>
                    <TableCell>
                      {t('invoicing.taxReport.table.aircraft')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('invoicing.taxReport.table.commercialBlock')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('invoicing.taxReport.table.commercialFlight')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('invoicing.taxReport.table.privateBlock')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('invoicing.taxReport.table.privateFlight')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('invoicing.taxReport.table.totalBlock')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('invoicing.taxReport.table.totalFlight')}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reportData.data.map((row) => (
                    <TableRow key={`${row.month}-${row.aircraftRegistration}`}>
                      <TableCell>{row.month}</TableCell>
                      <TableCell>{row.aircraftRegistration}</TableCell>
                      <TableCell align='right'>
                        {formatHHMM(row.commercialBlockMins)}
                      </TableCell>
                      <TableCell align='right'>
                        {formatHHMM(row.commercialFlightMins)}
                      </TableCell>
                      <TableCell align='right'>
                        {formatHHMM(row.privateBlockMins)}
                      </TableCell>
                      <TableCell align='right'>
                        {formatHHMM(row.privateFlightMins)}
                      </TableCell>
                      <TableCell align='right'>
                        {formatHHMM(row.totalBlockMins)}
                      </TableCell>
                      <TableCell align='right'>
                        {formatHHMM(row.totalFlightMins)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : shouldFetch ? (
            <Alert severity='info'>{t('invoicing.taxReport.noData')}</Alert>
          ) : null}
        </RemoteContent>
      </CardContent>
    </Card>
  )
}
