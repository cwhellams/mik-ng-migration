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
import { FlightLogListEntry } from '@mik/contracts/flight-log'
import { useTimezone } from '../../../hooks/useTimezone'

export const FlightTable = ({ flights }: { flights: FlightLogListEntry[] }) => {
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const { formatDate, formatTime } = useTimezone()

  return (
    <TableContainer component={Paper}>
      <Table size={isXs ? 'small' : 'medium'}>
        <TableHead sx={{ backgroundColor: theme.palette.grey[200] }}>
          <TableRow>
            <TableCell>{t('flightLog.date')}</TableCell>
            <TableCell>{t('flightLog.times')}</TableCell>
            <TableCell>{t('flightLog.duration')}</TableCell>
            <TableCell>{t('flightLog.crews.pic')}</TableCell>
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
                  {formatTime(start.toDate())} - {formatTime(end.toDate())}
                </TableCell>
                <TableCell>{formatDuration(end.diff(start, 'minutes'), true)}</TableCell>
                <TableCell>{flight.picLastName}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
