import { FlightLog, FlightLogStatus } from '@backend/routes/flight-log/models'
import { Box } from '@mui/material'
import { t } from 'i18next'
import { Link } from 'react-router-dom'
import { FormField } from '../../../components/FormField'
import theme from '../../../theme/theme'
import { Icon } from '@iconify/react'

export const StatusDisplay = ({ log }: { log: FlightLog }) => {
  return (
    <>
      <FormField label={t('flightLog.status.title')} sx={{ mb: 2 }}>
        <Box component='span' sx={{ display: 'flex', alignItems: 'center' }}>
          {log.status === FlightLogStatus.NEW && (
            <>
              <Icon
                icon='mdi:schedule'
                color='orange'
                width={20}
                style={{ marginRight: theme.spacing(1) }}
              />
              {t('flightLog.status.new')}
            </>
          )}

          {log.status === FlightLogStatus.VALIDATED && (
            <>
              <Icon
                icon='mdi:check'
                color='green'
                width={20}
                style={{ marginRight: theme.spacing(1) }}
              />
              {t('flightLog.status.validated')}
            </>
          )}

          {log.status === FlightLogStatus.INVOICED && (
            <>
              <Icon
                icon='mdi:invoice-send-outline'
                color='orange'
                width={20}
                style={{ marginRight: theme.spacing(1) }}
              />
              {t('flightLog.status.invoiced')}
            </>
          )}

          {log.status === FlightLogStatus.PAID && (
            <>
              <Icon
                icon='mdi:invoice-check'
                color='green'
                width={20}
                style={{ marginRight: theme.spacing(1) }}
              />
              {t('flightLog.status.paid')}
            </>
          )}
        </Box>
      </FormField>

      <FormField label={t('flightLog.logbooks.ajlb')}>
        <Link
          to={`/flight-logs?aircraftRegistration=${log.aircraftRegistration}&ajlbSeqNo=${log.ajlbSeqNo}&page=${log.ajlbPageNo}`}
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
