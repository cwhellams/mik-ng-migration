import {
  Box,
  Grid,
  Button,
  useMediaQuery,
  useTheme,
  Pagination,
  PaginationItem,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import useApi from '../../hooks/useApi'
import { Icon } from '@iconify/react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  FlightLog,
  FlightLogFilters,
  FlightLogListResponse,
} from '@backend/routes/flight-log/models'
import { RemoteContent } from '../../components/RemoteContent'
import { FlightLogQuery } from './components/FlightLogQuery'
import { formatTime } from '../../utils/date'
import { useRoles } from '../../hooks/useRoles'
import { useScrollOnRender } from '../../hooks/useScrollOnRender'
import { useEffect, useState } from 'react'
import { StatusButton } from './components/StatusButton'
import { Title } from '../../components/Title'
import {
  ViewMobileFlightTime,
  ViewFlightDate,
  ViewMobileFlightDetails,
  ViewMobileCrew,
} from './components/FlightListEntry'
import { ResponsiveTable } from '../../components/ResponsiveTable'

const FlightLogsList = () => {
  const { t } = useTranslation()

  const { me, isFlightLogAdmin } = useRoles()

  const [searchParams, setSearchParams] = useSearchParams()
  const scrollToRef = useScrollOnRender()

  const [filters, setFilters] = useState<FlightLogFilters>({
    limit: 10,
    page: searchParams.get('page')
      ? Number(searchParams.get('page'))
      : undefined,
    aircraftRegistration: searchParams.get('aircraftRegistration') ?? undefined,
  })

  useEffect(() => {
    const aircraftRegistration =
      searchParams.get('aircraftRegistration') ?? undefined
    const page = searchParams.get('page')
      ? Number(searchParams.get('page'))
      : undefined

    setFilters((old) => ({
      ...old,
      aircraftRegistration,
      page,
    }))
  }, [searchParams])

  const { data, isLoading, error } = useApi<FlightLogListResponse, FlightLog>(
    {
      url: 'v1/flight-logs',
      params: filters,
    },
    {
      // don't clear old data when searching
      keepPreviousData: true,
    }
  )

  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  return (
    <Box>
      <Title label={t('flightLog.title')}>
        <Button
          variant='contained'
          color='primary'
          startIcon={<Icon icon='mdi:plus' />}
          component={Link}
          to='/logs/flights/new'
        >
          {t('flightLog.newEntry', 'New Entry')}
        </Button>
      </Title>

      <Grid
        size={12}
        direction='column'
        display='flex'
        justifyContent={'flex-start'}
        flexDirection={{ xs: 'column', sm: 'row' }}
        sx={{ mb: 3 }}
      >
        <FlightLogQuery
          registration={filters.aircraftRegistration}
          setFilters={(filters: FlightLogFilters) => {
            setSearchParams({
              aircraftRegistration: filters.aircraftRegistration ?? '',
            })
          }}
        />
      </Grid>

      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={1.3}>{t('flightLog.date')}</Grid>
              <Grid size={1}>{t('flightLog.aircraft')}</Grid>
              <Grid size={1.7}>{t('flightLog.crews.pic')}</Grid>
              <Grid size={1.7}>{t('flightLog.logbooks.student')}</Grid>
              <Grid size={0.5}>PoB</Grid>
              <Grid size={1}>{t('flightLog.departure')}</Grid>
              <Grid size={1}>{t('flightLog.arrival')}</Grid>
              <Grid size={1.1}>{t('flightLog.duration')}</Grid>
              <Grid size={0.8}>{t('flightLog.landings')}</Grid>
              <Grid size={1.5}>{t('flightLog.flightType')}</Grid>
              <Grid size={0.4} sx={{ textAlign: 'end' }}>
                {t('flightLog.logbooks.status')}
              </Grid>
            </>
          }
          notFoundMsg={t('flightLog.noLogs')}
          rows={data?.logs ?? []}
          rowProps={() => ({
            minHeight: 75,
          })}
          row={(log) => (
            <>
              <Grid size={{ xs: 3, md: 1.3 }}>
                <ViewFlightDate
                  flightId={log.flightId}
                  date={log.offBlockTimeUtc}
                  link={
                    isFlightLogAdmin || log.billableMemberId == me?.memberId
                  }
                  state={`?${searchParams.toString()}`}
                  ref={
                    location.hash == `#${log.flightId}`
                      ? scrollToRef
                      : undefined
                  }
                />
              </Grid>

              {isMd ? (
                <>
                  <Grid size={1}>{log.aircraftRegistration}</Grid>

                  <Grid size={1.7}>
                    <Box>{log.picLastName}</Box>
                  </Grid>
                  <Grid size={1.7}>
                    <Box>{log.crew2LastName}</Box>
                  </Grid>
                  <Grid size={0.5}>
                    <Box>{log.personsOnBoard}</Box>
                  </Grid>

                  <Grid size={1}>
                    <Box>{log.departureAirport}</Box>
                    <Box color='text.secondary'>
                      {formatTime(log.offBlockTimeUtc)}
                    </Box>
                    <Box color='text.secondary'>
                      {formatTime(log.takeoffTimeUtc)}
                    </Box>
                  </Grid>

                  <Grid size={1}>
                    <Box>{log.arrivalAirport}</Box>
                    <Box color='text.secondary'>
                      {formatTime(log.landingTimeUtc)}
                    </Box>
                    <Box color='text.secondary'>
                      {formatTime(log.onBlockTimeUtc)}
                    </Box>
                  </Grid>

                  <Grid size={1.1}>
                    {log.flightTime}
                    <Box>{log.blockTime}</Box>
                  </Grid>

                  <Grid size={0.8}>{log.numberOfLandings}</Grid>

                  <Grid size={1.5}>
                    {t(`flightLog.flightTypes.${log.flightType}`)}
                  </Grid>

                  <Grid size={0.4} alignSelf='top' justifyItems='end'>
                    <StatusButton log={log} />
                  </Grid>
                </>
              ) : (
                <>
                  {
                    // give more room to action buttons by leaving registration out when synching
                    <Grid size={3}>{log.aircraftRegistration}</Grid>
                  }

                  <ViewMobileFlightDetails
                    size={6}
                    numberOfLandings={log.numberOfLandings}
                    flightType={log.flightType}
                  >
                    <StatusButton log={log} />
                  </ViewMobileFlightDetails>

                  <ViewMobileCrew
                    size={4}
                    personsOnBoard={log.personsOnBoard}
                    crew={[log.picLastName, log.crew2LastName]}
                  />
                  <ViewMobileFlightTime
                    size={8}
                    departureAirport={log.departureAirport}
                    arrivalAirport={log.arrivalAirport}
                    offBlockTimeUtc={log.offBlockTimeUtc}
                    takeoffTimeUtc={log.takeoffTimeUtc}
                    landingTimeUtc={log.landingTimeUtc}
                    onBlockTimeUtc={log.onBlockTimeUtc}
                    flightTime={log.flightTime}
                    secondaryTime={log.blockTime}
                  />
                </>
              )}
            </>
          )}
        />
      </RemoteContent>

      <Pagination
        count={data?.pages ?? 1}
        size='large'
        page={filters.page ?? data?.page ?? 1}
        onChange={(_, page) => {
          searchParams.set('page', page.toString())
          setSearchParams(searchParams)
        }}
        showFirstButton={true}
        showLastButton={true}
        siblingCount={2}
        sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}
        renderItem={(item) => {
          if (item.type === 'page' && item.page !== null) {
            return <PaginationItem {...item} page={item.page} />
          }
          return <PaginationItem {...item} />
        }}
      />
    </Box>
  )
}

export default FlightLogsList
