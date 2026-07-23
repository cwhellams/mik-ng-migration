import { Alert, Button } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import useApi from '../../../hooks/useApi'
import { InvoiceListResponse } from '@backend/routes/invoicing/models'
import { RemoteContent } from '../../../components/RemoteContent'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'

export const OverdueInvoiceBanner = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data, isLoading, error } = useApi<InvoiceListResponse>({
    url: 'v1/invoices',
    params: { pastDue: 'true', scope: 'personal' },
  })

  const overdueInvoices = data?.invoices || []
  const hasOverdueInvoices = overdueInvoices.length > 0

  const totalOverdue = overdueInvoices.reduce((sum, invoice) => {
    return sum + parseFloat(invoice.total_sum || '0')
  }, 0)

  const handleViewInvoices = () => {
    navigate('/club/billing')
  }

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      {hasOverdueInvoices && (
        <Alert
          severity='error'
          icon={<WarningAmberIcon />}
          sx={{ mb: 3 }}
          action={
            <Button variant='contained' color='error' size='small' onClick={handleViewInvoices}>
              {t('dashboard.viewInvoices')}
            </Button>
          }
        >
          {t('dashboard.overdueInvoicesWarning', {
            count: overdueInvoices.length,
            amount: totalOverdue.toFixed(2),
            currency: overdueInvoices[0]?.currency || 'EUR',
          })}
        </Alert>
      )}
    </RemoteContent>
  )
}
