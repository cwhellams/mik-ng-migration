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
  CircularProgress,
  Button,
  Stack,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import useApi from '../../hooks/useApi'
import { Icon } from '@iconify/react'
import { Link } from 'react-router-dom'
import { FlightLog } from '@backend/routes/flight-log/models'
import { Aircraft } from '@backend/routes/aircrafts/models'

const FlightLogLanding = () => {
  const { t } = useTranslation()
  const { data, isLoading, error } = useApi<{ logs: FlightLog[] }>({
    url: 'v1/flight-log/my-flights',
  })

  const { data: aircraftData } = useApi<Aircraft[]>({
    url: 'v1/aircrafts',
  })
  console.log('AD DATA', aircraftData)

  // Format date from timestamp to localized format
  const formatDate = (timestamp: string | Date) => {
    return new Date(timestamp).toLocaleDateString()
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

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress size={40} />
        </Box>
      ) : error ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color='error'>
            {t('error.failedToLoad', 'Failed to load flight logs')}
          </Typography>
        </Paper>
      ) : (
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
              {data?.logs?.map((log) => (
                <TableRow key={log.flight_id}>
                  <TableCell>{formatDate(log.takeoff_time_utc)}</TableCell>
                  <TableCell>{log.aircraft_registration}</TableCell>
                  <TableCell>{log.captain}</TableCell>
                  <TableCell>{log.departure_airport}</TableCell>
                  <TableCell>{log.arrival_airport}</TableCell>
                  <TableCell>
                    {formatTime(log.off_block_time_utc)} -{' '}
                    {formatTime(log.on_block_time_utc)}
                  </TableCell>
                  <TableCell>{log.flight_type || '-'}</TableCell>
                  <TableCell>
                    {log.is_billed ? (
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
                        to={`/flight-logs/${log.flight_id}`}
                      >
                        {t('general.view', 'View')}
                      </Button>
                      <Button
                        size='small'
                        variant='outlined'
                        color='primary'
                        startIcon={<Icon icon='mdi:pencil' />}
                        component={Link}
                        to={`/flight-logs/${log.flight_id}/edit`}
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
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

export default FlightLogLanding
