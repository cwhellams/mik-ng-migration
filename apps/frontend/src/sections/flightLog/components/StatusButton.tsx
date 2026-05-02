import { FlightLogListEntry } from '@backend/routes/flight-log/models'
import {
  Tooltip,
  useTheme,
  Stack,
  Button,
  CircularProgress,
} from '@mui/material'
import { t } from 'i18next'
import { EditButton } from '../../../components/EditButton'
import { Icon } from '@iconify/react'
import { useRoles } from '../../../hooks/useRoles'
import { useState } from 'react'
import useApi from '../../../hooks/useApi'

type Props = {
  log: FlightLogListEntry
  update?: () => void
}

export const StatusButton = ({ log, update }: Props) => {
  const theme = useTheme()
  const { me, isInvoicingAdmin } = useRoles()
  const [loading, setLoading] = useState(false)
  const { mutation } = useApi({ url: 'v1/invoices' })

  const canDownloadInvoice = () => {
    if (!log.invoiceNumber) return false
    if (isInvoicingAdmin) return true
    return me?.memberId === log.billableMemberId
  }

  const handleDownloadPDF = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!log.invoiceNumber) return
    setLoading(true)
    try {
      const response = await mutation.trigger<undefined, string>(
        'GET',
        undefined,
        `${log.invoiceNumber}/pdf`
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
      link.download = `invoice-${log.invoiceNumber}.pdf`
      link.click()

      URL.revokeObjectURL(url)
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
        <Stack direction='row' spacing={0.5} alignItems='center'>
          <Tooltip title={t('flightLog.status.invoiced')}>
            <Icon icon='mdi:invoice-send-outline' color='orange' width={28} />
          </Tooltip>
          <Button
            onClick={handleDownloadPDF}
            disabled={loading}
            size='small'
            sx={{ minWidth: 'auto', p: 0.5 }}
            title={t('document.download')}
          >
            {loading ? (
              <CircularProgress size={20} />
            ) : (
              <Icon icon='mdi:download' width={20} />
            )}
          </Button>
        </Stack>
      ) : (
        <Tooltip title={t('flightLog.status.invoiced')}>
          <Icon icon='mdi:invoice-send-outline' color='orange' width={28} />
        </Tooltip>
      )
    case 'PAID':
      return canDownloadInvoice() ? (
        <Stack direction='row' spacing={0.5} alignItems='center'>
          <Tooltip title={t('flightLog.status.paid')}>
            <Icon icon='mdi:invoice-check' color='green' width={28} />
          </Tooltip>
          <Button
            onClick={handleDownloadPDF}
            disabled={loading}
            size='small'
            sx={{ minWidth: 'auto', p: 0.5 }}
            title={t('document.download')}
          >
            {loading ? (
              <CircularProgress size={20} />
            ) : (
              <Icon icon='mdi:download' width={20} />
            )}
          </Button>
        </Stack>
      ) : (
        <Tooltip title={t('flightLog.status.paid')}>
          <Icon icon='mdi:invoice-check' color='green' width={28} />
        </Tooltip>
      )
  }
}
