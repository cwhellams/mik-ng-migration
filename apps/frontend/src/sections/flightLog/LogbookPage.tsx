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

// A maintenance note / defect positioned to be inserted into the logbook row
// sequence. `rows` is how many rows the item's own content occupies (0 =
// renders inline as a chip on its anchor flight's row instead of its own
// row); `blankRowsAfter` is extra spacer rows rendered after it.
export type LogbookInsertItem =
  | {
      kind: 'note'
      note: MaintenanceNote
      rows: number
      blankRowsAfter: number
      flightMins: number
      sortKey: string
    }
  | {
      kind: 'defect'
      defect: Defect
      rows: number
      blankRowsAfter: number
      flightMins: number
      sortKey: string
    }

// Notes and defects share one ordered, position-based insertion sequence
// (sorted by flightMins, then createdAt as a tie-break) -- this must match
// the anchoring order flight.vw_ajlb_live_sequence computes server-side.
export const buildInsertItems = (
  notes: MaintenanceNote[] | undefined,
  defects: Defect[] | undefined,
): LogbookInsertItem[] =>
  [
    ...(notes ?? []).map((note): LogbookInsertItem => ({
      kind: 'note',
      note,
      rows: note.rows,
      blankRowsAfter: note.blankRowsAfter,
      flightMins: note.flightMins,
      sortKey: note.createdAt,
    })),
    ...(defects ?? []).map((defect): LogbookInsertItem => ({
      kind: 'defect',
      defect,
      rows: defect.rows,
      blankRowsAfter: defect.blankRowsAfter,
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

const rowDefaults = {
  note: undefined as MaintenanceNote | undefined,
  isNoteRow: false,
  isNoteBlankRow: false,
  defect: undefined as Defect | undefined,
  isDefectRow: false,
  isDefectBlankRow: false,
  inlineItems: [] as LogbookInsertItem[],
}

const itemRow = (
  item: LogbookInsertItem,
  anchorLog: FlightLogListEntry | null,
  isBlank: boolean,
): LogbookTableRow => ({
  log: anchorLog,
  isEmptyRow: isBlank,
  hasEditActions: false,
  note: item.kind === 'note' ? item.note : undefined,
  isNoteRow: item.kind === 'note' && !isBlank,
  isNoteBlankRow: item.kind === 'note' && isBlank,
  defect: item.kind === 'defect' ? item.defect : undefined,
  isDefectRow: item.kind === 'defect' && !isBlank,
  isDefectBlankRow: item.kind === 'defect' && isBlank,
  inlineItems: [],
})

// Builds one page's worth of rows by walking flights and own-row items
// (rows > 0) together in position order, and bucketing inline items
// (rows === 0) onto their anchor flight's row as chips. The gap between two
// flights' ajlbRowNo (computed server-side by flight.vw_ajlb_live_sequence,
// which already reserves room for anchored items) is the shared budget that
// own-row items and manual blank-rows-before both draw from -- this is what
// keeps a page from growing past pageSize when an item is inserted.
export const buildLogbookRows = (
  logs: FlightLogListEntry[] | undefined,
  ownRowItems: LogbookInsertItem[],
  inlineItems: LogbookInsertItem[],
  pageSize: number,
  pageStartFlightMins: number | null,
): LogbookTableRow[] => {
  if (!logs?.length && !ownRowItems.length && !inlineItems.length) {
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
  // reference and is positioned purely by flightMins, same as own-row items.
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

  const rows: LogbookTableRow[] = []
  let prevRowNo = 0
  let prevLogMins = pageStartFlightMins ?? -1
  let ownIdx = 0
  let inlineIdx = 0
  // Rows consumed by items anchored to the flight just pushed -- the NEXT
  // flight's ajlbRowNo gap already includes them, so it must be subtracted
  // back out before padding with genuine manual blank rows.
  let pendingConsumed = 0

  // Consumes own-row items anchored in (prevLogMins, logMins], pushing each
  // item's own marker row(s) unconditionally -- an item's marker is never
  // skipped, because the next page's bleed guard (pageStartFlightMins) is
  // keyed to the last FLIGHT's total, not to items already rendered after
  // it; an item anchored to this page's very last flight would otherwise
  // become permanently invisible (excluded here by a budget cap, then also
  // excluded on the next page since its flightMins doesn't exceed that
  // flight's total there either). blankRowsAfter is pure decorative filler,
  // not data, so it's safe to clip at `maxRows` (pageSize) instead -- the
  // clipped rows simply reappear as ordinary blank padding at the top of the
  // next page via that page's own ajlbRowNo gap calculation.
  const insertOwnRowItemsUpTo = (
    logMins: number,
    anchorLog: FlightLogListEntry | null,
    maxRows: number,
  ) => {
    while (
      ownIdx < ownRowItems.length &&
      ownRowItems[ownIdx].flightMins <= logMins &&
      ownRowItems[ownIdx].flightMins > prevLogMins
    ) {
      const item = ownRowItems[ownIdx]
      rows.push(itemRow(item, anchorLog, false))
      for (let r = 1; r < item.rows; r++) rows.push(itemRow(item, anchorLog, true))
      const blanksToRender = Math.max(0, Math.min(item.blankRowsAfter, maxRows - rows.length))
      for (let b = 0; b < blanksToRender; b++) rows.push(itemRow(item, anchorLog, true))
      ownIdx++
    }
  }

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

  logs?.forEach((log) => {
    const logMins = log.acTotalFlightMins ?? 0
    const gap = Math.max(0, log.ajlbRowNo - 1 - prevRowNo)

    const trulyBlank = Math.max(0, gap - pendingConsumed)
    rows.push(
      ...Array.from({ length: trulyBlank }, () => ({
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
      inlineItems: [...collectInlineItemsUpTo(logMins), ...(inlineByFlightId[log.flightId] ?? [])],
    })

    const rowsBeforeItems = rows.length
    insertOwnRowItemsUpTo(logMins, log, pageSize)
    pendingConsumed = rows.length - rowsBeforeItems

    prevRowNo = log.ajlbRowNo
    prevLogMins = logMins
  })

  // Items anchored past the last flight on this page -- or, when the page has
  // no flights at all yet, the very first row(s) of the page.
  const lastLog = logs?.length ? logs[logs.length - 1] : null
  insertOwnRowItemsUpTo(Infinity, lastLog, pageSize)

  // Position-anchored inline items with no flight left on this page to
  // attach to (flightMins past every flight in `logs`): merge onto the last
  // flight's chip row if one exists, so they're never silently dropped from
  // view; if the page has no flights at all, fall back to rendering them as
  // their own row (breaking the "0 rows never consumes a row" rule only in
  // this edge case -- better than losing the data entirely).
  const trailingInline = collectInlineItemsUpTo(Infinity)
  if (trailingInline.length) {
    let lastFlightRowIdx = -1
    for (let i = rows.length - 1; i >= 0; i--) {
      if (!rows[i].isEmptyRow && rows[i].log && !rows[i].isNoteRow && !rows[i].isDefectRow) {
        lastFlightRowIdx = i
        break
      }
    }
    if (lastFlightRowIdx !== -1) {
      rows[lastFlightRowIdx] = {
        ...rows[lastFlightRowIdx],
        inlineItems: [...rows[lastFlightRowIdx].inlineItems, ...trailingInline],
      }
    } else {
      trailingInline.forEach((item) => rows.push(itemRow(item, null, false)))
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

  // Notes and defects with rows > 0 get their own row(s) in the sequence;
  // rows === 0 items render as chips on their anchor flight's row instead
  // (the traditional in-flight-defect chip, now unified for both kinds).
  // Initialised to the last flight total of the previous page so items from
  // earlier pages are not re-inserted here (cross-page bleed prevention).
  const allInsertItems = buildInsertItems(maintenanceNotes, defects)
  const ownRowItems = allInsertItems.filter((item) => item.rows > 0)
  const inlineItems = allInsertItems.filter((item) => item.rows === 0)

  const mergedRows = buildLogbookRows(
    data?.logs,
    ownRowItems,
    inlineItems,
    ajlb?.rowsPerPage ?? 0,
    data?.pageStartFlightMins ?? null,
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
            inlineItems,
          }) => {
            if (isNoteRow && note) {
              return (
                <Box sx={{ gridColumn: '1 / -1', width: '100%', py: 0.25 }}>
                  <MaintenanceNoteMarker
                    note={note}
                    onChanged={() => mutateNotes()}
                    highlighted={note.noteId === highlightNoteId}
                    flightDate={log?.offBlockTimeUtc}
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
                    flightDate={log?.offBlockTimeUtc}
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

                    {inlineItems.length > 0 && ajlb && (
                      <Grid size={12} sx={{ pt: 0, pb: 0.5 }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {inlineItems.map((item) =>
                            item.kind === 'defect' ? (
                              <DefectMarker
                                key={item.defect.defectId}
                                defect={item.defect}
                                aircraftRegistration={ajlb.aircraftRegistration}
                                onChanged={() => mutateDefects()}
                                highlighted={item.defect.defectId === highlightDefectId}
                              />
                            ) : (
                              <MaintenanceNoteMarker
                                key={item.note.noteId}
                                note={item.note}
                                onChanged={() => mutateNotes()}
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

                    {inlineItems.length > 0 && ajlb && (
                      <Grid size={12} sx={{ pt: 0, pb: 0.5 }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {inlineItems.map((item) =>
                            item.kind === 'defect' ? (
                              <DefectMarker
                                key={item.defect.defectId}
                                defect={item.defect}
                                aircraftRegistration={ajlb.aircraftRegistration}
                                onChanged={() => mutateDefects()}
                                highlighted={item.defect.defectId === highlightDefectId}
                              />
                            ) : (
                              <MaintenanceNoteMarker
                                key={item.note.noteId}
                                note={item.note}
                                onChanged={() => mutateNotes()}
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
