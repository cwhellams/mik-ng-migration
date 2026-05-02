import {
  FlightLog,
  FlightLogStatus,
  FlightLogValidationRequest,
} from '@backend/routes/flight-log/models'
import { Box, Button, Stack, CircularProgress } from '@mui/material'
import { t } from 'i18next'
import { Link } from 'react-router-dom'
import { FormField } from '../../../components/FormField'
import theme from '../../../theme/theme'
import { Icon } from '@iconify/react'
import { useRoles } from '../../../hooks/useRoles'
import { useState } from 'react'
import useApi from '../../../hooks/useApi'
import { downloadBase64Pdf } from '../../../lib/pdfDownload'

export const StatusDisplay = ({
  log,
  showButton,
  update,
}: {
  log: FlightLog
  showButton: boolean
  update: (payload: FlightLogValidationRequest) => void
}) => {
  const { me, isInvoicingAdmin } = useRoles()
  const [loading, setLoading] = useState(false)
  const { mutation } = useApi({ url: 'v1/invoices', skipFetch: true })

  // Check if user can download invoice (admin or member viewing their own flight)
  const canDownloadInvoice = () => {
    if (!log.invoiceNumber) return false
    // Admin can always download
    if (isInvoicingAdmin) return true
    // Member can download if they are the billed member
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

  return (
    <>
      <FormField label={t('flightLog.status.title')} sx={{ mb: 2 }}>
        {log.status === FlightLogStatus.NEW && (
          <Stack direction={{ xs: 'column', sm: 'row' }}>
            <Box component='span' display='flex' alignItems='center'>
              <Icon
                icon='mdi:schedule'
                color='orange'
                width={28}
                height={28}
                style={{ marginRight: theme.spacing(1) }}
              />
              {t('flightLog.status.new')}
            </Box>

            {showButton && (
              <Button
                onClick={() => update({})}
                variant='outlined'
                startIcon={<Icon icon='mdi:check' color='green' />}
                sx={{ ml: 2 }}
              >
                {t('flightLog.status.validate')}
              </Button>
            )}
          </Stack>
        )}

        {log.status === FlightLogStatus.VALIDATED && (
          <Stack direction={{ xs: 'column', sm: 'row' }}>
            <Box component='span' display='flex' alignItems='center'>
              <Icon
                icon='mdi:check'
                color='green'
                width={28}
                height={28}
                style={{ marginRight: theme.spacing(1) }}
              />
              {t('flightLog.status.validated')}
            </Box>

            {showButton && (
              <Button
                onClick={() => update({ revert: true })}
                variant='outlined'
                startIcon={<Icon icon='mdi:schedule' color='orange' />}
                sx={{ ml: 2 }}
              >
                {t('flightLog.status.unvalidate')}
              </Button>
            )}
          </Stack>
        )}

        {log.status === FlightLogStatus.INVOICED && (
          <Button
            onClick={handleDownloadPDF}
            disabled={loading || !canDownloadInvoice()}
            sx={{
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: canDownloadInvoice() ? 'pointer' : 'default',
              '&:hover': canDownloadInvoice() ? { opacity: 0.7 } : {},
            }}
          >
            {loading ? (
              <CircularProgress size={28} />
            ) : (
              <>
                <Icon
                  icon='mdi:invoice-send-outline'
                  color='orange'
                  width={28}
                  height={28}
                  style={{ marginRight: theme.spacing(1) }}
                />
                {t('flightLog.status.invoiced')}
              </>
            )}
          </Button>
        )}

        {log.status === FlightLogStatus.PAID && (
          <Button
            onClick={handleDownloadPDF}
            disabled={loading || !canDownloadInvoice()}
            sx={{
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: canDownloadInvoice() ? 'pointer' : 'default',
              '&:hover': canDownloadInvoice() ? { opacity: 0.7 } : {},
            }}
          >
            {loading ? (
              <CircularProgress size={28} />
            ) : (
              <>
                <Icon
                  icon='mdi:invoice-check'
                  color='green'
                  width={28}
                  height={28}
                  style={{ marginRight: theme.spacing(1) }}
                />
                {t('flightLog.status.paid')}
              </>
            )}
          </Button>
        )}
      </FormField>

      <FormField label={t('flightLog.logbooks.ajlb')}>
        <Link
          to={`/logs/books/${log.aircraftRegistration}/${log.ajlbSeqNo}?page=${log.ajlbPageNo}#${log.flightId}`}
        >
          {t('flightLog.logbooks.goToFlight', {
            seqNo: log.ajlbSeqNo,
            page: log.ajlbPageNo,
            row: log.ajlbRowNo,
          })}
        </Link>
      </FormField>
    </>
  )
}
