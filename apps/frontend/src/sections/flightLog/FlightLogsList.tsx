import {
  Box,
  Grid,
  Button,
  Stack,
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
  FlightLogUpsertRequest,
  FlightLogFilters,
  FlightLogListEntry,
  FlightLogListResponse,
  FlightLogStatus,
} from '@backend/routes/flight-log/models'
import { RemoteContent } from '../../components/RemoteContent'
import { FlightLogQuery } from './components/FlightLogQuery'
import { formatTime } from '../../utils/date'
import { useRoles } from '../../hooks/useRoles'
import { useScrollOnRender } from '../../hooks/useScrollOnRender'
import {
  AircraftJourneyLogBook,
  AjlbListResponse,
} from '@backend/routes/ajlb/model'
import { useEffect, useRef, useState } from 'react'
import { EditButton } from '../../components/EditButton'
import { Problem } from '@backend/routes/response'
import { StatusButton } from './components/StatusButton'
import { FlightLogValidation } from './components/FlightLogValidation'
import { SnackAlert } from '../../components/SnackAlert'
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

  // fetch list of aircraft journey log books
  const { data: logbooks, mutate: mutateLogbooks } = useApi<AjlbListResponse>({
    url: 'v1/ajlb',
  })

  const [ajlb, setAjlb] = useState<AircraftJourneyLogBook | null>(null)

  const [problem, setProblem] = useState<Problem | undefined>(undefined)

  const [searchParams, setSearchParams] = useSearchParams()
  const scrollToRef = useScrollOnRender()

  const [filters, setFilters] = useState<FlightLogFilters>({})

  useEffect(() => {
    const aircraftRegistration = searchParams.get('aircraftRegistration') ?? ''
    const ajlbSeqNo = searchParams.get('ajlbSeqNo')
      ? Number(searchParams.get('ajlbSeqNo'))
      : undefined
    const page = searchParams.get('page')
      ? Number(searchParams.get('page'))
      : undefined

    setFilters({
      aircraftRegistration,
      ajlbSeqNo,
      page,
      limit: !ajlbSeqNo ? 10 : undefined,
    })

    setAjlb(
      logbooks?.books.find(
        (b) =>
          b.aircraftRegistration === aircraftRegistration &&
          b.seqNo === ajlbSeqNo
      ) ?? null
    )
  }, [logbooks, searchParams, setAjlb])

  const { data, isLoading, error, mutation } = useApi<
    FlightLogListResponse,
    FlightLog
  >(
    {
      url: 'v1/flight-logs',
      params: filters,
    },
    {
      // don't clear old data when searching
      keepPreviousData: true,
    }
  )

  const userDefinedPageNumber = useRef(!!searchParams.get('page'))
  useEffect(() => {
    // if not requested otherwise, server returns the last page
    if (!userDefinedPageNumber.current && data?.page) {
      setFilters((prev) => ({
        ...prev,
        page: data.page,
      }))
    }
  }, [data, setFilters])

  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  const singlePlane = !!filters.aircraftRegistration
  const syncMode = !!ajlb
  const editableSyncMode = syncMode && isFlightLogAdmin

  const editableItem =
    editableSyncMode && ajlb.view?.newFlightsPage === data?.page
      ? data?.logs.find((l) => l.status === FlightLogStatus.NEW)
      : undefined

  const rowHeight = syncMode ? (isMd ? 60 : 140) : 75

  const updateEntry = async (
    log: FlightLogListEntry,
    patch: Partial<FlightLogUpsertRequest>
  ) => {
    const res = await mutation.trigger<Partial<FlightLogUpsertRequest>>(
      'PATCH',
      patch,
      log.flightId
    )

    setProblem(res.error ? res.error : { status: 200 })
    mutateLogbooks()

    return res
  }

  const validateEntry = async (log: FlightLogListEntry, isLast = true) => {
    const res = await mutation.trigger<Partial<FlightLogUpsertRequest>>(
      'POST',
      {},
      `${log.flightId}/validate`,
      {
        revalidate: isLast,
      }
    )

    if (res.error) {
      setProblem(res.error)
    } else if (isLast) {
      setProblem({ status: 200 })
    }

    if (isLast) {
      mutateLogbooks()
    }
    return !res.error
  }

  const Actions = ({ log }: { log: FlightLogListEntry }) => (
    <Stack direction='row' spacing={1}>
      <StatusButton
        log={log}
        viewOnly={editableItem !== log}
        update={() => validateEntry(log)}
      />

      {editableSyncMode && log.status == FlightLogStatus.NEW && (
        <>
          {log.ajlbRowNo == 1 && log.ajlbBlankRowsBefore > 0 && (
            <EditButton
              title={t('flightLog.logbooks.deleteBlankRow')}
              onClick={() =>
                updateEntry(log, {
                  ajlbBlankRowsBefore: log.ajlbBlankRowsBefore - 1,
                })
              }
              icon='mdi:table-row-remove'
            />
          )}

          <EditButton
            title={t('flightLog.logbooks.addBlankRow')}
            onClick={() =>
              updateEntry(log, {
                ajlbBlankRowsBefore: log.ajlbBlankRowsBefore + 1,
              })
            }
            icon='mdi:table-row-plus-before'
          />
        </>
      )}
    </Stack>
  )

  const logsWithEmptyRows = data?.logs.flatMap((log, index) => {
    if (!syncMode) {
      return { log, isEmptyRow: false }
    }

    const emptyRowCount = Math.min(
      log.ajlbBlankRowsBefore,
      // if blank rows are in the previous page, skip them
      (log.ajlbRowNo ?? 0) - (index + 1)
    )

    return Array.from({ length: emptyRowCount })
      .map(() => ({
        log,
        isEmptyRow: true,
      }))
      .concat({ log, isEmptyRow: false })
  })

  return (
    <Box>
      <SnackAlert problem={problem} />

      <Title label={t('flightLog.title')}>
        <Button
          variant='contained'
          color='primary'
          startIcon={<Icon icon='mdi:plus' />}
          component={Link}
          to='/logs/new'
        >
          {t('flightLog.newEntry', 'New Entry')}
        </Button>
      </Title>

      <FlightLogQuery
        logbooks={logbooks?.books ?? []}
        filters={filters}
        setFilters={(filters: FlightLogFilters) => {
          setSearchParams({
            aircraftRegistration: filters.aircraftRegistration ?? '',
            ajlbSeqNo: filters.ajlbSeqNo?.toString() ?? '',
            page: filters.page?.toString() ?? '',
          })
        }}
      />

      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={1.3}>{t('flightLog.date')}</Grid>
              {!singlePlane && <Grid size={1}>{t('flightLog.aircraft')}</Grid>}
              <Grid size={1.5}>{t('flightLog.crews.pic')}</Grid>
              <Grid size={1.5}>{t('flightLog.logbooks.student')}</Grid>
              <Grid size={0.5}>PoB</Grid>
              <Grid size={1}>{t('flightLog.departure')}</Grid>
              <Grid size={1}>{t('flightLog.arrival')}</Grid>
              <Grid size={1.1}>
                {t(syncMode ? 'flightLog.airborneTime' : 'flightLog.duration')}
              </Grid>
              {syncMode && <Grid size={1.1}>{t('flightLog.hours')}</Grid>}
              <Grid size={0.8}>{t('flightLog.landings')}</Grid>
              <Grid size={1.2}>{t('flightLog.flightType')}</Grid>
              <Grid size={1} textAlign='center'>
                {t('flightLog.logbooks.status')}
              </Grid>
            </>
          }
          notFoundMsg={t('flightLog.noLogs')}
          rows={logsWithEmptyRows}
          rowProps={() => ({
            minHeight: rowHeight,
          })}
          row={({ log, isEmptyRow }) => {
            if (isEmptyRow) {
              if (isFlightLogAdmin && log.status === FlightLogStatus.NEW) {
                return (
                  <Stack direction='row-reverse' spacing={1} width='100%'>
                    <EditButton
                      title={t('flightLog.logbooks.deleteBlankRow')}
                      onClick={() =>
                        updateEntry(log, {
                          ajlbBlankRowsBefore: log.ajlbBlankRowsBefore - 1,
                        })
                      }
                      icon='mdi:table-row-remove'
                    />
                  </Stack>
                )
              }
              return <></>
            }

            return (
              <>
                <Grid size={{ xs: 3, md: 1.3 }}>
                  <ViewFlightDate
                    flightId={log.flightId}
                    date={log.offBlockTimeUtc}
                    link={
                      isFlightLogAdmin || log.billableMemberId == me?.memberId
                    }
                    state={searchParams.toString()}
                    ref={
                      location.hash == `#${log.flightId}`
                        ? scrollToRef
                        : undefined
                    }
                  />
                </Grid>

                {isMd ? (
                  <>
                    {!singlePlane && (
                      <Grid size={1}>{log.aircraftRegistration}</Grid>
                    )}

                    <Grid size={1.5}>
                      <Box>{log.picLastName}</Box>
                    </Grid>
                    <Grid size={1.5}>
                      <Box>{log.crew2LastName}</Box>
                    </Grid>
                    <Grid size={0.5}>
                      <Box>{log.personsOnBoard}</Box>
                    </Grid>

                    <Grid size={1}>
                      <Box>{log.departureAirport}</Box>
                      {!syncMode && (
                        <Box color='text.secondary'>
                          {formatTime(log.offBlockTimeUtc)}
                        </Box>
                      )}
                      <Box color='text.secondary'>
                        {formatTime(log.takeoffTimeUtc)}
                      </Box>
                    </Grid>

                    <Grid size={1}>
                      <Box>{log.arrivalAirport}</Box>
                      <Box color='text.secondary'>
                        {formatTime(log.landingTimeUtc)}
                      </Box>
                      {!syncMode && (
                        <Box color='text.secondary'>
                          {formatTime(log.onBlockTimeUtc)}
                        </Box>
                      )}
                    </Grid>

                    <Grid size={1.1}>
                      {log.flightTime}
                      {!syncMode && <Box>{log.blockTime}</Box>}
                    </Grid>

                    {syncMode && (
                      <Grid size={1.1}>{log.acTotalFlightTime}</Grid>
                    )}

                    <Grid size={0.8}>{log.numberOfLandings}</Grid>

                    <Grid size={1.2}>
                      {t(`flightLog.flightTypes.${log.flightType}`)}
                    </Grid>

                    <Grid size={1} alignSelf='center' justifyItems='end'>
                      <Actions log={log} />
                    </Grid>
                  </>
                ) : (
                  <>
                    {
                      // give more room to action buttons by leaving registration out when synching
                      !editableSyncMode && (
                        <Grid size={3}>{log.aircraftRegistration}</Grid>
                      )
                    }

                    <ViewMobileFlightDetails
                      size={editableSyncMode ? 9 : 6}
                      numberOfLandings={log.numberOfLandings}
                      flightType={log.flightType}
                    >
                      <Actions log={log} />
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
                      offBlockTimeUtc={
                        !syncMode ? log.offBlockTimeUtc : undefined
                      }
                      takeoffTimeUtc={log.takeoffTimeUtc}
                      landingTimeUtc={log.landingTimeUtc}
                      onBlockTimeUtc={
                        !syncMode ? log.onBlockTimeUtc : undefined
                      }
                      flightTime={log.flightTime}
                      secondaryTime={
                        syncMode ? log.acTotalFlightTime : log.blockTime
                      }
                    />
                  </>
                )}
              </>
            )
          }}
        />
      </RemoteContent>

      <Pagination
        count={
          syncMode && ajlb?.view
            ? (ajlb.view.lastPage - ajlb.startPage) / 2 + 1
            : (data?.pages ?? 1)
        }
        size='large'
        page={
          syncMode
            ? ((filters.page ?? 1) - (ajlb?.startPage ?? 1)) / 2 + 1
            : (filters.page ?? 1)
        }
        onChange={(_, page) => {
          const newPage = syncMode
            ? (ajlb?.startPage ?? 1) + 2 * (page - 1)
            : page
          searchParams.set('page', newPage.toString())
          setSearchParams(searchParams)
        }}
        showFirstButton={true}
        showLastButton={true}
        siblingCount={2}
        sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}
        renderItem={(item) => {
          if (item.type === 'page' && item.page !== null) {
            return (
              <PaginationItem
                {...item}
                page={
                  syncMode
                    ? (ajlb?.startPage ?? 1) + 2 * (item.page - 1)
                    : item.page
                }
              />
            )
          }
          return <PaginationItem {...item} />
        }}
      />

      {syncMode && isFlightLogAdmin && !!data?.rows && (
        <FlightLogValidation
          ajlb={ajlb}
          data={data}
          navigateToNewFlightsPage={() => {
            setSearchParams({
              aircraftRegistration: filters.aircraftRegistration ?? '',
              ajlbSeqNo: filters.ajlbSeqNo?.toString() ?? '',
              page: ajlb.view?.newFlightsPage?.toString() ?? '',
            })
          }}
          validateEntry={validateEntry}
          isMutating={mutation.isMutating}
        />
      )}
    </Box>
  )
}

export default FlightLogsList
