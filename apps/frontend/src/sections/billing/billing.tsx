import { InvoiceListResponse } from '@backend/routes/invoicing/models'

import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Stack,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  useMediaQuery,
  useTheme,
  Snackbar,
  Alert,
} from '@mui/material'

import Grid from '@mui/material/Grid'

import { DatePicker } from '@mui/x-date-pickers/DatePicker'

import { t } from 'i18next'
import { useState } from 'react'
import dayjs, { Dayjs } from 'dayjs'
import useApi, { getUrl } from '../../hooks/useApi'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { Icon } from '@iconify/react'
import InvoiceDatesCell from '../../components/DateCombo'
import { RemoteContent } from '../../components/RemoteContent'

const dateFormat = 'YYYY-MM-DD'

const Billing = () => {
  const [startDate, setStartDate] = useState<Dayjs | null>(null)
  const [endDate, setEndDate] = useState<Dayjs | null>(null)
  const [status, setStatus] = useState<'paid' | 'unpaid' | 'all'>('all')
  const [invoiceType, setInvoiceType] = useState<string>('all')
  const [pastDueOnly, setPastDueOnly] = useState<boolean>(false)

  // Construct query params dynamically
  const queryParams = {
    ...(startDate ? { startDate: startDate.format(dateFormat) } : {}),
    ...(endDate ? { endDate: endDate.format(dateFormat) } : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(invoiceType !== 'all' ? { type: invoiceType } : {}),
    ...(pastDueOnly ? { pastDue: 'true' } : {}),
  }

  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarError, setSnackbarError] = useState<string | null>(null)

  const { data, isLoading, error } = useApi<InvoiceListResponse>(
    {
      url: 'v1/invoices',
      params: queryParams,
    },
    {
      // don't clear old data when searching
      keepPreviousData: true,
    }
  )

  const handleDownloadPdf = async (invoiceId: string) => {
    try {
      // If your useApi hook doesn’t expose a call-on-demand option, just use axios directly
      const response = (await getUrl(`v1/invoices/${invoiceId}/pdf`)) as {
        data: {
          data: string
        }
      }

      const base64Pdf = response.data.data
      const byteCharacters = atob(base64Pdf)
      const byteNumbers = Array.from(byteCharacters).map((char) =>
        char.charCodeAt(0)
      )
      const byteArray = new Uint8Array(byteNumbers)

      const blob = new Blob([byteArray], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = `invoice-${invoiceId}.pdf`
      link.click()

      URL.revokeObjectURL(url)
      setSnackbarError(null)
      setSnackbarOpen(true)
    } catch (error) {
      console.log('Error downloading PDF:', error)
      setSnackbarError('Failed to download PDF.')
      setSnackbarOpen(true)
    }
  }

  const setRange = (months: number) => {
    const now = dayjs()
    setEndDate(now)
    setStartDate(now.subtract(months, 'month'))
  }

  const dateFormatter = new Intl.DateTimeFormat('fi-FI', {
    dateStyle: 'medium',
  })
  const currencyFormatter = new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
  })

  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Box sx={{ position: 'relative' }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent='space-between'
          alignItems='center'
          mb={3}
        >
          <Typography variant={isXs ? 'h4' : 'h2'} gutterBottom>
            {t('billing.title', 'Flight Logs')}
          </Typography>
        </Stack>

        <Box sx={{ my: 4 }}>
          {/* Quick Select Buttons */}
          <Stack direction='row' spacing={2} sx={{ mb: 2 }}>
            <Button
              sx={{ textTransform: 'none' }}
              variant='outlined'
              onClick={() => setRange(1)}
            >
              {t('billing.filters.last1Month')}
            </Button>
            <Button
              sx={{ textTransform: 'none' }}
              variant='outlined'
              onClick={() => setRange(3)}
            >
              {t('billing.filters.last3Months')}
            </Button>
            <Button
              sx={{ textTransform: 'none' }}
              variant='outlined'
              onClick={() => setRange(6)}
            >
              {t('billing.filters.last6Months')}
            </Button>
          </Stack>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                disableFuture={true}
                label={t('billing.filters.startDate')}
                value={startDate}
                onChange={(newValue) => setStartDate(newValue)}
                format={t('general.dateFormat')}
                maxDate={endDate || dayjs()}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label={t('billing.filters.endDate')}
                value={endDate}
                onChange={(newValue) => setEndDate(newValue)}
                format={t('general.dateFormat')}
                maxDate={dayjs()}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <FormControl fullWidth>
                <InputLabel shrink>{t('billing.filters.status')}</InputLabel>
                <Select
                  label={t('billing.filters.status')}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                >
                  <MenuItem value='all'>{t('billing.filters.all')}</MenuItem>
                  <MenuItem value='paid'>{t('billing.filters.paid')}</MenuItem>
                  <MenuItem value='unpaid'>
                    {t('billing.filters.unpaid')}
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <FormControl fullWidth>
                <InputLabel shrink>
                  {t('billing.filters.invoiceType')}
                </InputLabel>
                <Select
                  label={t('billing.filters.invoiceType')}
                  value={invoiceType}
                  onChange={(e) => setInvoiceType(e.target.value)}
                >
                  <MenuItem value='all'>{t('billing.filters.all')}</MenuItem>
                  <MenuItem value='ANNUAL_FEE'>
                    {t('billing.invoiceTypes.annualFee')}
                  </MenuItem>
                  <MenuItem value='EQUIPMENT_FEE'>
                    {t('billing.invoiceTypes.equipmentFee')}
                  </MenuItem>
                  <MenuItem value='FLIGHT'>
                    {t('billing.invoiceTypes.flight')}
                  </MenuItem>
                  <MenuItem value='INSTRUCTION'>
                    {t('billing.invoiceTypes.instruction')}
                  </MenuItem>
                  <MenuItem value='MISC'>
                    {t('billing.invoiceTypes.misc')}
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={pastDueOnly}
                    onChange={(e) => setPastDueOnly(e.target.checked)}
                  />
                }
                label={t('billing.filters.pastDueOnly')}
              />
            </Grid>
          </Grid>
        </Box>
        <Box>
          {data && data.invoices.length === 0 && (
            <Typography variant='body1'>No invoices found.</Typography>
          )}
          {data && (
            <Box>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead
                    sx={{
                      '& .MuiTableCell-root': {
                        fontWeight: 'bold',
                        fontSize: '1.1rem',
                        color: 'primary.main',
                      },
                    }}
                  >
                    <TableRow>
                      <TableCell>{t('billing.columns.dueDate')}</TableCell>
                      <TableCell>{t('billing.columns.type')}</TableCell>
                      <TableCell>{t('billing.columns.description')}</TableCell>
                      <TableCell>{t('billing.columns.total')}</TableCell>
                      <TableCell align='center'>
                        {t('billing.columns.status')}
                      </TableCell>
                      <TableCell>PDF</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.invoices.map((invoice) => (
                      <TableRow
                        key={invoice.id}
                        sx={{
                          ...(invoice.is_paid === false &&
                            dayjs(invoice.due_at).isBefore(dayjs(), 'day') && {
                              backgroundColor: (theme) =>
                                theme.palette.mode === 'light'
                                  ? 'rgba(244, 67, 54, 0.08)'
                                  : 'rgba(244, 67, 54, 0.15)',
                              borderLeft: '4px solid rgba(244, 67, 54, 0.3)',
                            }),
                        }}
                      >
                        <InvoiceDatesCell
                          sentAt={invoice.sent_at}
                          dueAt={invoice.due_at}
                          isPastDue={
                            invoice.is_paid === false &&
                            dayjs(invoice.due_at).isBefore(dayjs(), 'day')
                          }
                          dateFormatter={dateFormatter}
                        />
                        <TableCell>{invoice.invoice_type}</TableCell>
                        <TableCell>{invoice.description || '—'}</TableCell>
                        <TableCell>
                          {invoice.total_sum
                            ? currencyFormatter.format(
                                parseFloat(invoice.total_sum)
                              )
                            : '—'}
                        </TableCell>

                        <TableCell align='center'>
                          {invoice.is_paid ? (
                            <Tooltip title='Paid'>
                              <CheckCircleIcon
                                color='success'
                                fontSize='small'
                              />
                            </Tooltip>
                          ) : dayjs(invoice.due_at).isBefore(dayjs(), 'day') ? (
                            <Tooltip title='Unpaid and past due'>
                              <CancelIcon color='error' fontSize='small' />
                            </Tooltip>
                          ) : (
                            <Tooltip title='Unpaid'>
                              <WarningAmberIcon
                                color='warning'
                                fontSize='small'
                              />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              cursor: 'pointer',
                            }}
                            onClick={() => handleDownloadPdf(invoice.id)}
                          >
                            <Icon
                              icon='mdi:file-pdf'
                              width={24}
                              height={24}
                              style={{ color: 'red' }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={4000}
          onClose={() => setSnackbarOpen(false)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnackbarOpen(false)}
            severity={snackbarError ? 'error' : 'success'}
            sx={{ width: '100%' }}
          >
            {snackbarError || 'PDF download started'}
          </Alert>
        </Snackbar>
      </Box>
    </RemoteContent>
  )
}

export default Billing
