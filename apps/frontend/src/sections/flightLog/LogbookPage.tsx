import {
  Box,
  Grid,
  Stack,
  useMediaQuery,
  useTheme,
  Pagination,
  PaginationItem,
  Breadcrumbs,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import useApi from '../../hooks/useApi'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  FlightLog,
  FlightLogUpsertRequest,
  FlightLogListEntry,
  FlightLogListResponse,
  FlightLogStatus,
} from '@backend/routes/flight-log/models'
import { RemoteContent } from '../../components/RemoteContent'
import { useRoles } from '../../hooks/useRoles'
import { useScrollOnRender } from '../../hooks/useScrollOnRender'
import { AircraftJourneyLogBook } from '@backend/routes/ajlb/model'
import { useEffect, useState } from 'react'
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
import { useTimezone } from '../../hooks/useTimezone'

type LogbookTableRow = {
  log: FlightLogListEntry | null
  isEmptyRow: boolean
  hasEditActions: boolean
}

export const buildLogbookRows = (
  logs: FlightLogListEntry[] | undefined,
  pageSize = 0,
): LogbookTableRow[] => {
  if (!logs?.length) {
    return Array.from({ length: pageSize }, () => ({
      log: null,
      isEmptyRow: true,
      hasEditActions: false,
    }))
  }

  const rows: LogbookTableRow[] = []

  let prevRowNo = 0
  logs.forEach((log) => {
    const blankRowsOnPage = log.ajlbRowNo - 1 - prevRowNo
    rows.push(
      ...Array.from({ length: blankRowsOnPage }, () => ({
        log,
        isEmptyRow: true,
        hasEditActions: true,
      })),
    )

    rows.push({
      log,
      isEmptyRow: false,
      hasEditActions: false,
    })

    prevRowNo = log.ajlbRowNo
  })

  const trailingEmptyRows = Math.max(0, pageSize - rows.length)
  rows.push(
    ...Array.from({ length: trailingEmptyRows }, () => ({
      log: null,
      isEmptyRow: true,
      hasEditActions: false,
    })),
  )

  return rows
}

