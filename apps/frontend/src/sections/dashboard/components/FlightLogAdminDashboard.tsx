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
import type { RecentRemarksResponse } from '@mik/contracts/remarks'
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

  // fetch recent remarks (#1226) -- merged with the incidents/observations list below
  // into one combined widget, rather than a separate accordion of its own.
  const {
    data: recentRemarks,
    isLoading: remarksLoading,
    error: remarksError,
  } = useApi<RecentRemarksResponse>(
    {
      url: 'v1/remarks/recent',
      alwaysSudo: true,
      params: { limit: 10 },
    },
    {
      keepPreviousData: true,
    },
  )

  // One combined, most-recent-first feed: an incident/observation and a remark are
  // both "something noteworthy happened on this flight", just with a different
  // source and no shared id space, so they're normalised to a common shape here
  // rather than shown in two separate lists.
  type NotableFlightItem = {
    key: string
    flightId: string
    aircraftRegistration: string
    takeoffTimeUtc: string
    text: string
  }
  const notableFlights: NotableFlightItem[] | undefined =
    observations && recentRemarks
      ? [
          ...observations.logs.map((log) => ({
            key: `incident-${log.flightId}`,
            flightId: log.flightId,
            aircraftRegistration: log.aircraftRegistration,
            takeoffTimeUtc: log.takeoffTimeUtc,
            text: log.incidentOrObservations ?? '',
          })),
          ...recentRemarks.remarks.map((remark) => ({
            key: `remark-${remark.remarkId}`,
            flightId: remark.flightId,
            aircraftRegistration: remark.aircraftRegistration,
            takeoffTimeUtc: remark.takeoffTimeUtc,
            text: remark.description,
          })),
        ]
          .sort((a, b) => b.takeoffTimeUtc.localeCompare(a.takeoffTimeUtc))
          .slice(0, 10)
      : undefined

  return (
    <>
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant='h5'>{t('dashboard.latestFlightsWithIncidents')}</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <RemoteContent
            isLoading={observationsLoading || remarksLoading}
            error={observationsError ?? remarksError}
          >
            <List>
              {notableFlights?.length === 0 && (
                <Typography>{t('dashboard.noFlightsWithIncidents')}</Typography>
              )}
              {notableFlights?.map((item) => (
                <ListItem key={item.key}>
                  <ListItemText
                    primary={
                      <Link to={`/logs/flights/${item.flightId}`} onClick={() => toggleSudo(true)}>
                        {item.aircraftRegistration} - {formatDate(item.takeoffTimeUtc)}
                      </Link>
                    }
                    secondary={item.text}
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
