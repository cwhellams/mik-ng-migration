import {
  FlightLog,
  FlightLogStatus,
  FlightLogValidationRequest,
} from '@backend/routes/flight-log/models'
import { Box, Button } from '@mui/material'
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
