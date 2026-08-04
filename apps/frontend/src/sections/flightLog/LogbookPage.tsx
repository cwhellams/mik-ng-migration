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
  Button,
  IconButton,
  Menu,
  MenuItem as MuiMenuItem,
  ListItemIcon,
  ListItemText,
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
  FlightLogTimeline,
  ViewFlightDate,
  ViewMobileFlightDetails,
  ViewMobileCrew,
} from './components/FlightListEntry'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { useTimezone } from '../../hooks/useTimezone'
import { Icon } from '@iconify/react'
import { useMaintenanceNotes } from '../../hooks/useMaintenanceNotes'
import { useDefects } from '../../hooks/useDefects'
import { MaintenanceNoteMarker } from './MaintenanceNoteMarker'
import { AddMaintenanceNoteDialog } from './AddMaintenanceNoteDialog'
import { DefectMarker } from './DefectMarker'
import { AddDefectDialog } from './AddDefectDialog'
import type { MaintenanceNote } from '@backend/routes/maintenance-notes/models'
import type { Defect } from '@backend/routes/defects/models'
import { MIKPermissions } from '@backend/routes/members/models'

type LogbookTableRow = {
  log: FlightLogListEntry | null
  isEmptyRow: boolean
  hasEditActions: boolean
  note: MaintenanceNote | undefined
  isNoteRow: boolean
  isNoteBlankRow: boolean
  defect: Defect | undefined
  isDefectRow: boolean
  isDefectBlankRow: boolean
  inFlightDefects: Defect[]
}

export const buildLogbookRows = (
  logs: FlightLogListEntry[] | undefined,
  pageSize = 0,
): LogbookTableRow[] => {
  const rowDefaults = {
    note: undefined,
    isNoteRow: false,
    isNoteBlankRow: false,
    defect: undefined,
    isDefectRow: false,
    isDefectBlankRow: false,
    inFlightDefects: [] as Defect[],
  }

  if (!logs?.length) {
    return Array.from({ length: pageSize }, () => ({
      log: null,
      isEmptyRow: true,
      hasEditActions: false,
      ...rowDefaults,
    }))
  }

  const rows: LogbookTableRow[] = []

  let prevRowNo = 0
  logs.forEach((log) => {
    const blankRowsOnPage = Math.max(0, log.ajlbRowNo - 1 - prevRowNo)
    rows.push(
      ...Array.from({ length: blankRowsOnPage }, () => ({
        log,
        isEmptyRow: true,
        hasEditActions: true,
        ...rowDefaults,
      })),
    )

    rows.push({
      log,
      isEmptyRow: false,
      hasEditActions: false,
      ...rowDefaults,
    })

    prevRowNo = log.ajlbRowNo
  })

  const trailingEmptyRows = Math.max(0, pageSize - rows.length)
  rows.push(
    ...Array.from({ length: trailingEmptyRows }, () => ({
      log: null,
      isEmptyRow: true,
      hasEditActions: false,
      ...rowDefaults,
    })),
  )

  return rows
}

