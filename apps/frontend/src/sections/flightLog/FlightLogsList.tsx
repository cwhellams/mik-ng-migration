import {
  Box,
  Grid,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  Switch,
  useMediaQuery,
  useTheme,
  Pagination,
  PaginationItem,
  Tooltip,
  Typography,
  Divider,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import useApi from '@mik/ui/hooks/useApi'
import { Icon } from '@iconify/react'
import AirplaneTicketOutlinedIcon from '@mui/icons-material/AirplaneTicketOutlined'
import { Link, useSearchParams } from 'react-router'
import { FlightLog, FlightLogFilters, FlightLogListResponse } from '@mik/contracts/flight-log'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { FlightLogQuery } from './components/FlightLogQuery'
import { useRoles } from '@mik/ui/hooks/useRoles'
import { useScrollOnRender } from '@mik/ui/hooks/useScrollOnRender'
import { useEffect, useState } from 'react'
import { StatusButton } from './components/StatusButton'
import { Title } from '@mik/ui/components/Title'
import {
  FlightLogBanner,
  FlightLogDate,
  FlightLogTimeline,
} from '@mik/ui/components/FlightListEntry'
import { ResponsiveTable } from '@mik/ui/components/ResponsiveTable'
import { FlightLogExportDialog } from './components/FlightLogExportDialog'
import { canOpenFlightRow } from './utils/crew'

const formatEur = (value: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' }).format(value)

/**
 * The crew-flights toggle lives in the URL so the list survives a reload and a shared
 * link, alongside `aircraftRegistration` and `page`. It is stored as the opt-*out*
 * `includeCrew=0` because the toggle defaults to on (#1019 Q1) — an absent param has to
 * mean "on", or every existing link into the flight log would land with it off.
 */
const CREW_PARAM = 'includeCrew'
const crewFlightsIncluded = (params: URLSearchParams) => params.get(CREW_PARAM) !== '0'

const FlightLogsList = () => {
  const { t } = useTranslation()

  const { me, isFlightLogAdmin } = useRoles()

  const [searchParams, setSearchParams] = useSearchParams()
  const scrollToRef = useScrollOnRender()

  const [filters, setFilters] = useState<FlightLogFilters>({
    limit: 10,
    page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
    aircraftRegistration: searchParams.get('aircraftRegistration') ?? undefined,
    anyCrewMemberId: searchParams.get('anyCrewMemberId') ?? undefined,
    includeCrewFlights: crewFlightsIncluded(searchParams),
  })

  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    const aircraftRegistration = searchParams.get('aircraftRegistration') ?? undefined
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined
    const anyCrewMemberId = searchParams.get('anyCrewMemberId') ?? undefined

    setFilters((old) => ({
      ...old,
      aircraftRegistration,
      page,
      anyCrewMemberId,
      includeCrewFlights: crewFlightsIncluded(searchParams),
    }))
  }, [searchParams])

  const includeCrewFlights = crewFlightsIncluded(searchParams)

  // Both filters are written together because changing either invalidates the current
  // page number: the result set is a different size, so page 4 of the old list is not
  // page 4 of the new one.
  const setListParams = (next: { aircraftRegistration?: string; includeCrew?: boolean }) => {
    const params = new URLSearchParams()
    const registration = next.aircraftRegistration ?? filters.aircraftRegistration ?? ''
    if (registration) params.set('aircraftRegistration', registration)
    if (!(next.includeCrew ?? includeCrewFlights)) params.set(CREW_PARAM, '0')
    // Carried over rather than rebuilt: this is the member-admin "view all flights" deep
    // link from Member.tsx (#1236), and dropping it would silently switch the list back
    // to the admin's own flights on the first filter change.
    const anyCrewMemberId = searchParams.get('anyCrewMemberId')
    if (anyCrewMemberId) params.set('anyCrewMemberId', anyCrewMemberId)
    setSearchParams(params)
  }

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
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <FlightLogQuery
            registration={filters.aircraftRegistration}
            setFilters={(next: FlightLogFilters) =>
              setListParams({ aircraftRegistration: next.aircraftRegistration ?? '' })
            }
          />
          {!isFlightLogAdmin && (
            <FormControlLabel
              control={
                <Switch
                  size='small'
                  checked={includeCrewFlights}
                  onChange={({ target }) => setListParams({ includeCrew: target.checked })}
                />
              }
              // The tooltip goes on the label text, not around the FormControlLabel:
              // wrapping the whole control puts the tooltip's aria-label on the <label>,
              // which then becomes the switch's accessible name in place of the short one.
              label={
                <Tooltip title={t('flightLog.includeCrewFlightsTooltip')}>
                  <span>{t('flightLog.includeCrewFlights')}</span>
                </Tooltip>
              }
              slotProps={{ typography: { variant: 'body2' } }}
            />
          )}
        </Box>
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
            // A flight the member flew as crew opens too, read-only unless they are an
            // instructor and it is still unvalidated — the backend decides that, the row
            // only has to stop pretending the entry is unreachable (#1019).
            const canOpen = canOpenFlightRow(log, me?.memberId, isFlightLogAdmin)
            const crewOnly = !log.isOwnFlight && log.myCrewRole != null

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
                      {crewOnly && (
                        <Tooltip
                          title={t('flightLog.crewFlightTooltip', {
                            role: t(`flightLog.crewRoles.${log.myCrewRole}`),
                          })}
                        >
                          <Chip
                            size='small'
                            variant='outlined'
                            color='info'
                            label={t(`flightLog.crewRoles.${log.myCrewRole}`)}
                          />
                        </Tooltip>
                      )}
                      {/* No price on a flight someone else is being invoiced for: the
                          server leaves estimatedCost null for those rows (#1019 Q1). */}
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
