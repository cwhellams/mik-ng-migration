import { InvoiceListResponse } from '@backend/routes/invoicing/models'

import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Stack,
  Button,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material'

import Grid from '@mui/material/Grid'

import { DatePicker } from '@mui/x-date-pickers/DatePicker'

import { t } from 'i18next'
import { useState } from 'react'
import dayjs, { Dayjs } from 'dayjs'
import useApi from '../../hooks/useApi'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { Icon } from '@iconify/react'
import { InvoiceDatesCell } from './components/DateCombo'
import { RemoteContent } from '../../components/RemoteContent'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import { Title } from '../../components/Title'
import { ResponsiveTable } from '../flightLog/components/ResponsiveTable'

const dateFormat = 'YYYY-MM-DD'

const Billing = () => {
  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

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

  const [problem, setProblem] = useState<Problem | undefined>(undefined)

  const { data, isLoading, error, mutation } = useApi<InvoiceListResponse>(
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
      const response = await mutation.trigger<undefined, string>(
        'GET',
        undefined,
        `${invoiceId}/pdf`
      )

      const byteCharacters = atob(response.data!)
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
      setProblem({ status: 200, detail: 'PDF download started' })
    } catch (error) {
      console.log('Error downloading PDF:', error)
      setProblem({ status: 500, detail: 'Failed to download PDF' })
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

  return (
    <Box>
      <Title label={t('billing.title')} />

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
                onChange={(e) => setStatus(e.target.value)}
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
              <InputLabel shrink>{t('billing.filters.invoiceType')}</InputLabel>
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
        <RemoteContent isLoading={isLoading} error={error}>
          <ResponsiveTable
            header={
              <>
                <Grid size={2.5}>{t('billing.columns.dueDate')}</Grid>
                <Grid size={2}>{t('billing.columns.type')}</Grid>
                <Grid size={4}>{t('billing.columns.description')}</Grid>
                <Grid size={1.5}>{t('billing.columns.total')}</Grid>
                <Grid size={1} textAlign='center'>
                  {t('billing.columns.status')}
                </Grid>
                <Grid size={1} textAlign='center'>
                  PDF
                </Grid>
              </>
            }
            notFoundMsg={t('billing.noInvoicesFound')}
            rows={data?.invoices}
            rowProps={(invoice) => {
              const isPastDue =
                invoice.is_paid === false &&
                dayjs(invoice.due_at).isBefore(dayjs(), 'day')

              return {
                borderLeft: '4px solid transparent',
                ...(isPastDue && {
                  backgroundColor:
                    theme.palette.mode === 'light'
                      ? 'rgba(244, 67, 54, 0.08)'
                      : 'rgba(244, 67, 54, 0.15)',
                  borderLeft: '4px solid rgba(244, 67, 54, 0.3)',
                  boxSizing: 'content-box',
                }),
              }
            }}
            row={(invoice) => {
              const isPastDue =
                invoice.is_paid === false &&
                dayjs(invoice.due_at).isBefore(dayjs(), 'day')
              return (
                <>
                  <Grid size={{ xs: 3, md: 2.5 }}>
                    <InvoiceDatesCell
                      sentAt={invoice.sent_at}
                      dueAt={invoice.due_at}
                      isPastDue={isPastDue}
                      dateFormatter={dateFormatter}
                    />
                  </Grid>

                  {isMd ? (
                    <>
                      <Grid size={2}>{invoice.invoice_type}</Grid>
                      <Grid size={4}>{invoice.description || '—'}</Grid>
                      <Grid size={1.5}>
                        {invoice.total_sum
                          ? currencyFormatter.format(
                              parseFloat(invoice.total_sum)
                            )
                          : '—'}
                      </Grid>
                      <Grid size={1} textAlign='center'>
                        {renderStatus(invoice.is_paid, isPastDue)}
                      </Grid>
                      <Grid size={1} textAlign='center'>
                        {downloadIcon(() => handleDownloadPdf(invoice.id))}
                      </Grid>
                    </>
                  ) : (
                    <>
                      <Grid size={6}>
                        <Box>{invoice.invoice_type}</Box>
                        <Box>{invoice.description || '—'}</Box>
                      </Grid>
                      <Grid size={3} alignSelf='start' textAlign='right'>
                        {invoice.total_sum
                          ? currencyFormatter.format(
                              parseFloat(invoice.total_sum)
                            )
                          : '—'}

                        <Box
                          display='flex'
                          alignItems='center'
                          justifyContent='end'
                          mt={1}
                          gap={2}
                        >
                          {renderStatus(invoice.is_paid, isPastDue)}
                          {downloadIcon(() => handleDownloadPdf(invoice.id))}
                        </Box>
                      </Grid>
                    </>
                  )}
                </>
              )
            }}
          />
        </RemoteContent>
      </Box>
      <SnackAlert problem={problem} />
    </Box>
  )
}

const renderStatus = (isPaid: boolean | null, isPastDue: boolean) => {
  return isPaid ? (
    <Tooltip title='Paid'>
      <CheckCircleIcon color='success' fontSize='small' />
    </Tooltip>
  ) : isPastDue ? (
    <Tooltip title='Unpaid and past due'>
      <CancelIcon color='error' fontSize='small' />
    </Tooltip>
  ) : (
    <Tooltip title='Unpaid'>
      <WarningAmberIcon color='warning' fontSize='small' />
    </Tooltip>
  )
}

const downloadIcon = (callback: () => void) => (
  <Icon
    icon='mdi:file-pdf'
    width={24}
    height={24}
    style={{
      color: 'red',
      display: 'inline-flex',
      alignItems: 'center',
      cursor: 'pointer',
    }}
    onClick={callback}
  />
)

export default Billing
