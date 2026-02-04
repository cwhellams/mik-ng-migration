import { Router, type Request, type Response } from 'express'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import {
  getAnnualEquipmmentFee,
  getInvoiceItems,
  getInvoices,
  getRecurringFeesProcessing,
  hasRequestedEquipmentFee,
  upsertInvoiceItems,
} from '../../db/invoicing-queries.ts'
import {
  InvoiceItemQuerySchema,
  type InvoiceItemQueryParams,
  type InvoiceListResponse,
  type Item,
  type Invoice,
  ItemSchema,
  type ItemListResponse,
  type RecurringFeesProcessing,
  type AnnualBillingResponse,
  type EquipmentFee,
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
} from '../flight-log/models.ts'
import { getInvoicableFlights, invoiceFlights } from '../../db/flight-log-queries.ts'
import {
  createAnnualEquipmentFeeForMember,
  createAnnualMemberFeesForMembers,
} from '../../services/accounting/recurringFeesProcessor.ts'

const router = Router()
router.use(
  validateUser(
    MIKPermissions.INVOICING_USER,
    MIKPermissions.INVOICING_ADMIN,
    MIKPermissions.MEMBER,
  ),
)

router.get('/', async (req: Request, res: Response<InvoiceListResponse>) => {
  const parsed = InvoiceItemQuerySchema.safeParse(req.query)

  if (!parsed.success) {
    const errors = parsed.error.issues.map(issue => ({
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
  const invoices: Invoice[] = rawItems.map(row => ({
    id: String(row.id),
    created_at: row.created_at ? new Date(row.created_at as any).toISOString() : '',
    created_by: row.created_by,
    currency: row.currency === null ? null : String(row.currency),
    description: row.description,
    due_at: row.due_at ? new Date(row.due_at as any).toISOString() : '',
    invoice_type: row.invoice_type as any,
    is_paid: row.is_paid === null ? null : Boolean(row.is_paid),
    member_id: row.member_id,
    paid_at: row.paid_at ? new Date(row.paid_at as any).toISOString() : null,
    pmt_ref: row.pmt_ref,
    sent_at: row.sent_at ? new Date(row.sent_at as any).toISOString() : '',
    total_sum: row.total_sum === null ? null : String(row.total_sum),
    updated_at: row.updated_at ? new Date(row.updated_at as any).toISOString() : '',
    updated_by: row.updated_by,
  }))

  const response: InvoiceListResponse = {
    invoices,
  }

  res.status(200).json(response)
})

router.get(
  '/flights',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request, res: Response<InvoicableFlightListResponse>) => {
    const data = InvoicableFlightFiltersSchema.parse(req.query)

    const response = await getInvoicableFlights(data)
    res.status(200).json(response)
  },
)

router.post(
  '/flights',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request, res: Response) => {
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
      await invoiceFlights(groupedByMember[memberId], req.user!)
    }

    res.status(200).json({ message: 'Flights sent for invoicing' })
  },
)

router.patch('/items/refresh', async (req: Request, res: Response<ItemListResponse>) => {
  const simplbooksItems = await getItems()
  await upsertInvoiceItems(simplbooksItems)

  const invoiceItems = await getInvoiceItems()

  const items = invoiceItems
    .map(mapInvoiceItemRowToItem)
    .filter((item): item is Item => item !== null)

  res.status(HttpStatusCode.Ok).json({ items })
})

router.get('/items', async (req: Request, res: Response<ItemListResponse>) => {
  const invoiceItems = await getInvoiceItems()

  const items = invoiceItems
    .map(mapInvoiceItemRowToItem)
    .filter((item): item is Item => item !== null)

  res.status(HttpStatusCode.Ok).json({ items })
})

router.get(
  '/annualMembershipBillingRuns',
  async (req: Request, res: Response<RecurringFeesProcessing[]>) => {
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
router.get('/annualEquipmentFee', async (req: Request, res: Response<EquipmentFee | undefined>) => {
  const kalustomaksu = await getAnnualEquipmmentFee()
  res.status(HttpStatusCode.Ok).json(kalustomaksu)
})

router.post(
  '/triggerAnnualMembershipBillingProcess/',
  async (req: Request, res: Response<AnnualBillingResponse>) => {
    logger.info('Annual membership processing triggered.')

    const result = await createAnnualMemberFeesForMembers(req.user!.memberId).catch(error => {
      logger.error('Error during annual membership processing:', error)
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'An error occurred triggering the annual membership billing process. ' + error,
      })
    })

    res.status(HttpStatusCode.Ok).json(result)
  },
)

router.post('/requestOwnEquipmentFeeInvoice', async (req: Request, res: Response) => {
  const result = await createAnnualEquipmentFeeForMember(req.user!.memberId).catch(error => {
    logger.error('Error during equipment fee invoice processing:', error)
    res.status(HttpStatusCode.BadRequest).json({
      detail: error.message,
    })
  })

  res.status(HttpStatusCode.Ok).json(result)
})

router.get('/equipmentFeeStatus', async (req: Request, res: Response) => {
  const currentYear = new Date().getFullYear()
  const hasPaid = await hasRequestedEquipmentFee(currentYear, req.user!.memberId)

  res.status(HttpStatusCode.Ok).json({
    year: currentYear,
    hasPaid,
  })
})

router.post('/sendEquipmentFeeInvoiceToMember', async (req: Request, res: Response) => {
  const isAdmin = req.user!.permissions.includes(MIKPermissions.INVOICING_ADMIN)
  const { memberId } = req.body

  if (isAdmin) {
    const result = await createAnnualEquipmentFeeForMember(memberId).catch(error => {
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
})

router.get('/:invoiceId/pdf', async (req: Request, res: Response) => {
  const { invoiceId } = req.params
  const isAdmin = req!.user!.permissions.includes(MIKPermissions.INVOICING_ADMIN)

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

  if (!invoiceBelongingToUser) {
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
