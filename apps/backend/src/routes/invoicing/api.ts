import { Router, type Request, type Response } from 'express'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import {
  getAnnualEquipmmentFee,
  getInvoiceItems,
  getInvoices,
  getRecurringFeesProcessing,
  getUnpaidOverdueInvoicesWithMemberInfo,
  hasRequestedEquipmentFee,
  upsertInvoiceItems,
  updateExpenseClaimItemFlag,
  updateIsFuelItemFlag,
  updateIsKmItemFlag,
  updateIsOtherItemFlag,
} from '../../db/invoicing-queries.ts'
import {
  InvoiceItemQuerySchema,
  type InvoiceItemQueryParams,
  type InvoiceListResponse,
  type Item,
  ItemSchema,
  type ItemListResponse,
  type RecurringFeesProcessing,
  type AnnualBillingResponse,
  type EquipmentFee,
  type Invoice,
  type UnpaidOverdueInvoiceListResponse,
  UpdateExpenseClaimItemSchema,
  UpdateIsFuelItemSchema,
  UpdateIsKmItemSchema,
  UpdateIsOtherItemSchema,
} from './models.ts'

import { getInvoicePdf, getItems } from '../../services/simplbooks/simplbooksApiClient.ts'
import { HttpStatusCode } from 'axios'
import { problem } from '../response.ts'
import logger from '../../lib/logger.ts'
import {
  InvoicableFlightFiltersSchema,
  InvoiceFlightsSchema,
  type InvoicableFlight,
  type InvoicableFlightListResponse,
  FlightCreditSchema,
  type PrepaidFlightSummaryResponse,
} from '../flight-log/models.ts'
import {
  getInvoicableFlights,
  invoiceFlights,
  getFlightCredit,
  upsertFlightCredit,
  getFlightLog,
} from '../../db/flight-log-queries.ts'
import {
  createAnnualEquipmentFeeForMember,
  createAnnualMemberFeesForMembers,
} from '../../services/accounting/recurringFeesProcessor.ts'
import { planPrepaidFlightUsage } from '../../services/accounting/flightPrepaidAllocator.ts'

const router = Router()
router.use(
  validateUser(
    MIKPermissions.INVOICING_USER,
    MIKPermissions.INVOICING_ADMIN,
    MIKPermissions.MEMBER,
  ),
)

router.get(
  '/',
  async (req: Request<Record<string, string>>, res: Response<InvoiceListResponse>) => {
    const parsed = InvoiceItemQuerySchema.safeParse(req.query)

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }))
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Unable to parse query filter, search criteria are invalid.',
        extensions: {
          errors,
        },
      })
    }

    const filters: InvoiceItemQueryParams = parsed.data
    const isAdmin = req.user!.permissions.includes(MIKPermissions.INVOICING_ADMIN)
    const rawItems = await getInvoices(req.user?.memberId!, isAdmin, filters)

    logger.info(`Fetched ${rawItems.length} invoices with filters: ${JSON.stringify(filters)}`)
    const invoices: Invoice[] = rawItems.map((row) => ({
      id: String(row.id),
      created_at: row.created_at ? new Date(row.created_at as any).toISOString() : '',
      created_by: row.created_by,
      currency: row.currency === null ? null : String(row.currency),
      description: row.description,
      due_at: new Date(row.due_at as any).toISOString().split('T')[0],
      invoice_type: row.invoice_type as any,
      is_paid: row.is_paid === null ? null : Boolean(row.is_paid),
      member_id: row.member_id,
      paid_at: row.paid_at ? new Date(row.paid_at as any).toISOString() : null,
      pmt_ref: row.pmt_ref,
      sent_at: row.sent_at ? new Date(row.sent_at as any).toISOString().split('T')[0] : null,
      total_sum: row.total_sum === null ? null : String(row.total_sum),
      updated_at: row.updated_at ? new Date(row.updated_at as any).toISOString() : '',
      updated_by: row.updated_by,
    }))

    const response: InvoiceListResponse = {
      invoices,
    }

    res.status(200).json(response)
  },
)

router.get(
  '/unpaid-overdue',
  async (req: Request<Record<string, string>>, res: Response<UnpaidOverdueInvoiceListResponse>) => {
    const invoices = await getUnpaidOverdueInvoicesWithMemberInfo()

    const totalSum = invoices
      .filter((inv) => inv.total_sum !== null)
      .reduce((sum, inv) => sum + parseFloat(inv.total_sum!), 0)

    const response: UnpaidOverdueInvoiceListResponse = {
      invoices,
      total_sum: invoices.length > 0 ? totalSum.toFixed(2) : null,
    }

    res.status(200).json(response)
  },
)

router.get(
  '/flights',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response<InvoicableFlightListResponse>) => {
    const data = InvoicableFlightFiltersSchema.parse(req.query)

    const response = await getInvoicableFlights(data)
    res.status(200).json(response)
  },
)

