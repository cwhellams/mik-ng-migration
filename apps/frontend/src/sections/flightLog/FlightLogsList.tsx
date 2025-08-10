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
  useMediaQuery,
  useTheme,
  Pagination,
  Snackbar,
  Alert,
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
import { formatDate, formatTime } from '../../utils/date'
import { useRoles } from '../../hooks/useRoles'
import { useScrollOnRender } from '../../hooks/useScrollOnRender'
import {
  AircraftJourneyLogBook,
  AjlbListResponse,
} from '@backend/routes/ajlb/model'
import { useEffect, useState } from 'react'
import { EditButton } from '../../components/EditButton'
import { Problem } from '@backend/routes/response'
import { StatusButton } from './components/StatusButton'
import { FlightLogValidation } from './components/FlightLogValidation'

const FlightLogsList = () => {
  const { t } = useTranslation()

  const { isFlightLogAdmin } = useRoles()

  // fetch list of aircraft journey log books
  const { data: logbooks, mutate: mutateLogbooks } = useApi<AjlbListResponse>(
    {
      url: 'v1/ajlb',
    },
    {
      revalidateIfStale: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    }
  )

  const [ajlb, setAjlb] = useState<AircraftJourneyLogBook | null>(null)

  const [sbState, setSbState] = useState<Problem | null>(null)

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

  useEffect(() => {
    // if not requested otherwise, server returns the last page
    if (!searchParams.get('page') && data?.page) {
      setFilters((prev) => ({
        ...prev,
        page: data.page,
      }))
    }
  }, [data, searchParams, setFilters])

  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  const singlePlane = !!filters.aircraftRegistration
  const syncMode = !!ajlb

  const rowHeight = syncMode ? 75 : 100

  const crewHeaders = isMd
    ? [t('flightLog.crews.pic'), t('flightLog.logbooks.student'), 'PoB']
    : [t('flightLog.crew')]

  const colSpan =
    8 + crewHeaders.length + (singlePlane ? 1 : 0) + (isXs ? 0 : 2)

  const crewValues = (log: FlightLogListEntry) =>
    isMd
      ? [[log.picLastName], [log.crew2LastName], [log.personsOnBoard]]
      : [[log.picLastName, log.crew2LastName, `(${log.personsOnBoard})`]]

  const updateEntry = async (
    log: FlightLogListEntry,
    patch: Partial<FlightLogUpsertRequest>
  ) => {
    const res = await mutation.trigger<Partial<FlightLogUpsertRequest>>(
      'PATCH',
      patch,
      log.flightId
    )

    setSbState(res.error ? res.error : { status: 200 })
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
      setSbState(res.error)
    } else if (isLast) {
      setSbState({ status: 200 })
    }

    if (isLast) {
      mutateLogbooks()
    }
    return !res.error
  }

  const EmptyRows = ({
    log,
    currentRow,
  }: {
    log: FlightLogListEntry
    currentRow: number
  }) => {
    if (!syncMode) {
      return <></>
    }

    const rows = Math.min(
      log.ajlbBlankRowsBefore,
      // if blank rows are in the previous page, skip them
      (log.ajlbRowNo ?? 0) - currentRow
    )

    return Array.from({ length: rows }).map((_, index) => (
      <TableRow key={`${log.flightId}-${index}`}>
        <TableCell colSpan={colSpan - 2} sx={{ height: rowHeight }}>
          &nbsp;
        </TableCell>
        <TableCell>
          {log.status === FlightLogStatus.NEW && (
            <Stack direction='row' spacing={1}>
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
          )}
        </TableCell>
      </TableRow>
    ))
  }

  return (
    <Box>
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={sbState !== null}
        autoHideDuration={3000}
        onClose={() => setSbState(null)}
      >
        <Alert severity={sbState?.status === 200 ? 'success' : 'error'}>
          {sbState?.status === 200
            ? 'success'
            : (sbState?.detail ?? 'Error occurred')}
        </Alert>
      </Snackbar>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent='space-between'
        alignItems='center'
        mb={3}
      >
        <Typography variant={isXs ? 'h4' : 'h2'} gutterBottom>
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

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ pr: 0, height: rowHeight }}>
                {t('flightLog.date')}
              </TableCell>
              {!singlePlane && <TableCell>{t('flightLog.aircraft')}</TableCell>}
              {crewHeaders.map((header, index) => (
                <TableCell key={index}>{header}</TableCell>
              ))}

              <TableCell>{t('flightLog.departure')}</TableCell>
              <TableCell>{t('flightLog.arrival')}</TableCell>
              <TableCell>
                {t(syncMode ? 'flightLog.airborneTime' : 'flightLog.blockTime')}
              </TableCell>
              {syncMode && (
                <TableCell>{t('flightLog.logbooks.totalFlightTime')}</TableCell>
              )}
              <TableCell>{t('flightLog.numberOfLandings')}</TableCell>
              <TableCell>{t('flightLog.flightType')}</TableCell>
              {syncMode && <TableCell>TTL</TableCell>}
              {!isXs && <TableCell>{t('flightLog.logbooks.status')}</TableCell>}
              {syncMode && isFlightLogAdmin && (
                <TableCell>{t('general.actions')}</TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            <RemoteContent
              isLoading={isLoading}
              error={error}
              colSpan={colSpan}
            >
              {data?.logs?.map((log, index) => [
                <EmptyRows
                  key={`${log.flightId}-empty`}
                  log={log}
                  currentRow={index + 1}
                />,

                <TableRow key={log.flightId}>
                  <TableCell sx={{ height: rowHeight }}>
                    <Link
                      ref={
                        location.hash == `#${log.flightId}`
                          ? scrollToRef
                          : undefined
                      }
                      to={`/flight-logs/${log.flightId}`}
                      state={searchParams.toString()}
                    >
                      {formatDate(log.takeoffTimeUtc)}
                    </Link>
                  </TableCell>
                  {!singlePlane && (
                    <TableCell>{log.aircraftRegistration}</TableCell>
                  )}
                  {crewValues(log).map((value, index) => (
                    <TableCell key={`crew-${index}`}>
                      {value.map((value, index) => (
                        <Box key={index}>{value}</Box>
                      ))}
                    </TableCell>
                  ))}
                  <TableCell>
                    {log.departureAirport}
                    {!syncMode && <Box>{formatTime(log.offBlockTimeUtc)}</Box>}
                    <Box>{formatTime(log.takeoffTimeUtc)}</Box>
                  </TableCell>
                  <TableCell>
                    {log.arrivalAirport}
                    <Box>{formatTime(log.landingTimeUtc)}</Box>
                    {!syncMode && <Box>{formatTime(log.onBlockTimeUtc)}</Box>}
                  </TableCell>
                  <TableCell>
                    {syncMode ? log.flightTime : log.blockTime}
                  </TableCell>
                  {syncMode && <TableCell>{log.acTotalFlightTime}</TableCell>}
                  <TableCell>{log.numberOfLandings}</TableCell>
                  <TableCell>{log.flightType}</TableCell>
                  {syncMode && <TableCell>{log.totalTimeInService}</TableCell>}
                  {!isXs && (
                    <TableCell sx={{ textAlign: 'center' }}>
                      <StatusButton
                        log={log}
                        viewOnly={
                          !syncMode ||
                          !isFlightLogAdmin ||
                          ajlb?.newFlightsPage !== data?.page ||
                          data?.logs.find(
                            (l) => l.status === FlightLogStatus.NEW
                          ) !== log
                        }
                        update={() => validateEntry(log)}
                      />
                    </TableCell>
                  )}
                  {syncMode &&
                    isFlightLogAdmin &&
                    log.status == FlightLogStatus.NEW && (
                      <TableCell>
                        <Stack direction='row' spacing={1}>
                          {
                            // allow to delete blank rows from the end of previous page
                            log.ajlbRowNo == 1 &&
                              log.ajlbBlankRowsBefore > 0 && (
                                <EditButton
                                  title={t('flightLog.logbooks.deleteBlankRow')}
                                  onClick={() =>
                                    updateEntry(log, {
                                      ajlbBlankRowsBefore:
                                        log.ajlbBlankRowsBefore - 1,
                                    })
                                  }
                                  icon='mdi:table-row-remove'
                                />
                              )
                          }

                          <EditButton
                            title={t('flightLog.logbooks.addBlankRow')}
                            onClick={() =>
                              updateEntry(log, {
                                ajlbBlankRowsBefore:
                                  log.ajlbBlankRowsBefore + 1,
                              })
                            }
                            width={28}
                            icon='mdi:table-row-plus-before'
                          />
                        </Stack>
                      </TableCell>
                    )}
                </TableRow>,
              ])}
              {(!data?.logs || data.logs.length === 0) && (
                <TableRow>
                  <TableCell colSpan={colSpan} align='center'>
                    <Typography variant='body1' py={3}>
                      {t('flightLog.noLogs')}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </RemoteContent>
          </TableBody>
        </Table>
      </TableContainer>

      <Pagination
        count={syncMode ? (ajlb?.pagesInUse ?? 1) : (data?.pages ?? 1)}
        size='large'
        page={filters.page ?? 1}
        onChange={(_, page) => {
          searchParams.set('page', page.toString())
          setSearchParams(searchParams)
        }}
        showFirstButton={true}
        showLastButton={true}
        siblingCount={2}
        sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}
        // renderItem={(item) => {
        //   if (item.type === 'page' && item.page !== null) {
        //     return (
        //       <PaginationItem
        //         {...item}
        //         page={(ajlb?.startPage ?? 1) - 1 + (item.page - 1) * 2 + 1}
        //       />
        //     )
        //   }
        //   return <PaginationItem {...item} />
        // }}
      />

      {syncMode && !!data?.rows && (
        <FlightLogValidation
          ajlb={ajlb}
          data={data}
          navigateToNewFlightsPage={() => {
            setSearchParams({
              aircraftRegistration: filters.aircraftRegistration ?? '',
              ajlbSeqNo: filters.ajlbSeqNo?.toString() ?? '',
              page: ajlb.newFlightsPage?.toString() ?? '',
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
