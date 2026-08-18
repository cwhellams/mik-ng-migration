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
import { Link, useParams, useSearchParams } from 'react-router'
import {
  FlightLog,
  FlightLogUpsertRequest,
  FlightLogListEntry,
  FlightLogListResponse,
  FlightLogStatus,
  PageItemRow,
} from '@mik/contracts/flight-log'
import { RemoteContent } from '../../components/RemoteContent'
import { useRoles } from '../../hooks/useRoles'
import { useScrollOnRender } from '../../hooks/useScrollOnRender'
import { AircraftJourneyLogBook } from '@mik/contracts/ajlb'
import { useEffect, useMemo, useState } from 'react'
import { EditButton } from '../../components/EditButton'
import { Problem } from '@mik/contracts/problem'
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
import type { MaintenanceNote } from '@mik/contracts/maintenance-notes'
import type { Defect } from '@mik/contracts/defects'
import { MIKPermissions } from '@mik/contracts/members'

// A maintenance note / defect that renders inline as a chip on its anchor
// flight's row instead of consuming a row of its own (rows: 0 -- an in-flight
// defect, or a note/defect explicitly given no row of its own).
export type LogbookInsertItem =
  | { kind: 'note'; note: MaintenanceNote; flightMins: number; sortKey: string }
  | { kind: 'defect'; defect: Defect; flightMins: number; sortKey: string }

// Notes and defects positioned as inline chips share one ordered, position-based
// sequence (sorted by flightMins, then createdAt as a tie-break) -- this must
// match the anchoring order flight.vw_ajlb_live_sequence computes server-side.
// Own-row (rows > 0) items are NOT included here: their exact page/row placement
// comes from the server (see PageItemRow / flight.vw_ajlb_live_rows) instead of
// being reconstructed client-side, since an item's rows can straddle a page
// boundary in a way flightMins comparisons alone can't reliably reproduce.
export const buildInlineItems = (
  notes: MaintenanceNote[] | undefined,
  defects: Defect[] | undefined,
): LogbookInsertItem[] =>
  [
    ...(notes ?? [])
      .filter((note) => note.rows === 0)
      .map((note): LogbookInsertItem => ({
        kind: 'note',
        note,
        flightMins: note.flightMins,
        sortKey: note.createdAt,
      })),
    ...(defects ?? [])
      .filter((defect) => defect.rows === 0)
      .map((defect): LogbookInsertItem => ({
        kind: 'defect',
        defect,
        flightMins: defect.flightMins,
        sortKey: defect.createdAt,
      })),
  ].sort((a, b) => a.flightMins - b.flightMins || a.sortKey.localeCompare(b.sortKey))

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
  inlineItems: LogbookInsertItem[]
}

// A blank continuation/spacer row is still consumed by the note/defect above or
// below it -- distinguishing it from a genuinely empty row (isEmptyRow but not
// this) is what tells the reader it isn't available for a new flight.
export const isBlankButUsedRow = (row: LogbookTableRow): boolean =>
  row.isNoteBlankRow || row.isDefectBlankRow

const rowDefaults = {
  note: undefined as MaintenanceNote | undefined,
  isNoteRow: false,
  isNoteBlankRow: false,
  defect: undefined as Defect | undefined,
  isDefectRow: false,
  isDefectBlankRow: false,
  inlineItems: [] as LogbookInsertItem[],
}

const trailingInlineRow = (item: LogbookInsertItem): LogbookTableRow => ({
  log: null,
  isEmptyRow: false,
  hasEditActions: false,
  note: item.kind === 'note' ? item.note : undefined,
  isNoteRow: item.kind === 'note',
  isNoteBlankRow: false,
  defect: item.kind === 'defect' ? item.defect : undefined,
  isDefectRow: item.kind === 'defect',
  isDefectBlankRow: false,
  inlineItems: [],
})

