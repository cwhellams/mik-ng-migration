import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import {
  InventoryLocationUpsertSchema,
  InventoryCategoryUpsertSchema,
  InventoryItemUpsertSchema,
  InventoryFiltersSchema,
  QuantityAdjustmentSchema,
} from './models.ts'
import {
  getLocations,
  getLocationById,
  upsertLocation,
  getCategories,
  getCategoryById,
  upsertCategory,
  getItems,
  getItemById,
  upsertItem,
  adjustQuantity,
  getAuditLog,
} from '../../db/inventory-queries.ts'

export const router = Router()
router.use(validateUser(MIKPermissions.INVENTORY_USER, MIKPermissions.INVENTORY_ADMIN))

const isInventoryAdmin = (req: Request) =>
  req.user?.permissions?.includes(MIKPermissions.INVENTORY_ADMIN) ?? false

// Ensure referenced category/location exist before an insert/update so a bad
// reference returns a 400 instead of surfacing as a raw DB foreign-key error (500).
const validateItemRefs = async (data: {
  categoryId?: string
  locationId?: string | null
}): Promise<string | null> => {
  if (data.categoryId !== undefined && !(await getCategoryById(data.categoryId))) {
    return `Category '${data.categoryId}' does not exist`
  }
  if (data.locationId != null && !(await getLocationById(data.locationId))) {
    return `Location '${data.locationId}' does not exist`
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Locations
// ─────────────────────────────────────────────────────────────────────────────

router.get('/locations', async (req: Request<Record<string, string>>, res: Response) => {
  const admin = isInventoryAdmin(req)
  const locations = await getLocations(!admin)
  res.json(locations)
})

router.post(
  '/locations',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = InventoryLocationUpsertSchema.parse(req.body)
    const location = await upsertLocation(data, req.user!)
    res.status(HttpStatusCode.Created).json(location)
  },
)

router.put(
  '/locations/:id',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const existing = await getLocationById(req.params.id)
    if (!existing) return problem({ status: 404, detail: 'Location not found' })

    const data = InventoryLocationUpsertSchema.partial().parse({
      ...req.body,
      locationId: req.params.id,
    })
    const location = await upsertLocation(data as any, req.user!)
    res.json(location)
  },
)

router.delete(
  '/locations/:id',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const existing = await getLocationById(req.params.id)
    if (!existing) return problem({ status: 404, detail: 'Location not found' })

    await upsertLocation({ locationId: req.params.id, isActive: false } as any, req.user!)
    res.status(HttpStatusCode.NoContent).send()
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────

router.get('/categories', async (req: Request<Record<string, string>>, res: Response) => {
  const admin = isInventoryAdmin(req)
  const categories = await getCategories(!admin)
  res.json(categories)
})

router.post(
  '/categories',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = InventoryCategoryUpsertSchema.parse(req.body)
    const category = await upsertCategory(data, req.user!)
    res.status(HttpStatusCode.Created).json(category)
  },
)

router.put(
  '/categories/:id',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const existing = await getCategoryById(req.params.id)
    if (!existing) return problem({ status: 404, detail: 'Category not found' })

    const data = InventoryCategoryUpsertSchema.partial().parse({
      ...req.body,
      categoryId: req.params.id,
    })
    const category = await upsertCategory(data as any, req.user!)
    res.json(category)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Items
// ─────────────────────────────────────────────────────────────────────────────

router.get('/items', async (req: Request<Record<string, string>>, res: Response) => {
  const admin = isInventoryAdmin(req)
  const filters = InventoryFiltersSchema.parse({
    ...req.query,
    ...(admin ? {} : { includeInactive: 'false' }),
  })
  const items = await getItems(filters)
  res.json(items)
})

router.post(
  '/items',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = InventoryItemUpsertSchema.parse(req.body)
    const refError = await validateItemRefs(data)
    if (refError) return problem({ status: 400, detail: refError })
    const item = await upsertItem(data, req.user!)
    res.status(HttpStatusCode.Created).json(item)
  },
)

router.get('/items/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const admin = isInventoryAdmin(req)
  const item = await getItemById(req.params.id)
  // Non-admins must not be able to fetch soft-deleted items directly, matching
  // the GET /items listing which hides inactive items from them.
  if (!item || (!item.isActive && !admin)) {
    return problem({ status: 404, detail: 'Item not found' })
  }

  const auditLog = admin ? await getAuditLog(req.params.id) : undefined

  res.json({ item, auditLog })
})

router.put(
  '/items/:id',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const existing = await getItemById(req.params.id)
    if (!existing) return problem({ status: 404, detail: 'Item not found' })

    const data = InventoryItemUpsertSchema.partial().parse({
      ...req.body,
      itemId: req.params.id,
    })
    const refError = await validateItemRefs(data)
    if (refError) return problem({ status: 400, detail: refError })
    const item = await upsertItem(data as any, req.user!)
    res.json(item)
  },
)

router.delete(
  '/items/:id',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const existing = await getItemById(req.params.id)
    if (!existing) return problem({ status: 404, detail: 'Item not found' })

    await upsertItem({ itemId: req.params.id, isActive: false } as any, req.user!)
    res.status(HttpStatusCode.NoContent).send()
  },
)

router.post(
  '/items/:id/adjust-quantity',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const existing = await getItemById(req.params.id)
    if (!existing) return problem({ status: 404, detail: 'Item not found' })

    const { delta, notes } = QuantityAdjustmentSchema.parse(req.body)

    try {
      const item = await adjustQuantity(req.params.id, delta, notes, req.user!)
      res.json(item)
    } catch (err: any) {
      if (err?.message === 'Quantity cannot be negative') {
        return problem({ status: 400, detail: 'Quantity cannot be negative' })
      }
      throw err
    }
  },
)
