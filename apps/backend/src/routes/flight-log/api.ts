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
  type FlightLogAuditResponse,
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
  getFlightLogAuditTrail,
} from '../../db/flight-log-queries.ts'
import { estimateFlightCosts } from '../../services/accounting/flightCostEstimator.ts'
import { generateCsv, generateEasaPdf, getFilename, type PdfMemberInfo } from './exportFormats.ts'
import { invalidateApprovedAttempt } from '../../db/dto-queries.ts'
import logger from '../../lib/logger.ts'
import { getRecordsForFlightLog } from '../../db/liquid-queries.ts'
import { LiquidType } from '@mik/contracts/liquid'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import {
  canReadFlight,
  canSeeBillingFields,
  canWriteFlight,
  FLIGHT_LOG_BILLING_FIELDS,
  FlightAccess,
  isFlightLogAdmin,
  redactBillingFields,
  resolveFlightAccess,
} from './flightAccess.ts'
import { problem } from '../response.ts'
import { getMemberById } from '../../db/member-queries.ts'
import { getAirfields } from '../../db/airfields-queries.ts'
import { getAjlbs } from '../../db/ajlb-queries.ts'
import type { z } from 'zod'

// all flight log routes are protected by flightlog permissions
const router = Router()
router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

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
  const memberId = req.user!.memberId
  // A member asking for an ajlbSeqNo is browsing an aircraft's logbook, not their own
  // log, so that view is not scoped to them. Everything else a non-admin asks for is
  // their own flight log.
  const isMemberSelfView = !isAdmin && data.ajlbSeqNo == undefined
  // Default on: the flights a member flew as crew belong in their log whether or not
  // they are billed for them (#1019 Q1). Only an explicit `false` narrows the list back
  // to "the flights I will be invoiced for".
  const includeCrewFlights = data.includeCrewFlights !== false

  // Non-admins cannot request other members' crew flights explicitly. onBoardMemberId is
  // held to the same rule as anyCrewMemberId: it is the same question asked of a narrower
  // set of crew roles, so letting it through would reopen what that check closes.
  const requestedCrewMember = data.anyCrewMemberId ?? data.onBoardMemberId
  if (!isAdmin && requestedCrewMember && requestedCrewMember !== memberId) {
    return problem({
      status: 403,
      detail: "Insufficient permissions to view other members' flights",
    })
  }

  // FlightLog admin can see logs of all members, normal users only through logbooks.
  // The member id always comes from the JWT.
  const filters: FlightLogFilters = {
    ...data,
    ...(isMemberSelfView
      ? includeCrewFlights
        ? { onBoardMemberId: memberId, billableMemberId: undefined, anyCrewMemberId: undefined }
        : { billableMemberId: memberId, onBoardMemberId: undefined, anyCrewMemberId: undefined }
      : {}),
  }

  const logs = await getFlightLogs(filters, memberId)

  // For non-admin users, redact billing-sensitive fields for other members' flights.
  // Keep NEW and VALIDATED statuses as-is since they reflect verification state, not billing state.
  //
  // #1222's allow-list is also what #1019 Q4 asked for — a crew member seeing the true
  // state of a flight they flew — so a member's own crew rows need nothing extra here: a
  // student's NEW flight reads NEW to their instructor. What stays redacted for them is
  // the billing half, which is the payer's business whoever else was on board.
  if (!isAdmin) {
    logs.logs = logs.logs.map((log) => redactFlightLogForOtherMember(log, memberId))
  }

  // Compute estimated costs only for the member's own self-service view. Keyed on the
  // member's own unbilled billable flights, so a crew-only row is left with
  // estimatedCost: null and the unbilled total is unchanged by the toggle — a member is
  // never shown a price for a flight someone else is paying for (#1019 Q1).
  if (isMemberSelfView) {
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

// A flight log's change history, newest first.
//
// Every write to flight.logs is recorded by a database trigger (V160), so the trail
// already existed; this exposes it because a flight can now be edited by an instructor
// who is not the member being billed, and that has to be visible to the member whose
// flight it is (#1019 Q5).
//
// Declared before '/:id' so the two-segment path is matched as itself.
router.get(
  '/:id/audit',
  async (req: Request<Record<string, string>>, res: Response<FlightLogAuditResponse>) => {
    const { flight, access } = await getReadableFlight(req.params.id, req)
    const hiddenFields = canSeeBillingFields(access, flight.status)
      ? []
      : [...FLIGHT_LOG_BILLING_FIELDS, 'status']
    const entries = await getFlightLogAuditTrail(flight.flightId, hiddenFields)
    res.status(200).json({ entries })
  },
)

// Get a flight log by ID
// Caution - KEEP THIS LAST in Get endpoints so that other paths are used first
router.get('/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const { id } = req.params

  const { flight, access } = await getReadableFlight(id, req)
  res
    .status(200)
    .json(canSeeBillingFields(access, flight.status) ? flight : redactBillingFields(flight))
})