router.get(
  '/flights/prepaid-summary',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response<PrepaidFlightSummaryResponse>) => {
    const data = InvoiceFlightsSchema.parse(req.query)

    const response = await getInvoicableFlights({
      aircraftRegistration: data.aircraftRegistration,
      endDate: data.endDate,
      limit: 1000,
    })

    const planned = await planPrepaidFlightUsage(response.logs)

    res.status(200).json({
      groups: planned.groups.filter((group) => group.availablePrepaidMinutes > 0),
    })
  },
)

router.post(
  '/flights',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = InvoiceFlightsSchema.parse(req.body)

    const response = await getInvoicableFlights({
      aircraftRegistration: data.aircraftRegistration,
      endDate: data.endDate,
      limit: 1000,
    })

    const groupedByMember = response.logs.reduce(
      (acc, log) => {
        const byMember = acc[log.billableMemberId] ?? []
        acc[log.billableMemberId] = [...byMember, log]
        return acc
      },
      {} as Record<string, InvoicableFlight[]>,
    )

    for (const memberId of Object.keys(groupedByMember)) {
      await invoiceFlights(groupedByMember[memberId])
    }

    res.status(200).json({ message: 'Flights sent for invoicing' })
  },
)

router.get(
  '/flights/:flightId/credit',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const { flightId } = req.params
    const credit = await getFlightCredit(flightId)
    res.status(200).json(credit ?? null)
  },
)

router.put(
  '/flights/:flightId/credit',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const { flightId } = req.params
    const parsed = FlightCreditSchema.safeParse({ flightId, ...req.body })
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid credit data.',
        extensions: { errors: parsed.error.issues },
      })
    }

    //Check that creditedMins is not greater than billable flight time to avoid over-crediting.
    const flight = await getFlightLog(flightId)

    // Prefer the same training-program flag that invoicing uses (isTrainingProgramPilot),
    // and fall back to the legacy DTO-based flag if it is not available.
    const isTrainingProgramPilot =
      (flight as any)?.isTrainingProgramPilot ?? flight?.isDtoTrainingFlight ?? false

    const billableFlightTimeMins = isTrainingProgramPilot
      ? (flight?.blockMins ?? 0)
      : (flight?.flightMins ?? 0)

    if (parsed.data.creditedMins > billableFlightTimeMins) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `Credited minutes ${parsed.data.creditedMins} cannot exceed billable flight time ${billableFlightTimeMins}.`,
      })
    }

    const credit = await upsertFlightCredit(
      flightId,
      parsed.data.creditedMins,
      parsed.data.note ?? null,
      req.user!.memberId,
    )
    res.status(200).json(credit)
  },
)

router.patch(
  '/items/refresh',
  async (req: Request<Record<string, string>>, res: Response<ItemListResponse>) => {
    const simplbooksItems = await getItems()
    await upsertInvoiceItems(simplbooksItems)

    const invoiceItems = await getInvoiceItems()

    const items = invoiceItems
      .map(mapInvoiceItemRowToItem)
      .filter((item): item is Item => item !== null)

    res.status(HttpStatusCode.Ok).json({ items })
  },
)

router.get(
  '/items',
  async (req: Request<Record<string, string>>, res: Response<ItemListResponse>) => {
    const invoiceItems = await getInvoiceItems()

    const items = invoiceItems
      .map(mapInvoiceItemRowToItem)
      .filter((item): item is Item => item !== null)

    res.status(HttpStatusCode.Ok).json({ items })
  },
)

router.patch(
  '/items/:id/expense-claim-item',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response<ItemListResponse>) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid item id.',
      })
    }

    const { expenseClaimItem } = UpdateExpenseClaimItemSchema.parse(req.body)
    await updateExpenseClaimItemFlag(id, expenseClaimItem)

    const invoiceItems = await getInvoiceItems()
    const items = invoiceItems
      .map(mapInvoiceItemRowToItem)
      .filter((item): item is Item => item !== null)

    res.status(HttpStatusCode.Ok).json({ items })
  },
)

router.patch(
  '/items/:id/is-fuel-item',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response<ItemListResponse>) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid item id.',
      })
    }

    const { isFuelItem } = UpdateIsFuelItemSchema.parse(req.body)
    await updateIsFuelItemFlag(id, isFuelItem)

    const invoiceItems = await getInvoiceItems()
    const items = invoiceItems
      .map(mapInvoiceItemRowToItem)
      .filter((item): item is Item => item !== null)

    res.status(HttpStatusCode.Ok).json({ items })
  },
)

router.patch(
  '/items/:id/is-km-item',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response<ItemListResponse>) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid item id.',
      })
    }

    const { isKmItem } = UpdateIsKmItemSchema.parse(req.body)
    await updateIsKmItemFlag(id, isKmItem)

    const invoiceItems = await getInvoiceItems()
    const items = invoiceItems
      .map(mapInvoiceItemRowToItem)
      .filter((item): item is Item => item !== null)

    res.status(HttpStatusCode.Ok).json({ items })
  },
)

router.patch(
  '/items/:id/is-other-item',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response<ItemListResponse>) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid item id.',
      })
    }

    const { isOtherItem } = UpdateIsOtherItemSchema.parse(req.body)
    await updateIsOtherItemFlag(id, isOtherItem)

    const invoiceItems = await getInvoiceItems()
    const items = invoiceItems
      .map(mapInvoiceItemRowToItem)
      .filter((item): item is Item => item !== null)

    res.status(HttpStatusCode.Ok).json({ items })
  },
)

