import { Router, type Request, type Response } from 'express'

import {
  FlightLogUpsertSchema,
  flightLogDateValidator,
  FlightLogFiltersSchema,
  FlightLogMemberUpsertSchema,
  type FlightLog,
  type FlightLogFilters,
  type FlightLogListResponse,
  FlightLogStatus,
  FlightLogValidationRequestSchema,
  validateFlightLogTimes,
  validateFlightLogBusinessRules,
  ValidatedFlightLogAdminUpsertSchema,
  ValidatedFlightLogMemberUpsertSchema,
  BilledFlightLogUpsertSchema,
  type FlightLogUpsertRequest,
  type FlightLogStatsResponse,
  type FlightLogStats,
  type FlightLogStatsFilter,
  FlightLogStatsFilterSchema,
  FlightLogExportFiltersSchema,
  FlightLogExportFormat,
  FlightLogOverlapQuerySchema,
  type FlightLogOverlapResponse,
  FlightLogPageForMinsFilterSchema,
  redactFlightLogForOtherMember,
} from '@mik/contracts/flight-log'
import {
  deleteFlightLog,
  getFlightLog,
  getFlightLogs,
  getFlightLogTotals,
  getFlightStats,
  getUnbilledFlightsForEstimation,
  insertFlightLog,
  updateFlightLog,
  updateFlightLogStatus,
  countFlightLogsForExport,
  getFlightLogsForExport,
  getOverlappingFlightLogs,
  getFlightLogPageForMins,
} from '../../db/flight-log-queries.ts'
import { estimateFlightCosts } from '../../services/accounting/flightCostEstimator.ts'
import { generateCsv, generateEasaPdf, getFilename, type PdfMemberInfo } from './exportFormats.ts'
import { invalidateApprovedAttempt } from '../../db/dto-queries.ts'
import logger from '../../lib/logger.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import type { JWTUser } from '../auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problem } from '../response.ts'
import { getMemberById } from '../../db/member-queries.ts'
import { getAirfields } from '../../db/airfields-queries.ts'
import { getAjlbs } from '../../db/ajlb-queries.ts'
import type { z } from 'zod'

// all flight log routes are protected by flightlog permissions
const router = Router()
router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

const isFlightLogAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.FLIGHTLOG_ADMIN) ?? false

// Get flight log total times by registraion
router.get('/airfields', async (req: Request<Record<string, string>>, res: Response) => {
  const airfields = await getAirfields()
  if (airfields.length === 0) {
    return problem({ status: 404, detail: 'Airfields not found' })
  }
  res.status(200).json({ airfields })
})

// Create a flight log
router.post('/', async (req: Request<Record<string, string>>, res: Response) => {
  const isAdmin = isFlightLogAdmin(req.user)
  if (isAdmin) {
    // admin can create flight logs for other members
    const data = flightLogDateValidator(FlightLogUpsertSchema).parse(req.body)

    const businessErrors: z.IssueData[] = []
    validateFlightLogBusinessRules(data, (issue) => businessErrors.push(issue))
    if (businessErrors.length > 0) {
      return problem({ status: 400, extensions: { errors: businessErrors } })
    }

    const flightId = await insertFlightLog(data, req.user!)
    const created = await getFlightLog(flightId)
    res.status(201).json(created)
  } else {
    // drop any admin fields the UI might send in the request
    const data = flightLogDateValidator(FlightLogMemberUpsertSchema.strip()).parse(req.body)

    const businessErrors: z.IssueData[] = []
    validateFlightLogBusinessRules(data, (issue) => businessErrors.push(issue))
    if (businessErrors.length > 0) {
      return problem({ status: 400, extensions: { errors: businessErrors } })
    }

    const flightId = await insertFlightLog(data, req.user!)
    const created = await getFlightLog(flightId)
    res.status(201).json(created)
  }
})

// Which logbook page a given running-total flight time falls on, e.g. to
// deep-link from a HIL entry to the flight-log defect it was deferred from.
router.get('/page-for-mins', async (req: Request, res: Response<{ page: number | undefined }>) => {
  const filters = FlightLogPageForMinsFilterSchema.parse(req.query)
  const page = await getFlightLogPageForMins(
    filters.aircraftRegistration,
    filters.ajlbSeqNo,
    filters.flightMins,
    filters.itemType && filters.itemId
      ? { itemType: filters.itemType, itemId: filters.itemId }
      : undefined,
  )
  res.status(200).json({ page })
})