/**
 * The flight, plus how the requester is related to it. Used by every route that acts on a
 * single flight: reading is enough to get past this helper, and each caller then decides
 * for itself whether that access level may also write — `getReadableFlight` on its own
 * grants nothing but a read.
 */
const getReadableFlight = async (
  flightId: string,
  req: Request,
): Promise<{ flight: FlightLog; access: FlightAccess } | never> => {
  const flight = await getFlightLog(flightId)
  if (!flight) {
    return problem({ status: 404, detail: 'Flight log not found' })
  }

  const access = resolveFlightAccess(flight, req.user)
  if (!canReadFlight(access)) {
    return problem({
      status: 403,
      detail: 'Flight log not owned by user or user has no admin rights',
    })
  }

  return { flight, access }
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

  const { flight, access } = await getReadableFlight(flightId, req)
  // Reading a flight you were crew on does not imply editing it: only the billable
  // member, an admin, or an instructor working on a still-new entry may write (#1019 Q5).
  if (!canWriteFlight(access, flight.status)) {
    return problem({
      status: 403,
      detail:
        access === FlightAccess.INSTRUCTOR_CREW
          ? `Flight log in status ${flight.status} can no longer be edited by an instructor`
          : 'Flight log not owned by user or user has no admin rights',
    })
  }

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

    const { flight } = await getReadableFlight(flightId, req)

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

    // A member can save a flight with fuel/oil unresolved (the flightLogId
    // that a liquid record links to doesn't exist until the flight is first
    // saved) — this is the backstop that actually enforces it before the
    // figure is finalized: either the legacy manually-entered litres are
    // present (old flight, unaffected by this rule) or at least one liquid
    // record of that type is linked.
    if (!revert) {
      const records = await getRecordsForFlightLog(flightId)
      const unresolved: string[] = []
      if (
        flight.fuelUpliftLitres == null &&
        !records.some((r) => r.liquidType === LiquidType.FUEL)
      ) {
        unresolved.push('fuel')
      }
      if (flight.oilUpliftLitres == null && !records.some((r) => r.liquidType === LiquidType.OIL)) {
        unresolved.push('oil')
      }
      if (unresolved.length > 0) {
        return problem({
          status: 409,
          detail: `Flight ${flightId} has no linked ${unresolved.join(' or ')} record, and it was never marked as none added. Link one, or mark it as none added, before validating.`,
        })
      }
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

  const { flight, access } = await getReadableFlight(flightId, req)
  // Deliberately stricter than PATCH: an instructor may correct a student's entry, but
  // removing it is the billable member's or an admin's call, so crew access — instructor
  // or not — stops here.
  if (access !== FlightAccess.OWNER && access !== FlightAccess.ADMIN) {
    return problem({
      status: 403,
      detail: 'Flight log not owned by user or user has no admin rights',
    })
  }

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