router.get(
  '/annualMembershipBillingRuns',
  async (req: Request<Record<string, string>>, res: Response<RecurringFeesProcessing[]>) => {
    const isAdmin = req!.user!.permissions.includes(MIKPermissions.INVOICING_ADMIN)

    if (!isAdmin) {
      return problem({
        status: HttpStatusCode.Forbidden,
        detail: 'User does not have permission to view annual membership billing runs.',
      })
    }

    try {
      const records = await getRecurringFeesProcessing('annual_fee')
      res.status(HttpStatusCode.Ok).json(records)
    } catch (error) {
      logger.error('Error fetching annual membership billing runs:', error)
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'Error fetching annual membership billing runs.',
      })
    }
  },
)
router.get(
  '/annualEquipmentFee',
  async (req: Request<Record<string, string>>, res: Response<EquipmentFee | undefined>) => {
    const kalustomaksu = await getAnnualEquipmmentFee()
    res.status(HttpStatusCode.Ok).json(kalustomaksu)
  },
)

router.post(
  '/triggerAnnualMembershipBillingProcess/',
  async (req: Request<Record<string, string>>, res: Response<AnnualBillingResponse>) => {
    logger.info('Annual membership processing triggered.')

    const result = await createAnnualMemberFeesForMembers(req.user!.memberId).catch((error) => {
      logger.error('Error during annual membership processing:', error)
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'An error occurred triggering the annual membership billing process. ' + error,
      })
    })

    res.status(HttpStatusCode.Ok).json(result)
  },
)

router.post(
  '/requestOwnEquipmentFeeInvoice',
  async (req: Request<Record<string, string>>, res: Response) => {
    const result = await createAnnualEquipmentFeeForMember(req.user!.memberId).catch((error) => {
      logger.error('Error during equipment fee invoice processing:', error)
      res.status(HttpStatusCode.BadRequest).json({
        detail: error.message,
      })
    })

    res.status(HttpStatusCode.Ok).json(result)
  },
)

router.get('/equipmentFeeStatus', async (req: Request<Record<string, string>>, res: Response) => {
  const currentYear = new Date().getFullYear()
  const hasPaid = await hasRequestedEquipmentFee(currentYear, req.user!.memberId)

  res.status(HttpStatusCode.Ok).json({
    year: currentYear,
    hasPaid,
  })
})

router.post(
  '/sendEquipmentFeeInvoiceToMember',
  async (req: Request<Record<string, string>>, res: Response) => {
    const isAdmin = req.user!.permissions.includes(MIKPermissions.INVOICING_ADMIN)
    const { memberId } = req.body

    if (isAdmin) {
      const result = await createAnnualEquipmentFeeForMember(memberId).catch((error) => {
        logger.error('Error during equipment fee invoice processing:', error)
        res.status(HttpStatusCode.BadRequest).json({
          detail: error.message,
        })
      })

      res.status(HttpStatusCode.Ok).json(result)
    } else {
      return problem({
        status: HttpStatusCode.Forbidden,
        detail: 'User does not have permission to request equipment fee invoice for other members.',
      })
    }
  },
)

router.get('/:invoiceId/pdf', async (req: Request<Record<string, string>>, res: Response) => {
  const { invoiceId } = req.params
  const isAdmin = req.user!.permissions.includes(MIKPermissions.INVOICING_ADMIN)

  //  Must validate that the requested invoiceId belongs to the user, or user is admin
  if (!invoiceId || isNaN(Number(invoiceId))) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Invalid invoice ID',
    })
  }

  const invoiceBelongingToUser = await getInvoices(req.user?.memberId!, isAdmin, {
    id: Number(invoiceId),
  })

  if (!invoiceBelongingToUser.length) {
    return problem({
      status: HttpStatusCode.NotFound,
      detail: 'PDF not found for user.',
    })
  }

  const base64Pdf = await getInvoicePdf(invoiceId)
  if (!base64Pdf) {
    return problem({
      status: HttpStatusCode.NotFound,
      detail: 'PDF not found for given invoice Id.',
    })
  }

  res.status(HttpStatusCode.Ok).json(base64Pdf)
})

// Map one invoice item DB row to validated Item or null if invalid
function mapInvoiceItemRowToItem(row: any): Item | null {
  if (typeof row.item !== 'object' || row.item === null) {
    return null
  }

  const flat = {
    ...row.item,
    id: row.id,
    code: row.code,
    name: row.name,
    expense_claim_item: Boolean(row.expense_claim_item),
    is_fuel_item: Boolean(row.is_fuel_item),
    is_km_item: Boolean(row.is_km_item),
    is_other_item: Boolean(row.is_other_item),
  }

  const parsed = ItemSchema.partial().safeParse(flat)
  if (parsed.success) {
    return flat as Item
  } else {
    console.warn('Invalid item skipped:', parsed.error)
    return null
  }
}

export default router
