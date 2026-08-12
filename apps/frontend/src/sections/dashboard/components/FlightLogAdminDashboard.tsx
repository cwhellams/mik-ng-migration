import { AjlbListResponse } from '@mik/contracts/ajlb'
import useApi from '../../../hooks/useApi'
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  List,
  ListItem,
  ListItemText,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Link } from 'react-router'
import { RemoteContent } from '../../../components/RemoteContent'
import { FlightLogListResponse, FlightLogStatus } from '@mik/contracts/flight-log'
import { useThemeMode } from '../../../theme/ThemeContext'
import { useTranslation } from 'react-i18next'
import { useTimezone } from '../../../hooks/useTimezone'

export const FlightLogAdminDashboard = () => {
  const { t } = useTranslation()
  // enable sudo mode when navigating to flight details
  const { toggleSudo } = useThemeMode()
  const { formatDate } = useTimezone()

  // fetch list of aircraft journey log books
  const {
    data: logbooks,
    isLoading,
    error,
  } = useApi<AjlbListResponse>(
    {
      url: 'v1/ajlb',
      alwaysSudo: true,
    },
    {
      revalidateIfStale: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    },
  )

  const logbooksToValidate = logbooks?.books.filter(
    (logbook) => (logbook.view?.newFlightsCount ?? 0) > 0,
  )

  const {
    data: observations,
    isLoading: observationsLoading,
    error: observationsError,
  } = useApi<FlightLogListResponse>(
    {
      url: 'v1/flight-logs',
      alwaysSudo: true,
      params: {
        status: FlightLogStatus.NEW,
        incidentsOrObservations: true,
        orderLatestFirst: true,
        limit: 10,
      },
    },
    {
      // don't clear old data when searching
      keepPreviousData: true,
    },
  )

  return (
    <>
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant='h5'>{t('dashboard.latestFlightsWithIncidents')}</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <RemoteContent isLoading={observationsLoading} error={observationsError}>
            <List>
              {observations?.logs.length === 0 && (
                <Typography>{t('dashboard.noFlightsWithIncidents')}</Typography>
              )}
              {observations?.logs.map((log) => (
                <ListItem key={log.flightId}>
                  <ListItemText
                    primary={
                      <Link to={`/logs/flights/${log.flightId}`} onClick={() => toggleSudo(true)}>
                        {log.aircraftRegistration} - {formatDate(log.takeoffTimeUtc)}
                      </Link>
                    }
                    secondary={log.incidentOrObservations}
                  />
                </ListItem>
              ))}
            </List>
          </RemoteContent>
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant='h5'>{t('dashboard.newFlightsToValidate')}</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <RemoteContent isLoading={isLoading} error={error}>
            <List>
              {logbooksToValidate?.length === 0 && (
                <Typography>{t('dashboard.noNewFlights')}</Typography>
              )}
              {logbooksToValidate?.map((ajlb) => (
                <ListItem key={`${ajlb.aircraftRegistration}-${ajlb.seqNo}`}>
                  <ListItemText
                    primary={
                      <Link
                        to={`/logs/books/${ajlb.aircraftRegistration}/${ajlb.seqNo}?page=${ajlb.view?.newFlightsPage}`}
                        onClick={() => toggleSudo(true)}
                      >
                        {ajlb.aircraftRegistration} - {ajlb.seqNo}
                      </Link>
                    }
                    secondary={t('dashboard.newFlightsSince', {
                      count: ajlb.view?.newFlightsCount,
                      date: formatDate(ajlb.view?.validatedBeforeUTC),
                    })}
                  />
                </ListItem>
              ))}
            </List>
          </RemoteContent>
        </AccordionDetails>
      </Accordion>
    </>
  )
}