// Get flight logs using filter
router.get('/', async (req: Request<FlightLogFilters>, res: Response<FlightLogListResponse>) => {
  const data = FlightLogFiltersSchema.parse(req.query)
  const isAdmin = isFlightLogAdmin(req.user)
  const isMemberSelfView = !isAdmin && data.ajlbSeqNo == undefined

  // Non-admins cannot request other members' crew flights explicitly
  if (!isAdmin && data.anyCrewMemberId && data.anyCrewMemberId !== req.user!.memberId) {
    return problem({
      status: 403,
      detail: "Insufficient permissions to view other members' flights",
    })
  }

  // FlightLog admin can see logs of all members, normal users only through logbooks
  const filters: FlightLogFilters = {
    ...data,
    ...(isMemberSelfView
      ? { billableMemberId: req.user!.memberId, anyCrewMemberId: undefined }
      : {}),
  }

  const logs = await getFlightLogs(filters)

  // For non-admin users, redact billing-sensitive fields for other members' flights.
  // Keep NEW and VALIDATED statuses as-is since they reflect verification state, not billing state
  if (!isAdmin) {
    const userMemberId = req.user!.memberId
    logs.logs = logs.logs.map((log) => redactFlightLogForOtherMember(log, userMemberId))
  }

  // Compute estimated costs only for the member's own self-service view
  if (isMemberSelfView) {
    const memberId = req.user!.memberId
    const allUnbilled = await getUnbilledFlightsForEstimation(memberId)
    const allCosts = await estimateFlightCosts(allUnbilled, memberId)

    logs.logs = logs.logs.map((log) => ({
      ...log,
      estimatedCost: allCosts.get(log.flightId) ?? null,
    }))

    const total = [...allCosts.values()]
      .filter((v): v is number => v !== null)
      .reduce((sum, c) => sum + c, 0)
    logs.unbilledEstimatedTotal = total > 0 ? total : null
  }

  res.status(200).json(logs)
})

router.get(
  '/stats',
  async (req: Request<FlightLogStatsFilter>, res: Response<FlightLogStatsResponse>) => {
    const { activeOnly } = FlightLogStatsFilterSchema.parse(req.query)
    const stats = await getFlightStats(req.user!.memberId, !!activeOnly)
    const totals = stats.reduce(
      (acc, curr) => {
        if (
          acc.lastTakeoffTimeUtc == null ||
          (curr.lastTakeoffTimeUtc ?? '') > acc.lastTakeoffTimeUtc
        ) {
          acc.lastTakeoffTimeUtc = curr.lastTakeoffTimeUtc
          acc.lastFlightId = curr.lastFlightId
        }
        acc.totalLandings += Number(curr.totalLandings)
        acc.totalFlightMins += Number(curr.totalFlightMins)
        acc.landings1month += Number(curr.landings1month)
        acc.landings3month += Number(curr.landings3month)
        acc.landings6month += Number(curr.landings6month)
        acc.landings12month += Number(curr.landings12month)
        acc.time1month += Number(curr.time1month)
        acc.time3month += Number(curr.time3month)
        acc.time6month += Number(curr.time6month)
        acc.time12month += Number(curr.time12month)
        return acc
      },
      {
        aircraftRegistration: 'total',
        lastFlightId: null,
        lastTakeoffTimeUtc: null,
        totalLandings: 0,
        totalFlightMins: 0,
        landings1month: 0,
        landings3month: 0,
        landings6month: 0,
        landings12month: 0,
        time1month: 0,
        time3month: 0,
        time6month: 0,
        time12month: 0,
      } as FlightLogStats,
    )
    res.status(200).json({ stats: stats.length > 1 ? [...stats, totals] : stats })
  },
)

// Get flight log total times by registration
router.get('/totals', async (req: Request<Record<string, string>>, res: Response) => {
  const totals = await getFlightLogTotals()

  if (totals.length === 0) {
    return problem({ status: 404, detail: 'Flight totals not found' })
  }
  res.status(200).json(totals)
})

// Get flight log total times by registraion
router.get('/:registration/totals', async (req: Request<Record<string, string>>, res: Response) => {
  const reg = req.params.registration
  const totals = await getFlightLogTotals(reg)
  if (totals.length === 0) {
    return problem({ status: 404, detail: 'Flight totals not found' })
  }
  res.status(200).json(totals)
})

