import type { Updateable } from 'kysely'
import { camelDb } from './connection.ts'
import { generateShortId } from '../util/nanoId.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  InventoryLocation,
  InventoryLocationUpsert,
  InventoryCategory,
  InventoryCategoryUpsert,
  InventoryItem,
  InventoryItemUpsert,
  InventoryFilters,
  InventoryAuditLogEntry,
} from '@mik/contracts/inventory'
import type { Json, InventoryCategories, InventoryLocations } from './schema.camel.d.ts'
import type { DB as CamelDB } from './schema.camel.d.ts'
import { sql, type Kysely, type Transaction } from 'kysely'

type Executor = Kysely<CamelDB> | Transaction<CamelDB>

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toDate(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : d
}

// ─────────────────────────────────────────────────────────────────────────────
// Locations
// ─────────────────────────────────────────────────────────────────────────────

type LocationRow = {
  locationId: string
  name: Json
  description: Json | null
  isActive: boolean
  sortOrder: number
  createdAt: Date | string
  createdBy: string
  updatedAt: Date | string
  updatedBy: string
}

function toLocation(r: LocationRow): InventoryLocation {
  return {
    locationId: r.locationId,
    name: r.name as InventoryLocation['name'],
    description: r.description as InventoryLocation['description'],
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    createdAt: toDate(r.createdAt),
    createdBy: r.createdBy,
    updatedAt: toDate(r.updatedAt),
    updatedBy: r.updatedBy,
  }
}

export async function getLocations(activeOnly = true): Promise<InventoryLocation[]> {
  let q = camelDb.selectFrom('inventory.locations').selectAll()
  if (activeOnly) q = q.where('isActive', '=', true)
  const rows = await q.orderBy('sortOrder').execute()
  return rows.map((r) => toLocation(r as unknown as LocationRow))
}

export async function getLocationById(id: string): Promise<InventoryLocation | undefined> {
  const r = await camelDb
    .selectFrom('inventory.locations')
    .selectAll()
    .where('locationId', '=', id)
    .executeTakeFirst()
  return r ? toLocation(r as unknown as LocationRow) : undefined
}

