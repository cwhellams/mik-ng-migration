import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Stack,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import useApi from '../../hooks/useApi'
import { Icon } from '@iconify/react'
import { Link } from 'react-router-dom'
import { FlightLogListResponse } from '@backend/routes/flight-log/models'
import { RemoteContent } from '../../components/RemoteContent'
import dayjs from 'dayjs'

const FlightLogLanding = () => {
  const { t } = useTranslation()
  const { data, isLoading, error } = useApi<FlightLogListResponse>({
    url: 'v1/flight-logs',
  })

  // Format date from timestamp to localized format
  const formatDate = (timestamp: string | Date) => {
    return dayjs(timestamp).format('D.M.YY')
  }

  // Format time from timestamp to display format
  const formatTime = (timestamp: string | Date) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Box>
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        mb={3}
      >
        <Typography variant='h2' gutterBottom>
          {t('flightLog.title', 'Flight Logs')}
        </Typography>
        <Button
          variant='contained'
          color='primary'
          startIcon={<Icon icon='mdi:plus' />}
          component={Link}
          to='/flight-logs/new'
        >
          {t('flightLog.newEntry', 'New Entry')}
        </Button>
      </Stack>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t('flightLog.date', 'Date')}</TableCell>
              <TableCell>{t('flightLog.aircraft', 'Aircraft')}</TableCell>
              <TableCell>{t('flightLog.captain', 'Captain')}</TableCell>
              <TableCell>{t('flightLog.departure', 'Departure')}</TableCell>
              <TableCell>{t('flightLog.arrival', 'Arrival')}</TableCell>
              <TableCell>{t('flightLog.blockTime', 'Block Time')}</TableCell>
              <TableCell>{t('flightLog.flightType', 'Type')}</TableCell>
              <TableCell>{t('flightLog.billed', 'Billed')}</TableCell>
              <TableCell>{t('general.actions', 'Actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <RemoteContent isLoading={isLoading} error={error} colSpan={9}>
              {data?.logs?.map((log) => (
                <TableRow key={log.flightId}>
                  <TableCell>{formatDate(log.takeoffTimeUtc)}</TableCell>
                  <TableCell>{log.aircraftRegistration}</TableCell>
                  <TableCell>{log.picMemberId}</TableCell>
                  <TableCell>{log.departureAirport}</TableCell>
                  <TableCell>{log.arrivalAirport}</TableCell>
                  <TableCell>
                    {formatTime(log.offBlockTimeUtc)} -{' '}
                    {formatTime(log.onBlockTimeUtc)}
                  </TableCell>
                  <TableCell>{log.flightType || '-'}</TableCell>
                  <TableCell>
                    {log.isBilled ? (
                      <Icon icon='mdi:check-circle' color='success.main' />
                    ) : (
                      <Icon icon='mdi:close-circle' color='error.main' />
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack direction='row' spacing={1}>
                      <Button
                        size='small'
                        variant='outlined'
                        startIcon={<Icon icon='mdi:eye' />}
                        component={Link}
                        to={`/flight-logs/${log.flightId}`}
                      >
                        {t('general.view', 'View')}
                      </Button>
                      <Button
                        size='small'
                        variant='outlined'
                        color='primary'
                        startIcon={<Icon icon='mdi:pencil' />}
                        component={Link}
                        to={`/flight-logs/${log.flightId}/edit`}
                      >
                        {t('general.edit', 'Edit')}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {(!data?.logs || data.logs.length === 0) && (
                <TableRow>
                  <TableCell colSpan={9} align='center'>
                    <Typography variant='body1' py={3}>
                      {t('flightLog.noLogs', 'No flight logs found')}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </RemoteContent>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default FlightLogLanding
