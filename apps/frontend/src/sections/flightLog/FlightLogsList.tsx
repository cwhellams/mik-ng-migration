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
  Stack,
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

/**
 * The member-filter params the list understands, in precedence order.
 *
 * `anyCrewMemberId` is what the member-admin "view all flights" deep link writes
 * (#1236); `onBoardMemberId` is the narrower question, which the backend accepts and
 * holds to the same permission rule. Reading only the first would leave the second
 * quietly filtering the list with nothing on screen to say whose flights these are —
 * which is the confusion #1249 is about.
 */
const MEMBER_FILTER_PARAMS = ['anyCrewMemberId', 'onBoardMemberId'] as const

type MemberFilterParam = (typeof MEMBER_FILTER_PARAMS)[number]

/** The member filter in the URL, as `{ key, memberId }`, or undefined for an unfiltered list. */
const memberFilterOf = (
  params: URLSearchParams,
): { key: MemberFilterParam; memberId: string } | undefined => {
  for (const key of MEMBER_FILTER_PARAMS) {
    const memberId = params.get(key)
    if (memberId) return { key, memberId }
  }
  return undefined
}

const FlightLogsList = () => {
  const { t } = useTranslation()

  const { me, isFlightLogAdmin, isMembersAdmin } = useRoles()

  const [searchParams, setSearchParams] = useSearchParams()
  const scrollToRef = useScrollOnRender()

  const [filters, setFilters] = useState<FlightLogFilters>({
    limit: 10,
    page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
    aircraftRegistration: searchParams.get('aircraftRegistration') ?? undefined,
    anyCrewMemberId: searchParams.get('anyCrewMemberId') ?? undefined,
    onBoardMemberId: searchParams.get('onBoardMemberId') ?? undefined,
    includeCrewFlights: crewFlightsIncluded(searchParams),
  })

  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    const aircraftRegistration = searchParams.get('aircraftRegistration') ?? undefined
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined
    const anyCrewMemberId = searchParams.get('anyCrewMemberId') ?? undefined
    const onBoardMemberId = searchParams.get('onBoardMemberId') ?? undefined

    setFilters((old) => ({
      ...old,
      aircraftRegistration,
      page,
      anyCrewMemberId,
      onBoardMemberId,
      includeCrewFlights: crewFlightsIncluded(searchParams),
    }))
  }, [searchParams])

  const includeCrewFlights = crewFlightsIncluded(searchParams)

  const memberFilter = memberFilterOf(searchParams)

  // Both filters are written together because changing either invalidates the current
  // page number: the result set is a different size, so page 4 of the old list is not
  // page 4 of the new one.
  const setListParams = (next: {
    aircraftRegistration?: string
    includeCrew?: boolean
    /** Set to `null` to drop the member filter; omitted means "keep whatever is there". */
    memberFilter?: null
  }) => {
    const params = new URLSearchParams()
    const registration = next.aircraftRegistration ?? filters.aircraftRegistration ?? ''
    if (registration) params.set('aircraftRegistration', registration)
    if (!(next.includeCrew ?? includeCrewFlights)) params.set(CREW_PARAM, '0')
    // Carried over rather than rebuilt: this is the member-admin "view all flights" deep
    // link from Member.tsx (#1236), and dropping it would silently switch the list back
    // to the admin's own flights on the first filter change. Clearing it is a deliberate
    // `memberFilter: null` — the chip's own control, and the only way out of the filter.
    if (memberFilter && next.memberFilter !== null) {
      params.set(memberFilter.key, memberFilter.memberId)
    }
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

  // Whose flights these are, when they are not the reader's own. The server names the
  // member it filtered on; until that lands — and for an id it could not resolve — the
  // raw id stands in, so the heading never flickers between "no context" and "context".
  //
  // A filter naming the reader themselves is not labelled: nobody needs telling they are
  // looking at their own log, and the backend strips the filter on that path anyway.
  const showMemberFilter = !!memberFilter && memberFilter.memberId !== me?.memberId
  const filteredMember = data?.filteredCrewMember
  const memberFilterLabel = filteredMember
    ? `${filteredMember.firstName} ${filteredMember.lastName}`
    : (memberFilter?.memberId ?? '')

  return (
    <Box>
      <Title label={t('flightLog.title')}>
        {showMemberFilter && (
          <Stack direction='row' spacing={0.5} sx={{ alignItems: 'center' }}>
            {/* `describeChild`, so the tooltip explains the chip rather than replacing
                the member's name as its accessible name. */}
            <Tooltip title={t('flightLog.memberFilterTooltip')} describeChild>
              <Chip
                icon={<Icon icon='mdi:account' />}
                color='primary'
                variant='outlined'
                label={t('flightLog.memberFilter', { name: memberFilterLabel })}
              />
            </Tooltip>
            {/* A named button rather than the chip's own `onDelete`: that renders the
                clear affordance as a bare <svg> with no accessible name, which is no use
                to anyone not looking at it. */}
            <Tooltip title={t('flightLog.clearMemberFilter')}>
              <IconButton
                onClick={() => setListParams({ memberFilter: null })}
                aria-label={t('flightLog.clearMemberFilter')}
                size='small'
              >
                <Icon icon='mdi:close-circle' />
              </IconButton>
            </Tooltip>
            {/* The profile page is MEMBER_ADMIN-gated while this filter is
                FLIGHTLOG_ADMIN-gated, so a flight-log-only admin gets the chip without
                the link rather than an invitation to a 403. */}
            {isMembersAdmin && (
              <Tooltip title={t('flightLog.memberFilterProfile')}>
                <IconButton
                  component={Link}
                  to={`/club/members/${memberFilter.memberId}`}
                  aria-label={t('flightLog.memberFilterProfile')}
                  size='small'
                >
                  <Icon icon='mdi:account-arrow-left' />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        )}
      </Title>
      <FlightLogExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        defaultAircraftRegistration={filters.aircraftRegistration}
        // Without this the export ignores the member filter and hands back everyone's
        // flights, which is the same confusion the chip above exists to end (#1249).
        memberFilter={
          showMemberFilter
            ? { memberId: memberFilter.memberId, label: memberFilterLabel }
            : undefined
        }
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