// GET /export/count — returns { count: N } for filter preview
router.get('/export/count', async (req: Request<Record<string, string>>, res: Response) => {
  const filters = FlightLogExportFiltersSchema.parse(req.query)
  const memberId = isFlightLogAdmin(req.user) ? undefined : req.user!.memberId
  const count = await countFlightLogsForExport(filters, memberId)
  res.status(200).json({ count })
})

const MAX_EXPORT_ROWS = 10_000

// GET /export — streams a CSV or PDF file download
router.get('/export', async (req: Request<Record<string, string>>, res: Response) => {
  const { format = FlightLogExportFormat.CSV, ...rest } = FlightLogExportFiltersSchema.parse(
    req.query,
  )
  const memberId = isFlightLogAdmin(req.user) ? undefined : req.user!.memberId
  const count = await countFlightLogsForExport(rest, memberId)
  if (count > MAX_EXPORT_ROWS) {
    return problem({
      status: 422,
      detail: `Export would include ${count} rows, which exceeds the maximum of ${MAX_EXPORT_ROWS}. Narrow the date range or aircraft filter and try again.`,
    })
  }
  const logs = await getFlightLogsForExport(rest, memberId)
  const filename = getFilename(format, rest.startDate, rest.endDate)
  if (format === FlightLogExportFormat.EASA_PDF) {
    const member = await getMemberById(req.user!.memberId)
    const memberInfo: PdfMemberInfo = {
      firstName: member?.firstName ?? '',
      lastName: member?.lastName ?? '',
      licenceId: member?.licenceId ?? undefined,
      streetAddress: member?.streetAddress ?? undefined,
      townCity: member?.townCity ?? undefined,
      postcode: member?.postcode ?? undefined,
    }
    const pdf = await generateEasaPdf(logs, memberInfo)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.status(200).send(pdf)
  } else {
    const csv = generateCsv(logs, format)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.status(200).send(csv)
  }
})

// Lists existing entries whose block time overlaps the given interval on the same
// aircraft, so the UI can warn before submitting. The database trigger is the
// authoritative guard; this only gives the user an earlier, readable heads-up.
router.get(
  '/overlap-check',
  async (req: Request<Record<string, string>>, res: Response<FlightLogOverlapResponse>) => {
    const query = FlightLogOverlapQuerySchema.parse(req.query)
    const conflicts = await getOverlappingFlightLogs(query)
    res.status(200).json({ conflicts })
  },
)

// Get a flight log by ID
// Caution - KEEP THIS LAST in Get endpoints so that other paths are used first
router.get('/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const { id } = req.params

  const flight = await getReadableFlight(id, req)
  res.status(200).json(flight)
})

const getReadableFlight = async (flightId: string, req: Request): Promise<FlightLog | never> => {
  const flight = await getFlightLog(flightId)
  if (!flight) {
    return problem({ status: 404, detail: 'Flight log not found' })
  }

  // Check if the flight is owned by the user or the user is not an flightlog admin
  if (flight.billableMemberId !== req.user?.memberId && !isFlightLogAdmin(req.user)) {
    return problem({
      status: 403,
      detail: 'Flight log not owned by user or user has no admin rights',
    })
  }

  return flight
}

const getAjlb = async (registration: string) => {
  const ajlbs = await getAjlbs({ current: true, aircraftRegistration: registration })
  return ajlbs?.[0]?.seqNo
}

const getValidPatchForUpdate = async (
  flight: FlightLog,
  req: Request<Record<string, string>>,
): Promise<Partial<FlightLogUpsertRequest>> => {
  const admin = isFlightLogAdmin(req.user)

  if (flight.status === FlightLogStatus.NEW) {
    // flight is still full editable
    const schema = admin ? FlightLogUpsertSchema : FlightLogMemberUpsertSchema.strip()
    const patch = schema.partial().parse(req.body)

    // validate all times are valid together
    const errors: z.IssueData[] = []
    validateFlightLogTimes(
      {
        offBlockTimeEpoch: patch?.offBlockTimeEpoch ?? flight.offBlockTimeEpoch,
        takeoffTimeEpoch: patch?.takeoffTimeEpoch ?? flight.takeoffTimeEpoch,
        landingTimeEpoch: patch?.landingTimeEpoch ?? flight.landingTimeEpoch,
        onBlockTimeEpoch: patch?.onBlockTimeEpoch ?? flight.onBlockTimeEpoch,
      },
      (issue) => errors.push(issue),
    )
    if (errors.length > 0) {
      return problem({ status: 400, extensions: { errors } })
    }

    // if plane changes the ajlbSeqNo must be updated too
    const ajlbSeqNo =
      patch.aircraftRegistration && flight.aircraftRegistration !== patch.aircraftRegistration
        ? await getAjlb(patch.aircraftRegistration)
        : flight.ajlbSeqNo

    return { ...patch, ajlbSeqNo }
  } else if (flight.status === FlightLogStatus.VALIDATED) {
    const validatedSchema = admin
      ? ValidatedFlightLogAdminUpsertSchema.strip()
      : ValidatedFlightLogMemberUpsertSchema.strip()
    return validatedSchema.partial().parse(req.body)
  } else {
    if (admin) {
      return problem({
        status: 400,
        detail: 'Flight log in status QUEUED, INVOICED or PAID cannot be modified by admin',
      })
    }
    return BilledFlightLogUpsertSchema.strip().partial().parse(req.body)
  }
}