const FlightLogsList = () => {
  const { t } = useTranslation()

  const { aircraftRegistration, ajlbSeqNo } = useParams()

  const { me, isFlightLogAdmin } = useRoles()

  // selected aircraft journey log books
  const { data: ajlb, mutate: mutateLogbooks } = useApi<AircraftJourneyLogBook>({
    url: `v1/ajlb/${aircraftRegistration}/${ajlbSeqNo}`,
    skipFetch: !aircraftRegistration || !ajlbSeqNo,
  })

  const { formatTime } = useTimezone()

  const [problem, setProblem] = useState<Problem | undefined>(undefined)

  const [searchParams, setSearchParams] = useSearchParams()
  const scrollToRef = useScrollOnRender()

  const [page, setPage] = useState<number | undefined>(
    searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
  )

  useEffect(() => {
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined

    setPage(page)
  }, [searchParams, setPage])

  const { data, isLoading, error, mutation } = useApi<FlightLogListResponse, FlightLog>(
    {
      url: 'v1/flight-logs',
      params: {
        aircraftRegistration: ajlb?.aircraftRegistration,
        ajlbSeqNo: ajlb?.seqNo,
        page: page ?? ajlb?.view?.lastPage,
      },
      skipFetch: !ajlb,
    },
    {
      // don't clear old data when searching
      keepPreviousData: true,
    },
  )

  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  const editableItem =
    isFlightLogAdmin && ajlb?.view?.newFlightsPage === data?.page
      ? data?.logs.find((l) => l.status === FlightLogStatus.NEW)
      : undefined

  const rowHeight = isMd ? 60 : 140

  const updateEntry = async (log: FlightLogListEntry, patch: Partial<FlightLogUpsertRequest>) => {
    const res = await mutation.trigger<Partial<FlightLogUpsertRequest>>(
      'PATCH',
      patch,
      log.flightId,
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
      },
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
        update={editableItem === log ? () => validateEntry(log) : undefined}
      />

      {isFlightLogAdmin && log.status == FlightLogStatus.NEW && (
        <>
          {log.ajlbBlankRowsBefore > 0 && (
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

  const logsWithEmptyRows = buildLogbookRows(data?.logs, ajlb?.rowsPerPage ?? 0)

  return (
    <Box>
      <SnackAlert problem={problem} />

      <Breadcrumbs sx={{ my: 2 }}>
        <Link to='/logs/books'>{t('flightLog.logbooks.ajlb')}</Link>
        <Typography color='text.primary'>
          {aircraftRegistration} / {ajlb?.seqNo}
        </Typography>
      </Breadcrumbs>

      <Title label={t('flightLog.logbooks.title')} />

      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={1.3}>{t('flightLog.date')}</Grid>
              <Grid size={1.5}>{t('flightLog.crews.pic')}</Grid>
              <Grid size={1.5}>{t('flightLog.logbooks.student')}</Grid>
              <Grid size={0.5}>PoB</Grid>
              <Grid size={1}>{t('flightLog.departure')}</Grid>
              <Grid size={1}>{t('flightLog.arrival')}</Grid>
              <Grid size={1.1}>{t('flightLog.airborneTime')}</Grid>
              <Grid size={1.1}>{t('flightLog.hours')}</Grid>
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
          row={({ log, isEmptyRow, hasEditActions }) => {
            if (isEmptyRow) {
              if (hasEditActions && log && isFlightLogAdmin && log.status === FlightLogStatus.NEW) {
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
            if (!log) {
              return <></>
            }

            return (
              <>
                <Grid size={{ xs: 3, md: 1.3 }}>
                  <ViewFlightDate
                    flightId={log.flightId}
                    date={log.offBlockTimeUtc}
                    link={isFlightLogAdmin || log.billableMemberId == me?.memberId}
                    state={`/books/${log.aircraftRegistration}/${log.ajlbSeqNo}?page=${page}`}
                    ref={location.hash == `#${log.flightId}` ? scrollToRef : undefined}
                  />
                </Grid>

                {isMd ? (
                  <>
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
                      <Box color='text.secondary'>{formatTime(log.takeoffTimeUtc)}</Box>
                    </Grid>

                    <Grid size={1}>
                      <Box>{log.arrivalAirport}</Box>
                      <Box color='text.secondary'>{formatTime(log.landingTimeUtc)}</Box>
                    </Grid>

                    <Grid size={1.1}>{log.flightTime}</Grid>

                    <Grid size={1.1}>{log.acTotalFlightTime}</Grid>

                    <Grid size={0.8}>
                      <Box>{log.numberOfLandings}</Box>
                      {log.acTotalLandings != null && (
                        <Box color='text.secondary' fontSize='0.75em'>
                          {log.acTotalLandings}
                        </Box>
                      )}
                    </Grid>

                    <Grid size={1.2}>{t(`flightLog.flightTypes.${log.flightType}`)}</Grid>

                    <Grid size={1} alignSelf='center' justifyItems='end'>
                      <Actions log={log} />
                    </Grid>
                  </>
                ) : (
                  <>
                    {
                      // give more room to action buttons by leaving registration out when synching
                      !isFlightLogAdmin && <Grid size={3}>{log.aircraftRegistration}</Grid>
                    }

                    <ViewMobileFlightDetails
                      size={isFlightLogAdmin ? 9 : 6}
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
                      takeoffTimeUtc={log.takeoffTimeUtc}
                      landingTimeUtc={log.landingTimeUtc}
                      flightTime={log.flightTime}
                      secondaryTime={log.acTotalFlightTime}
                    />
                  </>
                )}
              </>
            )
          }}
        />
      </RemoteContent>

      {ajlb?.view && (
        <Pagination
          count={(ajlb.view.lastPage - ajlb.startPage) / 2 + 1}
          size='large'
          page={((page ?? 1) - (ajlb?.startPage ?? 1)) / 2 + 1}
          onChange={(_, page) => {
            const newPage = (ajlb?.startPage ?? 1) + 2 * (page - 1)
            setSearchParams({ page: newPage.toString() })
          }}
          showFirstButton={true}
          showLastButton={true}
          siblingCount={2}
          sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}
          renderItem={(item) => {
            if (item.type === 'page' && item.page !== null) {
              return (
                <PaginationItem {...item} page={(ajlb?.startPage ?? 1) + 2 * (item.page - 1)} />
              )
            }
            return <PaginationItem {...item} />
          }}
        />
      )}

      {ajlb && data && (
        <FlightLogValidation
          ajlb={ajlb}
          data={data}
          navigateToNewFlightsPage={() => {
            if (ajlb.view?.newFlightsPage) {
              setSearchParams({ page: ajlb.view.newFlightsPage.toString() })
            }
          }}
          validateEntry={validateEntry}
          isMutating={mutation.isMutating}
        />
      )}
    </Box>
  )
}

export default FlightLogsList
