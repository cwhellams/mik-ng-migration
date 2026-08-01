import {
  Box,
  Grid,
  Button,
  IconButton,
  useMediaQuery,
  useTheme,
  Pagination,
  PaginationItem,
  Tooltip,
  Typography,
  Divider,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import useApi from '../../hooks/useApi'
import { Icon } from '@iconify/react'
import AirplaneTicketOutlinedIcon from '@mui/icons-material/AirplaneTicketOutlined'
import { Link, useSearchParams } from 'react-router'
import {
  FlightLog,
  FlightLogFilters,
  FlightLogListResponse,
} from '@backend/routes/flight-log/models'
import { RemoteContent } from '../../components/RemoteContent'
import { FlightLogQuery } from './components/FlightLogQuery'
import { useRoles } from '../../hooks/useRoles'
import { useScrollOnRender } from '../../hooks/useScrollOnRender'
import { useEffect, useState } from 'react'
import { StatusButton } from './components/StatusButton'
import { Title } from '../../components/Title'
import { FlightLogBanner, FlightLogDate, FlightLogTimeline } from './components/FlightListEntry'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { FlightLogExportDialog } from './components/FlightLogExportDialog'

const formatEur = (value: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' }).format(value)

const FlightLogsList = () => {
  const { t } = useTranslation()

  const { me, isFlightLogAdmin } = useRoles()

  const [searchParams, setSearchParams] = useSearchParams()
  const scrollToRef = useScrollOnRender()

  const [filters, setFilters] = useState<FlightLogFilters>({
    limit: 10,
    page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
    aircraftRegistration: searchParams.get('aircraftRegistration') ?? undefined,
  })

  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    const aircraftRegistration = searchParams.get('aircraftRegistration') ?? undefined
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined

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
    },
  )

  const theme = useTheme()
  const isSmUp = useMediaQuery(theme.breakpoints.up('sm'))

  return (
    <Box>
      <Title label={t('flightLog.title')} />
      <FlightLogExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        defaultAircraftRegistration={filters.aircraftRegistration}
      />
      <Grid
        size={12}
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          mb: 3,
        }}
      >
        <FlightLogQuery
          registration={filters.aircraftRegistration}
          setFilters={(filters: FlightLogFilters) => {
            setSearchParams({
              aircraftRegistration: filters.aircraftRegistration ?? '',
            })
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={t('flightLog.export.button')}>
            <IconButton
              onClick={() => setExportOpen(true)}
              aria-label={t('flightLog.export.button')}
            >
              <Icon icon='mdi:export' />
            </IconButton>
          </Tooltip>
          {isSmUp ? (
            <Button
              variant='contained'
              color='primary'
              startIcon={<AirplaneTicketOutlinedIcon />}
              component={Link}
              to='/logs/flights/new'
            >
              {t('flightLog.newEntry', 'New Entry')}
            </Button>
          ) : (
            <Tooltip title={t('flightLog.newEntry', 'New Entry')}>
              <IconButton
                component={Link}
                to='/logs/flights/new'
                aria-label={t('flightLog.newEntry', 'New Entry')}
                sx={{
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': { bgcolor: 'primary.dark' },
                }}
              >
                <AirplaneTicketOutlinedIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Grid>
      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          notFoundMsg={t('flightLog.noLogs')}
          rows={data?.logs ?? []}
          rowProps={() => ({
            borderTop: '2px solid',
            borderColor: 'divider',
            pt: 1.5,
          })}
          row={(log) => {
            const canOpen = isFlightLogAdmin || log.billableMemberId == me?.memberId

            return (
              <Grid size={12}>
                <Box
                  component={canOpen ? Link : 'div'}
                  to={canOpen ? `/logs/flights/${log.flightId}` : undefined}
                  state={canOpen ? `?${searchParams.toString()}` : undefined}
                  ref={location.hash == `#${log.flightId}` ? scrollToRef : undefined}
                  sx={{
                    display: 'contents',
                    color: 'inherit',
                    textDecoration: 'none',
                    cursor: canOpen ? 'pointer' : 'default',
                  }}
                >
                  <FlightLogBanner
                    aircraftRegistration={log.aircraftRegistration}
                    flightType={t(`flightLog.flightTypes.${log.flightType}`)}
                  />
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: { xs: 1, sm: 2 },
                      mt: 1,
                    }}
                  >
                    <FlightLogDate
                      flightId={log.flightId}
                      date={log.offBlockTimeUtc}
                      link={false}
                    />
                    <Divider orientation='vertical' flexItem />
                    <FlightLogTimeline
                      departureAirport={log.departureAirport}
                      arrivalAirport={log.arrivalAirport}
                      offBlockTimeUtc={log.offBlockTimeUtc}
                      takeoffTimeUtc={log.takeoffTimeUtc}
                      landingTimeUtc={log.landingTimeUtc}
                      onBlockTimeUtc={log.onBlockTimeUtc}
                      flightTime={log.flightTime}
                      blockTime={log.blockTime}
                    />
                  </Box>
                  <Divider sx={{ mt: 1 }} />
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 1,
                      mt: 0.5,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 2,
                        color: 'text.secondary',
                        fontSize: '0.85em',
                      }}
                    >
                      <Box>
                        {log.picLastName}
                        {log.crew2LastName ? ` / ${log.crew2LastName}` : ''} ({log.personsOnBoard}
                        <Icon icon='mdi:account' style={{ verticalAlign: 'middle' }} />)
                      </Box>
                      <Box>
                        {log.numberOfLandings}{' '}
                        <Icon icon='mdi:airplane-landing' style={{ verticalAlign: 'middle' }} />
                      </Box>
                      {!isFlightLogAdmin && (
                        <Box>
                          {log.estimatedCost != null ? `~${formatEur(log.estimatedCost)}` : '—'}
                        </Box>
                      )}
                    </Box>
                    <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'contents' }}>
                      <StatusButton log={log} />
                    </Box>
                  </Box>
                </Box>
              </Grid>
            )
          }}
        />
        {!isFlightLogAdmin && data?.unbilledEstimatedTotal != null && (
          <Tooltip title={t('flightLog.unbilledEstimatedTotalTooltip')}>
            <Box
              sx={{
                mt: 2,
                textAlign: 'right',
                cursor: 'help',
                color: 'text.secondary',
              }}
            >
              <Typography variant='body2'>
                {t('flightLog.unbilledEstimatedTotal')}:{' '}
                <strong>~{formatEur(data.unbilledEstimatedTotal)}</strong>
              </Typography>
            </Box>
          </Tooltip>
        )}
      </RemoteContent>
      <Pagination
        count={data?.pages ?? 1}
        size='large'
        page={filters.page ?? data?.page ?? 1}
        onChange={(_, page) => {
          searchParams.set('page', page.toString())
          setSearchParams(searchParams)
        }}
        showFirstButton={isSmUp}
        showLastButton={isSmUp}
        siblingCount={isSmUp ? 2 : 1}
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