const FlightLogsList = () => {
  const { t } = useTranslation()

  const { aircraftRegistration, ajlbSeqNo } = useParams()

  const { me, isFlightLogAdmin, hasAccess } = useRoles()

  // selected aircraft journey log books
  const { data: ajlb, mutate: mutateLogbooks } = useApi<AircraftJourneyLogBook>({
    url: `v1/ajlb/${aircraftRegistration}/${ajlbSeqNo}`,
    skipFetch: !aircraftRegistration || !ajlbSeqNo,
  })

  const { formatTime } = useTimezone()

  const [problem, setProblem] = useState<Problem | undefined>(undefined)
  const [addNoteOpen, setAddNoteOpen] = useState(false)
  const [addDefectOpen, setAddDefectOpen] = useState(false)
  const [addDefectFlightId, setAddDefectFlightId] = useState<string | null>(null)
  const [addDefectFlightMins, setAddDefectFlightMins] = useState<number | undefined>(undefined)

  const [searchParams, setSearchParams] = useSearchParams()
  const scrollToRef = useScrollOnRender()

  // Deep link from the HIL page: /logs/books/OH-XYZ/1?closeHil=<hilId>
  const closeHilId = searchParams.get('closeHil') ?? undefined
  useEffect(() => {
    if (closeHilId) setAddNoteOpen(true)
  }, [closeHilId])

  // Clears closeHil once the dialog it opened is done with, so a later,
  // unrelated "Add Maintenance Note" doesn't silently re-select the same HIL.
  const handleCloseAddNote = () => {
    setAddNoteOpen(false)
    if (closeHilId) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('closeHil')
        return next
      })
    }
  }

  // Deep link from the HIL page's linked-defect link:
  // /logs/books/OH-XYZ/1?page=N&highlightDefect=<defectId>
  const highlightDefectId = searchParams.get('highlightDefect') ?? undefined

  // Deep link from a defect's "resolved by" link:
  // /logs/books/OH-XYZ/1?page=N&highlightNote=<noteId>
  const highlightNoteId = searchParams.get('highlightNote') ?? undefined

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

  useEffect(() => {
    if (!highlightDefectId) return
    document
      .getElementById(`defect-${highlightDefectId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightDefectId, data])

  const { data: maintenanceNotes, mutate: mutateNotes } = useMaintenanceNotes(
    ajlb?.aircraftRegistration,
    ajlb?.seqNo,
  )

  useEffect(() => {
    if (!highlightNoteId) return
    document
      .getElementById(`note-${highlightNoteId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightNoteId, maintenanceNotes])

  const { data: defects, mutate: mutateDefects } = useDefects(
    ajlb?.aircraftRegistration,
    ajlb?.seqNo,
  )

  const isFlightLogUser = hasAccess(MIKPermissions.FLIGHTLOG_USER)
  // Reporting a defect is a baseline flying-rights action: a plane captain
  // should be able to do it even outside sudo mode, so this checks the raw
  // admin permission rather than the sudo-gated isFlightLogAdmin.
  const canReportDefects = isFlightLogUser || hasAccess(MIKPermissions.FLIGHTLOG_ADMIN)

  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up('md'))
  const isSmUp = useMediaQuery(theme.breakpoints.up('sm'))

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

  const Actions = ({
    log,
    onAddInFlightDefect,
  }: {
    log: FlightLogListEntry
    onAddInFlightDefect: () => void
  }) => {
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
    const menuOpen = Boolean(menuAnchor)

    const adminActions =
      isFlightLogAdmin && log.status == FlightLogStatus.NEW
        ? [
            ...(log.ajlbBlankRowsBefore > 0
              ? [
                  {
                    key: 'remove-blank',
                    title: t('flightLog.logbooks.deleteBlankRow'),
                    icon: 'mdi:table-row-remove',
                    onClick: () =>
                      updateEntry(log, {
                        ajlbBlankRowsBefore: log.ajlbBlankRowsBefore - 1,
                      }),
                  },
                ]
              : []),
            {
              key: 'add-blank',
              title: t('flightLog.logbooks.addBlankRow'),
              icon: 'mdi:table-row-plus-before',
              onClick: () =>
                updateEntry(log, {
                  ajlbBlankRowsBefore: log.ajlbBlankRowsBefore + 1,
                }),
            },
          ]
        : []

    // On mobile: collapse secondary actions into a kebab menu
    if (!isSmUp && (canReportDefects || adminActions.length > 0)) {
      return (
        <Stack direction='row' spacing={0.5} sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <StatusButton
            log={log}
            update={editableItem === log ? () => validateEntry(log) : undefined}
          />
          <IconButton
            size='small'
            aria-label={t('common.moreActions')}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            <Icon icon='mdi:dots-vertical' width={20} />
          </IconButton>
          <Menu anchorEl={menuAnchor} open={menuOpen} onClose={() => setMenuAnchor(null)}>
            {canReportDefects && (
              <MuiMenuItem
                onClick={() => {
                  setMenuAnchor(null)
                  onAddInFlightDefect()
                }}
              >
                <ListItemIcon>
                  <Icon icon='mdi:alert-circle-outline' width={20} />
                </ListItemIcon>
                <ListItemText>{t('flightLog.defects.addInFlightButton')}</ListItemText>
              </MuiMenuItem>
            )}
            {adminActions.map((action) => (
              <MuiMenuItem
                key={action.key}
                onClick={() => {
                  setMenuAnchor(null)
                  action.onClick()
                }}
              >
                <ListItemIcon>
                  <Icon icon={action.icon} width={20} />
                </ListItemIcon>
                <ListItemText>{action.title}</ListItemText>
              </MuiMenuItem>
            ))}
          </Menu>
        </Stack>
      )
    }

    return (
      <Stack
        direction='row'
        spacing={1}
        sx={{
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
      >
        <StatusButton
          log={log}
          update={editableItem === log ? () => validateEntry(log) : undefined}
        />

        {canReportDefects && (
          <EditButton
            title={t('flightLog.defects.addInFlightButton')}
            onClick={onAddInFlightDefect}
            icon='mdi:alert-circle-outline'
            width={20}
          />
        )}

        {adminActions.map((action) => (
          <EditButton
            key={action.key}
            title={action.title}
            onClick={action.onClick}
            icon={action.icon}
          />
        ))}
      </Stack>
    )
  }

  const logsWithEmptyRows = buildLogbookRows(data?.logs, ajlb?.rowsPerPage ?? 0)

  // Build a map from flightId -> IN_FLIGHT defects for chip rendering on flight rows.
  const inFlightDefectsMap: Record<string, Defect[]> = {}
  defects?.forEach((d) => {
    if (d.flightId) {
      inFlightDefectsMap[d.flightId] = [...(inFlightDefectsMap[d.flightId] ?? []), d]
    }
  })

  // Merge maintenance notes and PRE_FLIGHT defects into the row list at the correct
  // position. An item at flight_mins X is placed after the last flight row whose
  // acTotalFlightMins <= X (i.e. just after the flight that reached that time).
  const mergedRows = (() => {
    if (!logsWithEmptyRows) return []

    type InsertKind =
      | {
          kind: 'note'
          note: MaintenanceNote
          blankRowsAfter: number
          flightMins: number
          sortKey: string
        }
      | {
          kind: 'defect'
          defect: Defect
          blankRowsAfter: number
          flightMins: number
          sortKey: string
        }

    const itemsToInsert: InsertKind[] = [
      ...(maintenanceNotes ?? []).map((n) => ({
        kind: 'note' as const,
        note: n,
        blankRowsAfter: n.blankRowsAfter,
        flightMins: n.flightMins,
        sortKey: n.createdAt,
      })),
      ...(defects ?? [])
        .filter((d) => !d.flightId)
        .map((d) => ({
          kind: 'defect' as const,
          defect: d,
          blankRowsAfter: d.blankRowsAfter,
          flightMins: d.flightMins,
          sortKey: d.createdAt,
        })),
    ].sort((a, b) => a.flightMins - b.flightMins || a.sortKey.localeCompare(b.sortKey))

    const rowDefaults = {
      note: undefined as MaintenanceNote | undefined,
      isNoteRow: false,
      isNoteBlankRow: false,
      defect: undefined as Defect | undefined,
      isDefectRow: false,
      isDefectBlankRow: false,
    }

    const result: LogbookTableRow[] = []
    let insertIdx = 0
    // Initialise to the last flight total of the previous page so items from
    // earlier pages are not re-inserted here (cross-page bleed prevention).
    let prevLogMins = data?.pageStartFlightMins ?? -1

    for (let i = 0; i < logsWithEmptyRows.length; i++) {
      const row = logsWithEmptyRows[i]

      // Annotate flight rows with their IN_FLIGHT defects.
      const inFlightDefects =
        !row.isEmptyRow && row.log ? (inFlightDefectsMap[row.log.flightId] ?? []) : []

      result.push({ ...row, ...rowDefaults, inFlightDefects })

      if (!row.isEmptyRow && row.log) {
        const logMins = row.log.acTotalFlightMins ?? 0
        // Insert items whose flightMins falls in (prevLogMins, logMins].
        while (
          insertIdx < itemsToInsert.length &&
          itemsToInsert[insertIdx].flightMins <= logMins &&
          itemsToInsert[insertIdx].flightMins > prevLogMins
        ) {
          const item = itemsToInsert[insertIdx]
          if (item.kind === 'note') {
            result.push({
              log: row.log,
              isEmptyRow: false,
              hasEditActions: false,
              note: item.note,
              isNoteRow: true,
              isNoteBlankRow: false,
              defect: undefined,
              isDefectRow: false,
              isDefectBlankRow: false,
              inFlightDefects: [],
            })
            for (let b = 0; b < item.blankRowsAfter; b++) {
              result.push({
                log: row.log,
                isEmptyRow: true,
                hasEditActions: false,
                note: item.note,
                isNoteRow: false,
                isNoteBlankRow: true,
                defect: undefined,
                isDefectRow: false,
                isDefectBlankRow: false,
                inFlightDefects: [],
              })
            }
          } else {
            result.push({
              log: row.log,
              isEmptyRow: false,
              hasEditActions: false,
              note: undefined,
              isNoteRow: false,
              isNoteBlankRow: false,
              defect: item.defect,
              isDefectRow: true,
              isDefectBlankRow: false,
              inFlightDefects: [],
            })
            for (let b = 0; b < item.blankRowsAfter; b++) {
              result.push({
                log: row.log,
                isEmptyRow: true,
                hasEditActions: false,
                note: undefined,
                isNoteRow: false,
                isNoteBlankRow: false,
                defect: item.defect,
                isDefectRow: false,
                isDefectBlankRow: true,
                inFlightDefects: [],
              })
            }
          }
          insertIdx++
        }
        prevLogMins = logMins
      }
    }

    return result
  })()

  return (
    <Box>
      <SnackAlert problem={problem} />
      <Breadcrumbs sx={{ my: 2 }}>
        <Link to='/logs/books'>{t('flightLog.logbooks.ajlb')}</Link>
        <Typography
          sx={{
            color: 'text.primary',
          }}
        >
          {aircraftRegistration} / {ajlb?.seqNo}
        </Typography>
      </Breadcrumbs>
      <Title label={t('flightLog.logbooks.title')} />
      {ajlb && (isFlightLogAdmin || canReportDefects) && (
        <Stack direction='row' spacing={1} sx={{ mb: 2 }}>
          {isFlightLogAdmin && (
            <Button
              variant='outlined'
              startIcon={<Icon icon='mdi:wrench-clock' />}
              onClick={() => setAddNoteOpen(true)}
              size='small'
            >
              {t('flightLog.maintenanceNotes.addButton')}
            </Button>
          )}
          {canReportDefects && (
            <Button
              variant='outlined'
              color='error'
              startIcon={<Icon icon='mdi:alert-circle-outline' />}
              onClick={() => {
                setAddDefectFlightId(null)
                setAddDefectFlightMins(
                  data?.logs[data.logs.length - 1]?.acTotalFlightMins ?? undefined,
                )
                setAddDefectOpen(true)
              }}
              size='small'
            >
              {t('flightLog.defects.addPreFlightButton')}
            </Button>
          )}
        </Stack>
      )}
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
              <Grid
                size={1}
                sx={{
                  textAlign: 'center',
                }}
              >
                {t('flightLog.logbooks.status')}
              </Grid>
            </>
          }
          notFoundMsg={t('flightLog.noLogs')}
          rows={mergedRows}
          rowProps={() => ({
            minHeight: rowHeight,
          })}
          row={({
            log,
            isEmptyRow,
            hasEditActions,
            note,
            isNoteRow,
            isNoteBlankRow,
            defect,
            isDefectRow,
            isDefectBlankRow,
            inFlightDefects,
          }) => {
            if (isNoteRow && note) {
              return (
                <Box sx={{ gridColumn: '1 / -1', width: '100%', py: 0.25 }}>
                  <MaintenanceNoteMarker
                    note={note}
                    onChanged={() => mutateNotes()}
                    highlighted={note.noteId === highlightNoteId}
                  />
                </Box>
              )
            }

            if (isNoteBlankRow) {
              return <></>
            }

            if (isDefectRow && defect && ajlb) {
              return (
                <Box sx={{ gridColumn: '1 / -1', width: '100%', py: 0.25 }}>
                  <DefectMarker
                    defect={defect}
                    aircraftRegistration={ajlb.aircraftRegistration}
                    onChanged={() => mutateDefects()}
                    highlighted={defect.defectId === highlightDefectId}
                  />
                </Box>
              )
            }

            if (isDefectBlankRow) {
              return <></>
            }

            if (isEmptyRow) {
              if (hasEditActions && log && isFlightLogAdmin && log.status === FlightLogStatus.NEW) {
                return (
                  <Stack
                    direction='row-reverse'
                    spacing={1}
                    sx={{
                      width: '100%',
                    }}
                  >
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

            const handleAddInFlightDefect = () => {
              setAddDefectFlightId(log.flightId)

              const fallbackMinsFromTime = (() => {
                const [h, m] = (log.acTotalFlightTime ?? '0:0').split(':')
                const hh = Number(h)
                const mm = Number(m)
                return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : undefined
              })()

              setAddDefectFlightMins(log.acTotalFlightMins ?? fallbackMinsFromTime)
              setAddDefectOpen(true)
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
                      <Box
                        sx={{
                          color: 'text.secondary',
                        }}
                      >
                        {formatTime(log.takeoffTimeUtc)}
                      </Box>
                    </Grid>

                    <Grid size={1}>
                      <Box>{log.arrivalAirport}</Box>
                      <Box
                        sx={{
                          color: 'text.secondary',
                        }}
                      >
                        {formatTime(log.landingTimeUtc)}
                      </Box>
                    </Grid>

                    <Grid size={1.1}>{log.flightTime}</Grid>

                    <Grid size={1.1}>{log.acTotalFlightTime}</Grid>

                    <Grid size={0.8}>
                      <Box>{log.numberOfLandings}</Box>
                      {log.acTotalLandings != null && (
                        <Box
                          sx={{
                            color: 'text.secondary',
                            fontSize: '0.75em',
                          }}
                        >
                          {log.acTotalLandings}
                        </Box>
                      )}
                    </Grid>

                    <Grid size={1.2}>{t(`flightLog.flightTypes.${log.flightType}`)}</Grid>

                    <Grid
                      size={1}
                      sx={{
                        alignSelf: 'center',
                        justifyItems: 'end',
                      }}
                    >
                      <Actions log={log} onAddInFlightDefect={handleAddInFlightDefect} />
                    </Grid>

                    {inFlightDefects.length > 0 && ajlb && (
                      <Grid size={12} sx={{ pt: 0, pb: 0.5 }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {inFlightDefects.map((d) => (
                            <DefectMarker
                              key={d.defectId}
                              defect={d}
                              aircraftRegistration={ajlb.aircraftRegistration}
                              onChanged={() => mutateDefects()}
                              highlighted={d.defectId === highlightDefectId}
                            />
                          ))}
                        </Box>
                      </Grid>
                    )}
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
                      <Actions log={log} onAddInFlightDefect={handleAddInFlightDefect} />
                    </ViewMobileFlightDetails>

                    <ViewMobileCrew
                      size={4}
                      personsOnBoard={log.personsOnBoard}
                      crew={[log.picLastName, log.crew2LastName]}
                    />
                    <Grid size={8}>
                      <FlightLogTimeline
                        departureAirport={log.departureAirport}
                        arrivalAirport={log.arrivalAirport}
                        takeoffTimeUtc={log.takeoffTimeUtc}
                        landingTimeUtc={log.landingTimeUtc}
                        flightTime={log.flightTime}
                        secondaryTime={log.acTotalFlightTime}
                      />
                    </Grid>

                    {inFlightDefects.length > 0 && ajlb && (
                      <Grid size={12} sx={{ pt: 0, pb: 0.5 }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {inFlightDefects.map((d) => (
                            <DefectMarker
                              key={d.defectId}
                              defect={d}
                              aircraftRegistration={ajlb.aircraftRegistration}
                              onChanged={() => mutateDefects()}
                              highlighted={d.defectId === highlightDefectId}
                            />
                          ))}
                        </Box>
                      </Grid>
                    )}
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
          showFirstButton={isSmUp}
          showLastButton={isSmUp}
          siblingCount={isSmUp ? 2 : 1}
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
      {ajlb && (
        <AddMaintenanceNoteDialog
          open={addNoteOpen}
          onClose={handleCloseAddNote}
          onSuccess={() => {
            handleCloseAddNote()
            mutateNotes()
            mutateDefects()
          }}
          aircraftRegistration={ajlb.aircraftRegistration}
          ajlbSeqNo={ajlb.seqNo}
          defaultFlightMins={data?.logs[data.logs.length - 1]?.acTotalFlightMins ?? undefined}
          defaultHilIds={closeHilId ? [closeHilId] : undefined}
        />
      )}
      {ajlb && (
        <AddDefectDialog
          open={addDefectOpen}
          onClose={() => setAddDefectOpen(false)}
          onSuccess={() => {
            setAddDefectOpen(false)
            mutateDefects()
          }}
          aircraftRegistration={ajlb.aircraftRegistration}
          ajlbSeqNo={ajlb.seqNo}
          flightId={addDefectFlightId}
          defaultFlightMins={addDefectFlightMins}
        />
      )}
    </Box>
  )
}

export default FlightLogsList
