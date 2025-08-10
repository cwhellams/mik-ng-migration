import {
  FlightLogListEntry,
  FlightLogStatus,
} from '@backend/routes/flight-log/models'
import { Tooltip, useTheme } from '@mui/material'
import { t } from 'i18next'
import { EditButton } from '../../../components/EditButton'
import { Icon } from '@iconify/react'

type Props = {
  log: FlightLogListEntry
  viewOnly: boolean
  update: (status: FlightLogStatus) => void
}

export const StatusButton = ({ log, viewOnly, update }: Props) => {
  const theme = useTheme()

  switch (log.status) {
    case 'NEW':
      return (
        <EditButton
          title={t('flightLog.status.new')}
          onClick={() => update(FlightLogStatus.VALIDATED)}
          icon='mdi:schedule'
          color='orange'
          width={28}
          viewOnly={viewOnly}
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
      return (
        <Tooltip title={t('flightLog.status.invoiced')}>
          <Icon icon='mdi:invoice-send-outline' color='orange' width={28} />
        </Tooltip>
      )
    case 'PAID':
      return (
        <Tooltip title={t('flightLog.status.paid')}>
          <Icon icon='mdi:invoice-check' color='green' width={28} />
        </Tooltip>
      )
  }
}