// Builds one page's worth of rows from three sources: `logs` (flights, keyed by
// their own per-page ajlbRowNo), `pageItemRows` (the exact physical-row placement
// of own-row notes/defects on this page, computed server-side from
// flight.vw_ajlb_live_rows -- see that view for why an item's rows can straddle a
// page boundary in a way that can't be reliably reconstructed from flightMins
// comparisons alone), and `inlineItems` (rows === 0 chips, bucketed onto their
// anchor flight's row). A row number claimed by neither a flight nor a
// pageItemRow is genuinely blank.
export const buildLogbookRows = (
  logs: FlightLogListEntry[] | undefined,
  pageItemRows: PageItemRow[],
  inlineItems: LogbookInsertItem[],
  notesById: Record<string, MaintenanceNote>,
  defectsById: Record<string, Defect>,
  pageSize: number,
  pageStartFlightMins: number | null,
): LogbookTableRow[] => {
  if (!logs?.length && !pageItemRows.length && !inlineItems.length) {
    return Array.from({ length: pageSize }, () => ({
      log: null,
      isEmptyRow: true,
      hasEditActions: false,
      ...rowDefaults,
    }))
  }

  // Genuine in-flight defects (flightId set at creation) attach directly to
  // their flight by id -- immune to any drift in flightMins bucketing if an
  // earlier NEW flight's timing is later edited or the flight is deleted,
  // which would shift every subsequent flight's cumulative ac_total_flight_mins
  // and could otherwise silently re-anchor the chip onto a different flight.
  // Everything else (notes, and defects with no flightId) has no such fixed
  // reference and is positioned purely by flightMins.
  const inlineByFlightId: Record<string, LogbookInsertItem[]> = {}
  const positionedInline: LogbookInsertItem[] = []
  inlineItems.forEach((item) => {
    if (item.kind === 'defect' && item.defect.flightId) {
      inlineByFlightId[item.defect.flightId] = [
        ...(inlineByFlightId[item.defect.flightId] ?? []),
        item,
      ]
    } else {
      positionedInline.push(item)
    }
  })

  let inlineIdx = 0
  let prevLogMins = pageStartFlightMins ?? -1
  // Buckets position-anchored inline (rows === 0) items in (prevLogMins,
  // logMins] -- these never consume a row, they render as chips on the
  // flight's own row.
  const collectInlineItemsUpTo = (logMins: number): LogbookInsertItem[] => {
    const collected: LogbookInsertItem[] = []
    while (
      inlineIdx < positionedInline.length &&
      positionedInline[inlineIdx].flightMins <= logMins &&
      positionedInline[inlineIdx].flightMins > prevLogMins
    ) {
      collected.push(positionedInline[inlineIdx])
      inlineIdx++
    }
    return collected
  }

  const logsByRowNumber = new Map<number, FlightLogListEntry>()
  logs?.forEach((log) => logsByRowNumber.set(log.ajlbRowNo, log))

  const itemRowsByNumber = new Map<number, PageItemRow>()
  pageItemRows.forEach((row) => itemRowsByNumber.set(row.rowNumber, row))

  const maxRowNumber = Math.max(
    pageSize,
    ...(logs ?? []).map((log) => log.ajlbRowNo),
    ...pageItemRows.map((row) => row.rowNumber),
  )

  // A genuinely blank row between two flights is always that NEXT flight's own
  // ajlbBlankRowsBefore padding (nothing else can be interposed inside it -- see
  // flight.vw_ajlb_live_sequence, where a flight's own blank-before rows are part
  // of its own atomic rows_consumed block), so admin controls need a reference to
  // that flight to offer a "remove this blank row" action.
  const nextFlightFrom = new Map<number, FlightLogListEntry>()
  let upcoming: FlightLogListEntry | null = null
  for (let rowNumber = maxRowNumber; rowNumber >= 1; rowNumber--) {
    if (upcoming) nextFlightFrom.set(rowNumber, upcoming)
    const log = logsByRowNumber.get(rowNumber)
    if (log) upcoming = log
  }

  const rows: LogbookTableRow[] = []
  let lastFlightRowIdx = -1

  for (let rowNumber = 1; rowNumber <= maxRowNumber; rowNumber++) {
    const log = logsByRowNumber.get(rowNumber)
    const pageItemRow = itemRowsByNumber.get(rowNumber)

    if (log) {
      const logMins = log.acTotalFlightMins ?? 0
      rows.push({
        log,
        isEmptyRow: false,
        hasEditActions: false,
        ...rowDefaults,
        inlineItems: [
          ...collectInlineItemsUpTo(logMins),
          ...(inlineByFlightId[log.flightId] ?? []),
        ],
      })
      lastFlightRowIdx = rows.length - 1
      prevLogMins = logMins
    } else if (pageItemRow) {
      const note = pageItemRow.itemType === 'note' ? notesById[pageItemRow.itemId] : undefined
      const defect = pageItemRow.itemType === 'defect' ? defectsById[pageItemRow.itemId] : undefined
      rows.push({
        log: null,
        isEmptyRow: !pageItemRow.isContentRow,
        hasEditActions: false,
        ...rowDefaults,
        note,
        isNoteRow: pageItemRow.itemType === 'note' && pageItemRow.isContentRow && !!note,
        isNoteBlankRow: pageItemRow.itemType === 'note' && !pageItemRow.isContentRow,
        defect,
        isDefectRow: pageItemRow.itemType === 'defect' && pageItemRow.isContentRow && !!defect,
        isDefectBlankRow: pageItemRow.itemType === 'defect' && !pageItemRow.isContentRow,
      })
    } else {
      const next = nextFlightFrom.get(rowNumber) ?? null
      rows.push({
        log: next,
        isEmptyRow: true,
        hasEditActions: !!next,
        ...rowDefaults,
      })
    }
  }

  // Inline items anchored past every flight/item on this page: merge onto the
  // last flight's chip row if one exists, so they're never silently dropped
  // from view; if the page has no flights at all, fall back to rendering them
  // as their own row.
  const trailingInline = collectInlineItemsUpTo(Infinity)
  if (trailingInline.length) {
    if (lastFlightRowIdx !== -1) {
      rows[lastFlightRowIdx] = {
        ...rows[lastFlightRowIdx],
        inlineItems: [...rows[lastFlightRowIdx].inlineItems, ...trailingInline],
      }
    } else {
      trailingInline.forEach((item) => rows.push(trailingInlineRow(item)))
    }
  }

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

  const { data, isLoading, error, mutation, mutate } = useApi<FlightLogListResponse, FlightLog>(
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

  // A note/defect's rows can shift data.pageItemRows (the server's
  // physical-row placement for this page), so any change to either must also
  // refresh the flight-logs list, not just the note/defect list itself.
  const refreshAfterNoteChange = () => {
    mutateNotes()
    mutate()
  }
  const refreshAfterDefectChange = () => {
    mutateDefects()
    mutate()
  }

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

  const Actions = ({ log }: { log: FlightLogListEntry }) => {
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
    if (!isSmUp && adminActions.length > 0) {
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

  // Notes and defects with rows === 0 render as chips on their anchor flight's
  // row (the traditional in-flight-defect chip, now unified for both kinds).
  // Own-row (rows > 0) items are placed directly from data.pageItemRows, the
  // server's exact physical-row breakdown for this page -- see buildLogbookRows.
  const inlineItems = useMemo(
    () => buildInlineItems(maintenanceNotes, defects),
    [maintenanceNotes, defects],
  )
  const notesById = useMemo(
    () => Object.fromEntries((maintenanceNotes ?? []).map((note) => [note.noteId, note])),
    [maintenanceNotes],
  )
  const defectsById = useMemo(
    () => Object.fromEntries((defects ?? []).map((defect) => [defect.defectId, defect])),
    [defects],
  )

  const mergedRows = useMemo(
    () =>
      buildLogbookRows(
        data?.logs,
        data?.pageItemRows ?? [],
        inlineItems,
        notesById,
        defectsById,
        ajlb?.rowsPerPage ?? 0,
        data?.pageStartFlightMins ?? null,
      ),
    [
      data?.logs,
      data?.pageItemRows,
      inlineItems,
      notesById,
      defectsById,
      ajlb?.rowsPerPage,
      data?.pageStartFlightMins,
    ],
  )

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
                setAddDefectFlightMins(ajlb?.view?.unverifiedTotalFlightMins)
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
          rowProps={(row) => ({
            minHeight: rowHeight,
            ...(isBlankButUsedRow(row) && { bgcolor: 'action.hover' }),
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
            inlineItems,
          }) => {
            if (isNoteRow && note) {
              return (
                <Box sx={{ gridColumn: '1 / -1', width: '100%', py: 0.25 }}>
                  <MaintenanceNoteMarker
                    note={note}
                    onChanged={refreshAfterNoteChange}
                    highlighted={note.noteId === highlightNoteId}
                    recordedDate={note.createdAt}
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
                    onChanged={refreshAfterDefectChange}
                    highlighted={defect.defectId === highlightDefectId}
                    recordedDate={defect.createdAt}
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
                      <Actions log={log} />
                    </Grid>

                    {inlineItems.length > 0 && ajlb && (
                      <Grid size={12} sx={{ pt: 0, pb: 0.5 }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {inlineItems.map((item) =>
                            item.kind === 'defect' ? (
                              <DefectMarker
                                key={item.defect.defectId}
                                defect={item.defect}
                                aircraftRegistration={ajlb.aircraftRegistration}
                                onChanged={refreshAfterDefectChange}
                                highlighted={item.defect.defectId === highlightDefectId}
                              />
                            ) : (
                              <MaintenanceNoteMarker
                                key={item.note.noteId}
                                note={item.note}
                                onChanged={refreshAfterNoteChange}
                                highlighted={item.note.noteId === highlightNoteId}
                              />
                            ),
                          )}
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
                      <Actions log={log} />
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

                    {inlineItems.length > 0 && ajlb && (
                      <Grid size={12} sx={{ pt: 0, pb: 0.5 }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {inlineItems.map((item) =>
                            item.kind === 'defect' ? (
                              <DefectMarker
                                key={item.defect.defectId}
                                defect={item.defect}
                                aircraftRegistration={ajlb.aircraftRegistration}
                                onChanged={refreshAfterDefectChange}
                                highlighted={item.defect.defectId === highlightDefectId}
                              />
                            ) : (
                              <MaintenanceNoteMarker
                                key={item.note.noteId}
                                note={item.note}
                                onChanged={refreshAfterNoteChange}
                                highlighted={item.note.noteId === highlightNoteId}
                              />
                            ),
                          )}
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
            mutate()
          }}
          aircraftRegistration={ajlb.aircraftRegistration}
          ajlbSeqNo={ajlb.seqNo}
          defaultFlightMins={ajlb.view?.unverifiedTotalFlightMins}
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
            mutate()
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
