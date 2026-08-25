import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { onlySent } from '../patchBody.ts'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import {
  InventoryLocationUpsertSchema,
  InventoryCategoryUpsertSchema,
  InventoryItemUpsertSchema,
  InventoryFiltersSchema,
  QuantityAdjustmentSchema,
} from '@mik/contracts/inventory'
import {
  ItemUnitStatusTransitionSchema,
  ItemUnitUpsertSchema,
  type ItemUnitListResponse,
} from '@mik/contracts/inventory-units'
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
import {
  getInServiceUnitCount,
  getUnitById,
  getUnitsByItemId,
  transitionUnitStatus,
  upsertUnit,
} from '../../db/item-unit-queries.ts'

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

    // Zod re-applies a field's `.default()` even under `.partial()`, so the
    // parsed body asserts `itemType: 'CONSUMABLE'`, `condition: 'UNKNOWN'`,
    // `tags: []`, `isActive: true` and `isReservable: false` whether the caller
    // sent them or not — and `upsertItem` writes every field that is defined.
    // A PUT that only meant to correct a name would quietly un-reserve the
    // item, un-retire it and drop its tags. `onlySent` keeps the patch to the
    // fields the caller actually sent.
    const parsed = InventoryItemUpsertSchema.partial().parse({
      ...req.body,
      itemId: req.params.id,
    })
    const data = { ...onlySent(parsed, req.body), itemId: req.params.id }

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

// ─────────────────────────────────────────────────────────────────────────────
// Item units (#1139)
//
// The physical units of an item live under the item, because that is what they
// are: creating one is inventory-catalog work, gated on INVENTORY_ADMIN like
// every other write here. *Reserving* one is a different privilege axis and
// lives in /api/v1/inventory-reservations.
//
// Reads are open to INVENTORY_USER, since the reservation editor needs the unit
// list to offer "this specific vest".
// ─────────────────────────────────────────────────────────────────────────────

router.get('/items/:id/units', async (req: Request<Record<string, string>>, res: Response) => {
  const admin = isInventoryAdmin(req)
  const item = await getItemById(req.params.id)
  if (!item || (!item.isActive && !admin)) {
    return problem({ status: 404, detail: 'Item not found' })
  }

  // A retired unit is history an admin needs and a member does not — the same
  // split as inactive items on the listing above.
  //
  // Both keyed only on the item, so one round trip: this endpoint backs the
  // reservation editor's unit picker as well as the admin units tab, and there
  // is nothing in the count that depends on the list.
  const [units, inServiceCount] = await Promise.all([
    getUnitsByItemId(req.params.id, admin),
    getInServiceUnitCount(req.params.id),
  ])

  res.json(<ItemUnitListResponse>{ units, inServiceCount })
})

router.post(
  '/items/:id/units',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const item = await getItemById(req.params.id)
    if (!item) return problem({ status: 404, detail: 'Item not found' })

    const data = ItemUnitUpsertSchema.parse({
      ...req.body,
      itemId: req.params.id,
      unitId: undefined,
    })

    try {
      const unit = await upsertUnit(data, req.user!)
      res.status(HttpStatusCode.Created).json(unit)
    } catch (err: any) {
      // uq_item_units_tag: two units of one item cannot claim the same tag.
      if (err?.constraint === 'uq_item_units_tag') {
        return problem({ status: 409, detail: 'Another unit of this item already has that tag' })
      }
      throw err
    }
  },
)

router.put(
  '/units/:unitId',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const existing = await getUnitById(req.params.unitId)
    if (!existing) return problem({ status: 404, detail: 'Unit not found' })

    // Zod re-applies a field's `.default()` even under `.partial()`, so the
    // parsed body carries `condition: 'UNKNOWN'` and `isActive: true` whether
    // or not the caller sent them — which would quietly reset a unit's
    // condition, and un-retire it, on a PUT that only meant to add a note.
    // `onlySent` keeps the patch to the fields actually present in the body;
    // the two ids come from the path, so they are added back after it.
    const parsed = ItemUnitUpsertSchema.partial().parse({
      ...((req.body ?? {}) as Record<string, unknown>),
      itemId: existing.itemId,
      unitId: req.params.unitId,
    })
    const patch = {
      ...onlySent(parsed, req.body),
      itemId: existing.itemId,
      unitId: req.params.unitId,
    }

    try {
      const unit = await upsertUnit(patch, req.user!)
      res.json(unit)
    } catch (err: any) {
      if (err?.constraint === 'uq_item_units_tag') {
        return problem({ status: 409, detail: 'Another unit of this item already has that tag' })
      }
      throw err
    }
  },
)

router.post(
  '/units/:unitId/status',
  validateUser(MIKPermissions.INVENTORY_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const existing = await getUnitById(req.params.unitId)
    if (!existing) return problem({ status: 404, detail: 'Unit not found' })

    const { status, notes } = ItemUnitStatusTransitionSchema.parse(req.body)
    const unit = await transitionUnitStatus(req.params.unitId, status, notes, req.user!)
    if (!unit) return problem({ status: 404, detail: 'Unit not found' })

    res.json(unit)
  },
)
