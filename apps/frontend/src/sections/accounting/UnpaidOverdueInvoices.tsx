import { Box, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import type { UnpaidOverdueInvoiceListResponse } from '@backend/routes/invoicing/models'

export const UnpaidOverdueInvoices = () => {
  const { t } = useTranslation()

  const { data, isLoading, error } = useApi<UnpaidOverdueInvoiceListResponse>(
    { url: 'v1/invoices/unpaid-overdue' },
    {
      revalidateIfStale: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  )

  const currencyFormatter = new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
  })

  const totalSum = data?.total_sum ? parseFloat(data.total_sum) : null

  return (
    <Box>
      <Title label={t('unpaidOverdueInvoices.title')} />

      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={3}>{t('unpaidOverdueInvoices.columns.member')}</Grid>
              <Grid size={2}>{t('unpaidOverdueInvoices.columns.dueDate')}</Grid>
              <Grid size={2}>{t('unpaidOverdueInvoices.columns.type')}</Grid>
              <Grid size={3}>{t('unpaidOverdueInvoices.columns.description')}</Grid>
              <Grid size={1} textAlign='right'>
                {t('unpaidOverdueInvoices.columns.sum')}
              </Grid>
              <Grid size={1} textAlign='right'>
                {t('unpaidOverdueInvoices.columns.daysOverdue')}
              </Grid>
            </>
          }
          notFoundMsg={t('unpaidOverdueInvoices.noInvoicesFound')}
          rows={data?.invoices}
          row={(invoice) => (
            <>
              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant='body2'>
                  {invoice.member_last_name}, {invoice.member_first_name}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <Typography variant='body2'>
                  {dayjs(invoice.due_at).format('DD.MM.YYYY')}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <Typography variant='body2'>{invoice.invoice_type}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant='body2'>
                  {invoice.description || '—'}
                </Typography>
              </Grid>
              <Grid
                size={{ xs: 6, md: 1 }}
                textAlign={{ xs: 'left', md: 'right' }}
              >
                <Typography variant='body2'>
                  {invoice.total_sum
                    ? currencyFormatter.format(parseFloat(invoice.total_sum))
                    : '—'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 1 }} textAlign='right'>
                <Typography variant='body2' color='error'>
                  {t('unpaidOverdueInvoices.daysLate', {
                    count: invoice.days_overdue,
                  })}
                </Typography>
              </Grid>
            </>
          )}
        />

        {totalSum !== null && (
          <Box sx={{ mt: 2, textAlign: 'right' }}>
            <Typography variant='h6'>
              {t('unpaidOverdueInvoices.totalSum')}:{' '}
              {currencyFormatter.format(totalSum)}
            </Typography>
          </Box>
        )}
      </RemoteContent>
    </Box>
  )
}
