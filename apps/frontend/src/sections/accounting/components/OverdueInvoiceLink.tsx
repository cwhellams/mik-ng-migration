import { CircularProgress, IconButton, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { useInvoicePdfDownload } from '../../../hooks/useInvoicePdfDownload'

type Props = {
  invoiceId: string
  billableMemberId: string
}

export const OverdueInvoiceLink = ({ invoiceId, billableMemberId }: Props) => {
  const { t } = useTranslation()
  const { canDownloadInvoice, handleDownloadPDF, loading } = useInvoicePdfDownload({
    invoiceNumber: invoiceId,
    billableMemberId,
  })

  if (!canDownloadInvoice()) {
    return null
  }

  return (
    <Tooltip title={t('unpaidOverdueInvoices.viewInvoice')}>
      <span style={{ display: 'inline-flex' }}>
        <IconButton
          onClick={handleDownloadPDF}
          disabled={loading}
          size='small'
          sx={{ p: 0.5 }}
          aria-label={t('unpaidOverdueInvoices.viewInvoice')}
        >
          {loading ? (
            <CircularProgress size={20} />
          ) : (
            <Icon icon='mdi:file-pdf' width={20} height={20} color='red' />
          )}
        </IconButton>
      </span>
    </Tooltip>
  )
}
