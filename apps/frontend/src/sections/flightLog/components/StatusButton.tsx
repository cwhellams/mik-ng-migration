import { FlightLogListEntry } from '@mik/contracts/flight-log'
import { Tooltip, useTheme, IconButton, CircularProgress } from '@mui/material'
import { t } from 'i18next'
import { EditButton } from '../../../components/EditButton'
import { Icon } from '@iconify/react'
import { useInvoicePdfDownload } from '../../../hooks/useInvoicePdfDownload'

type Props = {
  log: FlightLogListEntry
  update?: () => void
}

export const StatusButton = ({ log, update }: Props) => {
  const theme = useTheme()
  const { canDownloadInvoice, handleDownloadPDF, loading } = useInvoicePdfDownload({
    invoiceNumber: log.invoiceNumber,
    billableMemberId: log.billableMemberId,
  })

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
        <Tooltip title={`${t('flightLog.status.invoiced')} - ${t('aircraft.document.download')}`}>
          <IconButton
            onClick={handleDownloadPDF}
            disabled={loading}
            size='small'
            sx={{ p: 0.5 }}
            aria-label={`${t('flightLog.status.invoiced')} - ${t('aircraft.document.download')}`}
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
        <Tooltip title={`${t('flightLog.status.paid')} - ${t('aircraft.document.download')}`}>
          <IconButton
            onClick={handleDownloadPDF}
            disabled={loading}
            size='small'
            sx={{ p: 0.5 }}
            aria-label={`${t('flightLog.status.paid')} - ${t('aircraft.document.download')}`}
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