export async function upsertLocation(
  data: InventoryLocationUpsert,
  user: JWTUser,
): Promise<InventoryLocation> {
  if (data.locationId) {
    const update: Updateable<InventoryLocations> = {
      updatedBy: user.memberId,
      updatedAt: new Date(),
    }
    if (data.name !== undefined) update.name = data.name as unknown as Json
    if (data.description !== undefined)
      update.description = (data.description as unknown as Json) ?? null
    if (data.isActive !== undefined) update.isActive = data.isActive
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder

    await camelDb
      .updateTable('inventory.locations')
      .set(update)
      .where('locationId', '=', data.locationId)
      .execute()
    return getLocationById(data.locationId) as Promise<InventoryLocation>
  } else {
    const id = generateShortId()
    await camelDb
      .insertInto('inventory.locations')
      .values({
        locationId: id,
        name: data.name as unknown as Json,
        description: (data.description as unknown as Json) ?? null,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
        createdBy: user.memberId,
        updatedBy: user.memberId,
      })
      .execute()
    return getLocationById(id) as Promise<InventoryLocation>
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────

type CategoryRow = {
  categoryId: string
  name: Json
  description: Json | null
  isActive: boolean
  sortOrder: number
  createdAt: Date | string
  createdBy: string
  updatedAt: Date | string
  updatedBy: string
}

function toCategory(r: CategoryRow): InventoryCategory {
  return {
    categoryId: r.categoryId,
    name: r.name as InventoryCategory['name'],
    description: r.description as InventoryCategory['description'],
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    createdAt: toDate(r.createdAt),
    createdBy: r.createdBy,
    updatedAt: toDate(r.updatedAt),
    updatedBy: r.updatedBy,
  }
}

export async function getCategories(activeOnly = true): Promise<InventoryCategory[]> {
  let q = camelDb.selectFrom('inventory.categories').selectAll()
  if (activeOnly) q = q.where('isActive', '=', true)
  const rows = await q.orderBy('sortOrder').execute()
  return rows.map((r) => toCategory(r as unknown as CategoryRow))
}

export async function getCategoryById(id: string): Promise<InventoryCategory | undefined> {
  const r = await camelDb
    .selectFrom('inventory.categories')
    .selectAll()
    .where('categoryId', '=', id)
    .executeTakeFirst()
  return r ? toCategory(r as unknown as CategoryRow) : undefined
}

export async function upsertCategory(
  data: InventoryCategoryUpsert,
  user: JWTUser,
): Promise<InventoryCategory> {
  if (data.categoryId) {
    const update: Updateable<InventoryCategories> = {
      updatedBy: user.memberId,
      updatedAt: new Date(),
    }
    if (data.name !== undefined) update.name = data.name as unknown as Json
    if (data.description !== undefined)
      update.description = (data.description as unknown as Json) ?? null
    if (data.isActive !== undefined) update.isActive = data.isActive
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder

    await camelDb
      .updateTable('inventory.categories')
      .set(update)
      .where('categoryId', '=', data.categoryId)
      .execute()
    return getCategoryById(data.categoryId) as Promise<InventoryCategory>
  } else {
    const id = generateShortId()
    await camelDb
      .insertInto('inventory.categories')
      .values({
        categoryId: id,
        name: data.name as unknown as Json,
        description: (data.description as unknown as Json) ?? null,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
        createdBy: user.memberId,
        updatedBy: user.memberId,
      })
      .execute()
    return getCategoryById(id) as Promise<InventoryCategory>
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Items
// ─────────────────────────────────────────────────────────────────────────────

type ItemRow = {
  itemId: string
  categoryId: string
  locationId: string | null
  itemType: string
  name: Json
  description: Json | null
  quantity: number
  lowStockThreshold: number | null
  condition: string
  serialNumber: string | null
  imageUrl: string | null
  notes: string | null
  tags: string[]
  isActive: boolean
  createdAt: Date | string
  createdBy: string
  updatedAt: Date | string
  updatedBy: string
}

function toItem(r: ItemRow, category?: CategoryRow, location?: LocationRow | null): InventoryItem {
  return {
    itemId: r.itemId,
    categoryId: r.categoryId,
    locationId: r.locationId ?? null,
    itemType: r.itemType as InventoryItem['itemType'],
    name: r.name as InventoryItem['name'],
    description: r.description as InventoryItem['description'],
    quantity: r.quantity,
    lowStockThreshold: r.lowStockThreshold ?? null,
    condition: r.condition as InventoryItem['condition'],
    serialNumber: r.serialNumber ?? null,
    imageUrl: r.imageUrl ?? null,
    notes: r.notes ?? null,
    tags: r.tags ?? [],
    isActive: r.isActive,
    createdAt: toDate(r.createdAt),
    createdBy: r.createdBy,
    updatedAt: toDate(r.updatedAt),
    updatedBy: r.updatedBy,
    ...(category !== undefined ? { category: toCategory(category) } : {}),
    ...(location !== undefined
      ? { location: location !== null ? toLocation(location) : null }
      : {}),
  }
}

export async function getItems(filters?: InventoryFilters): Promise<InventoryItem[]> {
  let q = camelDb
    .selectFrom('inventory.items as i')
    .leftJoin('inventory.categories as c', 'c.categoryId', 'i.categoryId')
    .leftJoin('inventory.locations as l', 'l.locationId', 'i.locationId')
    .selectAll('i')
    .select([
      sql<Json>`c.name`.as('categoryName'),
      sql<Json | null>`c.description`.as('categoryDescription'),
      sql<boolean>`c.is_active`.as('categoryIsActive'),
      sql<number>`c.sort_order`.as('categorySortOrder'),
      sql<Date>`c.created_at`.as('categoryCreatedAt'),
      sql<string>`c.created_by`.as('categoryCreatedBy'),
      sql<Date>`c.updated_at`.as('categoryUpdatedAt'),
      sql<string>`c.updated_by`.as('categoryUpdatedBy'),
      sql<Json | null>`l.name`.as('locationName'),
      sql<Json | null>`l.description`.as('locationDescription'),
      sql<boolean | null>`l.is_active`.as('locationIsActive'),
      sql<number | null>`l.sort_order`.as('locationSortOrder'),
      sql<Date | null>`l.created_at`.as('locationCreatedAt'),
      sql<string | null>`l.created_by`.as('locationCreatedBy'),
      sql<Date | null>`l.updated_at`.as('locationUpdatedAt'),
      sql<string | null>`l.updated_by`.as('locationUpdatedBy'),
    ])

  if (!filters?.includeInactive) {
    q = q.where('i.isActive', '=', true)
  }
  if (filters?.categoryId) {
    q = q.where('i.categoryId', '=', filters.categoryId)
  }
  if (filters?.locationId) {
    q = q.where('i.locationId', '=', filters.locationId)
  }
  if (filters?.itemType) {
    q = q.where('i.itemType', '=', filters.itemType as any)
  }
  if (filters?.search) {
    const term = `%${filters.search}%`
    q = q.where((eb) =>
      eb.or([
        eb(sql`i.name->>'en'`, 'ilike', term),
        eb(sql`i.name->>'fi'`, 'ilike', term),
        eb(sql`i.notes`, 'ilike', term),
        eb(sql`i.serial_number`, 'ilike', term),
      ]),
    )
  }

  const rows = await q
    .orderBy('i.categoryId')
    .orderBy(sql`i.name->>'en'`)
    .execute()

  return rows.map((r: any) => {
    const itemRow = r as ItemRow
    const categoryRow: CategoryRow | undefined = r.categoryName
      ? {
          categoryId: r.categoryId,
          name: r.categoryName,
          description: r.categoryDescription,
          isActive: r.categoryIsActive,
          sortOrder: r.categorySortOrder,
          createdAt: r.categoryCreatedAt,
          createdBy: r.categoryCreatedBy,
          updatedAt: r.categoryUpdatedAt,
          updatedBy: r.categoryUpdatedBy,
        }
      : undefined

    const locationRow: LocationRow | null =
      r.locationId && r.locationName
        ? {
            locationId: r.locationId,
            name: r.locationName,
            description: r.locationDescription,
            isActive: r.locationIsActive,
            sortOrder: r.locationSortOrder,
            createdAt: r.locationCreatedAt,
            createdBy: r.locationCreatedBy,
            updatedAt: r.locationUpdatedAt,
            updatedBy: r.locationUpdatedBy,
          }
        : null

    return toItem(itemRow, categoryRow, locationRow)
  })
}

export async function getItemById(id: string): Promise<InventoryItem | undefined> {
  const r = await camelDb
    .selectFrom('inventory.items')
    .selectAll()
    .where('itemId', '=', id)
    .executeTakeFirst()
  if (!r) return undefined

  const itemRow = r as unknown as ItemRow
  const categoryRow = itemRow.categoryId ? await getCategoryRowById(itemRow.categoryId) : undefined
  const locationRow = itemRow.locationId ? await getLocationRowById(itemRow.locationId) : null

  return toItem(itemRow, categoryRow, locationRow)
}

async function getCategoryRowById(id: string): Promise<CategoryRow | undefined> {
  const r = await camelDb
    .selectFrom('inventory.categories')
    .selectAll()
    .where('categoryId', '=', id)
    .executeTakeFirst()
  return r ? (r as unknown as CategoryRow) : undefined
}

async function getLocationRowById(id: string): Promise<LocationRow | undefined> {
  const r = await camelDb
    .selectFrom('inventory.locations')
    .selectAll()
    .where('locationId', '=', id)
    .executeTakeFirst()
  return r ? (r as unknown as LocationRow) : undefined
}

export async function upsertItem(data: InventoryItemUpsert, user: JWTUser): Promise<InventoryItem> {
  if (data.itemId) {
    const itemId = data.itemId
    // Capture the pre-edit state so the audit log records what actually changed.
    const before = await getItemById(itemId)

    // Build the DB patch (snake_case) and a parallel camelCase record of the
    // changed fields for the audit log. `quantity` is intentionally NOT editable
    // here — stock is only ever changed through adjustQuantity so that every
    // movement is captured as a QUANTITY_CHANGE audit entry.
    const update: Record<string, unknown> = {
      updatedBy: user.memberId,
      updatedAt: new Date(),
    }
    const changed: Record<string, unknown> = {}
    const set = <T>(dbKey: string, camelKey: keyof InventoryItem, value: T) => {
      update[dbKey] = value
      changed[camelKey as string] = value
    }
    if (data.categoryId !== undefined) set('category_id', 'categoryId', data.categoryId)
    if (data.locationId !== undefined) set('location_id', 'locationId', data.locationId ?? null)
    if (data.itemType !== undefined) set('item_type', 'itemType', data.itemType)
    if (data.name !== undefined) set('name', 'name', data.name as unknown as Json)
    if (data.description !== undefined)
      set('description', 'description', (data.description as unknown as Json) ?? null)
    if (data.lowStockThreshold !== undefined)
      set('low_stock_threshold', 'lowStockThreshold', data.lowStockThreshold ?? null)
    if (data.condition !== undefined) set('condition', 'condition', data.condition)
    if (data.serialNumber !== undefined)
      set('serial_number', 'serialNumber', data.serialNumber ?? null)
    if (data.imageUrl !== undefined) set('image_url', 'imageUrl', data.imageUrl ?? null)
    if (data.notes !== undefined) set('notes', 'notes', data.notes ?? null)
    if (data.tags !== undefined) set('tags', 'tags', data.tags)
    if (data.isActive !== undefined) set('is_active', 'isActive', data.isActive)

    const oldValues: Record<string, unknown> = {}
    if (before) {
      for (const key of Object.keys(changed)) {
        oldValues[key] = (before as unknown as Record<string, unknown>)[key] ?? null
      }
    }

    // Item update and its audit entry must commit together — a partial write
    // would leave a gap in the audit trail.
    await camelDb.transaction().execute(async (txn) => {
      await txn
        .updateTable('inventory.items')
        .set(update as any)
        .where('itemId', '=', itemId)
        .execute()

      await writeAuditLog(txn, itemId, user.memberId, 'UPDATED', oldValues, changed)
    })

    return getItemById(itemId) as Promise<InventoryItem>
  } else {
    const id = generateShortId()
    await camelDb.transaction().execute(async (txn) => {
      await txn
        .insertInto('inventory.items')
        .values({
          itemId: id,
          categoryId: data.categoryId,
          locationId: data.locationId ?? null,
          itemType: (data.itemType ?? 'CONSUMABLE') as any,
          name: data.name as unknown as Json,
          description: (data.description as unknown as Json) ?? null,
          quantity: data.quantity ?? 0,
          lowStockThreshold: data.lowStockThreshold ?? null,
          condition: (data.condition ?? 'UNKNOWN') as any,
          serialNumber: data.serialNumber ?? null,
          imageUrl: data.imageUrl ?? null,
          notes: data.notes ?? null,
          tags: data.tags ?? [],
          isActive: data.isActive ?? true,
          createdBy: user.memberId,
          updatedBy: user.memberId,
        })
        .execute()

      await writeAuditLog(txn, id, user.memberId, 'CREATED', null, { itemId: id })
    })

    return getItemById(id) as Promise<InventoryItem>
  }
}

export async function adjustQuantity(
  itemId: string,
  delta: number,
  notes: string | null | undefined,
  user: JWTUser,
): Promise<InventoryItem> {
  await camelDb.transaction().execute(async (txn) => {
    // Apply the delta atomically in SQL so concurrent adjustments cannot lose
    // updates. The `quantity + delta >= 0` guard rejects an over-decrement at the
    // DB level, so no row is updated when the result would go negative.
    const updated = await txn
      .updateTable('inventory.items')
      .set({
        quantity: sql`quantity + ${delta}`,
        updatedBy: user.memberId,
        updatedAt: new Date() as any,
      })
      .where('itemId', '=', itemId)
      .where(sql<boolean>`quantity + ${delta} >= 0`)
      .returning('quantity')
      .executeTakeFirst()

    if (!updated) {
      // No row updated: either the item is gone or the delta would go negative.
      const exists = await txn
        .selectFrom('inventory.items')
        .select('itemId')
        .where('itemId', '=', itemId)
        .executeTakeFirst()
      throw new Error(exists ? 'Quantity cannot be negative' : 'Item not found')
    }

    const newQty = updated.quantity
    await writeAuditLog(
      txn,
      itemId,
      user.memberId,
      'QUANTITY_CHANGE',
      { quantity: newQty - delta },
      { quantity: newQty, notes: notes ?? null },
    )
  })

  return getItemById(itemId) as Promise<InventoryItem>
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────────

async function writeAuditLog(
  executor: Executor,
  itemId: string,
  memberId: string,
  changeType: string,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  notes?: string | null,
): Promise<void> {
  await executor
    .insertInto('inventory.auditLog')
    .values({
      itemId: itemId,
      memberId: memberId,
      changeType: changeType,
      oldValue: oldValue ? (oldValue as unknown as Json) : null,
      newValue: newValue ? (newValue as unknown as Json) : null,
      notes: notes ?? null,
    })
    .execute()
}

export async function getAuditLog(itemId: string): Promise<InventoryAuditLogEntry[]> {
  const rows = await camelDb
    .selectFrom('inventory.auditLog')
    .selectAll()
    .where('itemId', '=', itemId)
    .orderBy('createdAt', 'desc')
    .execute()

  return rows.map((r) => ({
    logId: r.logId,
    itemId: r.itemId,
    memberId: r.memberId,
    changeType: r.changeType,
    oldValue: r.oldValue as Record<string, unknown> | null,
    newValue: r.newValue as Record<string, unknown> | null,
    notes: r.notes ?? null,
    createdAt: toDate(r.createdAt),
  }))
}
