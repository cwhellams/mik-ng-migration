import {
  FlightLog,
  FlightLogStatus,
  FlightLogValidationRequest,
} from '@backend/routes/flight-log/models'
import { Box, Button, Stack } from '@mui/material'
import { t } from 'i18next'
import { Link } from 'react-router-dom'
import { FormField } from '../../../components/FormField'
import theme from '../../../theme/theme'
import { Icon } from '@iconify/react'

export const StatusDisplay = ({
  log,
  showButton,
  update,
}: {
  log: FlightLog
  showButton: boolean
  update: (payload: FlightLogValidationRequest) => void
}) => {
  return (
    <>
      <FormField label={t('flightLog.status.title')} sx={{ mb: 2 }}>
        {log.status === FlightLogStatus.NEW && (
          <Stack direction={{ xs: 'column', sm: 'row' }}>
            <Box component='span' display='flex' alignItems='center'>
              <Icon
                icon='mdi:schedule'
                color='orange'
                width={20}
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
                width={20}
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
          <Box component='span' display='flex' alignItems='center'>
            <Icon
              icon='mdi:invoice-send-outline'
              color='orange'
              width={20}
              style={{ marginRight: theme.spacing(1) }}
            />
            {t('flightLog.status.invoiced')}
          </Box>
        )}

        {log.status === FlightLogStatus.PAID && (
          <Box component='span' display='flex' alignItems='center'>
            <Icon
              icon='mdi:invoice-check'
              color='green'
              width={20}
              style={{ marginRight: theme.spacing(1) }}
            />
            {t('flightLog.status.paid')}
          </Box>
        )}
      </FormField>

      {log.status === FlightLogStatus.PAID && (
        <FormField label={t('billing.columns.invoiceId')} sx={{ mb: 2 }}>
          <Link to={`/club/billing`}>{log.invoiceNumber}</Link>
        </FormField>
      )}

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
