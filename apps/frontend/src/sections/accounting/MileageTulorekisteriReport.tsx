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
  Link as MuiLink,
} from '@mui/material'
import { Grid } from '@mui/system'
import { Link } from 'react-router'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { dayjs } from '../../utils/date'
import type { Dayjs } from 'dayjs'
import Papa from 'papaparse'
import { Download } from '@mui/icons-material'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { formatExpenseAmount } from '../expenses/expenseUi'
import type { MileageReportResponse } from '@backend/routes/expenses/models'

// Never fetches or renders HETU — this is a worklist of claims to file with
// Tulorekisteri, not the filing itself. HETU is only available per-claim via
// the reveal button on the claim's admin detail page (issue #1022).
export const MileageTulorekisteriReport = () => {
  const { t } = useTranslation()
  const [startDate, setStartDate] = useState<Dayjs | null>(dayjs().startOf('month'))
  const [endDate, setEndDate] = useState<Dayjs | null>(dayjs())
  const [shouldFetch, setShouldFetch] = useState(false)

  const {
    data: reportData,
    isLoading,
    error,
  } = useApi<MileageReportResponse>({
    url: 'v1/expenses/admin/mileage-report',
    params:
      shouldFetch && startDate && endDate
        ? {
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
          }
        : {},
    skipFetch: !shouldFetch || !startDate || !endDate,
  })

  const getValidationError = (): string | null => {
    if (!startDate || !endDate) {
      return t('expenses.tulorekisteriReport.errors.required')
    }
    if (endDate.isAfter(dayjs(), 'day')) {
      return t('expenses.tulorekisteriReport.errors.endDateFuture')
    }
    if (startDate.isAfter(endDate)) {
      return t('expenses.tulorekisteriReport.errors.startAfterEnd')
    }
    return null
  }

  const validationError = getValidationError()

  const handleGenerateReport = () => {
    if (validationError) return
    setShouldFetch(true)
  }

  const handleExportCSV = () => {
    if (!reportData?.data) return

    const csvData = reportData.data.map((row) => ({
      Member: row.memberName,
      'Journey date': row.journeyDate,
      Route: row.route,
      'Distance (km)': row.distanceKm,
      'Rate (€/km)': row.ratePerKm,
      'Total (EUR)': row.totalAmount,
      'Approved at': row.approvedAt ?? '',
      IBAN: row.iban ?? '',
      'Claim ID': row.claimId,
    }))

    const csv = Papa.unparse(csvData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `tulorekisteri-mileage-report-${startDate?.format('YYYY-MM-DD')}-${endDate?.format('YYYY-MM-DD')}.csv`,
    )
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
          {t('expenses.tulorekisteriReport.title')}
        </Typography>
        <Typography variant='body2' gutterBottom sx={{ color: 'text.secondary', mb: 3 }}>
          {t('expenses.tulorekisteriReport.description')}
        </Typography>

        <Box sx={{ mb: 4 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label={t('expenses.tulorekisteriReport.filters.startDate')}
                value={startDate}
                onChange={(newValue) => setStartDate(newValue)}
                format={t('general.dateFormat')}
                disableFuture
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label={t('expenses.tulorekisteriReport.filters.endDate')}
                value={endDate}
                onChange={(newValue) => setEndDate(newValue)}
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
                {t('expenses.tulorekisteriReport.filters.generate')}
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
                  {t('expenses.tulorekisteriReport.filters.export')}
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
                    <TableCell>{t('expenses.tulorekisteriReport.table.member')}</TableCell>
                    <TableCell>{t('expenses.tulorekisteriReport.table.journeyDate')}</TableCell>
                    <TableCell>{t('expenses.tulorekisteriReport.table.route')}</TableCell>
                    <TableCell align='right'>
                      {t('expenses.tulorekisteriReport.table.distanceKm')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('expenses.tulorekisteriReport.table.totalAmount')}
                    </TableCell>
                    <TableCell>{t('expenses.tulorekisteriReport.table.approvedAt')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reportData.data.map((row) => (
                    <TableRow key={row.claimId}>
                      <TableCell>{row.memberName}</TableCell>
                      <TableCell>{row.journeyDate}</TableCell>
                      <TableCell>{row.route}</TableCell>
                      <TableCell align='right'>{row.distanceKm}</TableCell>
                      <TableCell align='right'>{formatExpenseAmount(row.totalAmount)}</TableCell>
                      <TableCell>
                        <MuiLink component={Link} to={`/accounting/expenses/${row.claimId}`}>
                          {row.approvedAt ? new Date(row.approvedAt).toLocaleDateString() : '—'}
                        </MuiLink>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : shouldFetch ? (
            <Alert severity='info'>{t('expenses.tulorekisteriReport.noData')}</Alert>
          ) : null}
        </RemoteContent>
      </CardContent>
    </Card>
  )
}
