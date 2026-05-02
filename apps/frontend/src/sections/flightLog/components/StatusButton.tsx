import { FlightLogListEntry } from '@backend/routes/flight-log/models'
import { Tooltip, useTheme, IconButton, CircularProgress } from '@mui/material'
import { t } from 'i18next'
import { EditButton } from '../../../components/EditButton'
import { Icon } from '@iconify/react'
import { useRoles } from '../../../hooks/useRoles'
import { useState } from 'react'
import useApi from '../../../hooks/useApi'
import { downloadBase64Pdf } from '../../../lib/pdfDownload'

type Props = {
  log: FlightLogListEntry
  update?: () => void
}

export const StatusButton = ({ log, update }: Props) => {
  const theme = useTheme()
  const { me, isInvoicingAdmin } = useRoles()
  const [loading, setLoading] = useState(false)
  const { mutation } = useApi({ url: 'v1/invoices', skipFetch: true })

  const canDownloadInvoice = () => {
    if (!log.invoiceNumber) return false
    if (isInvoicingAdmin) return true
    return me?.memberId === log.billableMemberId
  }

  const handleDownloadPDF = async () => {
    if (!log.invoiceNumber) return
    setLoading(true)
    try {
      const response = await mutation.trigger<undefined, string>(
        'GET',
        undefined,
        `${log.invoiceNumber}/pdf`
      )

      if (!response.data || response.error) {
        console.error('Failed to fetch invoice PDF:', response.error)
        return
      }

      downloadBase64Pdf({
        base64Data: response.data,
        filename: `invoice-${log.invoiceNumber}.pdf`,
      })
    } catch (error) {
      console.error('Failed to download invoice PDF:', error)
    } finally {
      setLoading(false)
    }
  }

  switch (log.status) {
    case 'NEW':
      return (
        <EditButton
          title={t('flightLog.status.new')}
          onClick={update}
          icon='mdi:schedule'
          color='orange'
          width={28}
          viewOnly={update === undefined}
          sx={{
            backgroundColor: theme.palette.primary.main,
            borderRadius: 2,
          }}
        />
      )

    case 'VALIDATED':
      return (
        <Tooltip title={t('flightLog.status.validated')}>
          <Icon icon='mdi:check' color='green' width={28} />
        </Tooltip>
      )
    case 'INVOICED':
      return canDownloadInvoice() ? (
        <Tooltip
          title={`${t('flightLog.status.invoiced')} - ${t('booking.download')}`}
        >
          <IconButton
            onClick={handleDownloadPDF}
            disabled={loading}
            size='small'
            sx={{ p: 0.5 }}
          >
            {loading ? (
              <CircularProgress size={28} />
            ) : (
              <Icon icon='mdi:invoice-send-outline' color='orange' width={28} />
            )}
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title={t('flightLog.status.invoiced')}>
          <Icon icon='mdi:invoice-send-outline' color='orange' width={28} />
        </Tooltip>
      )
    case 'PAID':
      return canDownloadInvoice() ? (
        <Tooltip
          title={`${t('flightLog.status.paid')} - ${t('booking.download')}`}
        >
          <IconButton
            onClick={handleDownloadPDF}
            disabled={loading}
            size='small'
            sx={{ p: 0.5 }}
          >
            {loading ? (
              <CircularProgress size={28} />
            ) : (
              <Icon icon='mdi:invoice-check' color='green' width={28} />
            )}
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title={t('flightLog.status.paid')}>
          <Icon icon='mdi:invoice-check' color='green' width={28} />
        </Tooltip>
      )
  }
}