// Update a flight log
router.patch('/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const flightId = req.params.id

  const flight = await getReadableFlight(flightId, req)
  const patch = await getValidPatchForUpdate(flight, req)

  const mergedState = { ...flight, ...patch }
  const patchBusinessErrors: z.IssueData[] = []
  validateFlightLogBusinessRules(mergedState, (issue) => patchBusinessErrors.push(issue))
  if (patchBusinessErrors.length > 0) {
    return problem({ status: 400, extensions: { errors: patchBusinessErrors } })
  }

  const updated = await updateFlightLog(flightId, patch, req.user!)
  if (!updated) {
    return problem({
      status: 500,
      detail: 'Flight log update failed',
    })
  }

  await invalidateApprovedAttempt(flightId)

  const afterUpdate = await getFlightLog(flightId)

  res.status(200).json(afterUpdate)
})

// Admin only route: update a flight log status
router.post(
  '/:id/validate',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const flightId = req.params.id

    const { revert } = FlightLogValidationRequestSchema.parse(req.body ?? {})

    const flight = await getReadableFlight(flightId, req)

    // all previous flights must be validated

    if (flight.status == FlightLogStatus.VALIDATED && revert) {
      const lastValidatedFlight = await getFlightLogs({
        aircraftRegistration: flight.aircraftRegistration,
        status: FlightLogStatus.VALIDATED,
        limit: 1,
        page: 1,
        orderLatestFirst: true,
      })
      if (lastValidatedFlight.rows == 0 || lastValidatedFlight.logs[0].flightId !== flightId) {
        return problem({
          status: 400,
          detail: `All later flights must be first reverted, revert ${lastValidatedFlight.logs?.[0]?.flightId} first`,
        })
      }
    } else if (flight.status == FlightLogStatus.NEW && !revert) {
      const firstNewFlight = await getFlightLogs({
        aircraftRegistration: flight.aircraftRegistration,
        status: FlightLogStatus.NEW,
        limit: 1,
        page: 1,
      })
      if (firstNewFlight.rows == 0 || firstNewFlight.logs[0].flightId !== flightId) {
        return problem({
          status: 400,
          detail: `All previous flights must be first validated, validate ${firstNewFlight.logs?.[0]?.flightId} first`,
        })
      }
    } else {
      return problem({
        status: 400,
        detail: `Flight log status ${flight.status}`,
      })
    }

    const updated = await updateFlightLogStatus(
      flightId,
      flight.status,
      revert ? FlightLogStatus.NEW : FlightLogStatus.VALIDATED,
      {},
      req.user!,
    )
    if (!updated) {
      return problem({
        status: 500,
        detail: 'Flight log update failed',
      })
    }

    const afterUpdate = await getFlightLog(flightId)

    res.status(200).json(afterUpdate)
  },
)

// Delete a flight log
router.delete('/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const flightId = req.params.id

  const flight = await getReadableFlight(flightId, req)
  if (flight.status !== FlightLogStatus.NEW) {
    return problem({
      status: 400,
      detail: `Flight log in status ${flight.status} and cannot be deleted`,
    })
  }

  logger.info(
    `Deleting flight log ${flightId}. Deleted by member: ${req.user?.memberId} with permissions :${req.user?.permissions}`,
  )

  const deletedLogRows = await deleteFlightLog(flightId)
  if (!deletedLogRows) {
    return problem({
      status: 500,
      detail: 'Flight log deletion failed',
    })
  }

  res.status(204).end()
})

export default router
