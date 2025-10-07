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
import { Link } from 'react-router-dom'
import { formatDuration } from '../../flightLog/utils/timeUtils'
import { FlightLogListEntry } from '@backend/routes/flight-log/models'

export const FlightTable = ({ flights }: { flights: FlightLogListEntry[] }) => {
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <TableContainer component={Paper}>
      <Table size={isXs ? 'small' : 'medium'}>
        <TableHead sx={{ backgroundColor: theme.palette.grey[200] }}>
          <TableRow>
            <TableCell>{t('schedule.calendarMessages.date')}</TableCell>
            <TableCell>{t('schedule.calendarMessages.time')}</TableCell>
            <TableCell>{t('schedule.duration')}</TableCell>
            <TableCell>{t('schedule.calendarMessages.event')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {flights.map((flight) => {
            const start = dayjs(flight.offBlockTimeUtc)
            const end = dayjs(flight.onBlockTimeUtc)

            return (
              <TableRow key={flight.flightId}>
                <TableCell>
                  <Link to={`/schedule/?day=${start.format('YYYY-MM-DD')}`}>
                    {start.format('DD.MM.')}
                  </Link>
                </TableCell>
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
