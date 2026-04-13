import {
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  useMediaQuery,
} from '@mui/material'
import dayjs from 'dayjs'
import { t } from 'i18next'
import theme from '../../../theme/theme'
import { formatDuration } from '../../flightLog/utils/timeUtils'
import { FlightLogListEntry } from '@backend/routes/flight-log/models'
import { formatDate } from '../../../utils/date'

export const FlightTable = ({ flights }: { flights: FlightLogListEntry[] }) => {
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <TableContainer component={Paper}>
      <Table size={isXs ? 'small' : 'medium'}>
        <TableHead sx={{ backgroundColor: theme.palette.grey[200] }}>
          <TableRow>
            <TableCell>{t('flightLog.date')}</TableCell>
            <TableCell>{t('flightLog.times')}</TableCell>
            <TableCell>{t('flightLog.duration')}</TableCell>
            <TableCell>{t('flightLog.event')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {flights.map((flight) => {
            const start = dayjs(flight.offBlockTimeUtc)
            const end = dayjs(flight.onBlockTimeUtc)

            return (
              <TableRow key={flight.flightId}>
                <TableCell>{formatDate(start)}</TableCell>
                <TableCell>
                  {start.format('HH:mm')} -{' '}
                  {start.diff(end, 'day') == 0
                    ? end.format('HH:mm')
                    : end.format('DD.MM. HH:mm')}
                </TableCell>
                <TableCell>
                  {formatDuration(end.diff(start, 'minutes'), true)}
                </TableCell>
                <TableCell>{flight.picLastName}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
