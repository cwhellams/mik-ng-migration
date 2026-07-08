import { db } from './connection.ts'
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
} from '../routes/inventory/models.ts'
import type { DB, Json } from './schema.d.ts'
import { sql, type Kysely, type Transaction } from 'kysely'

type Executor = Kysely<DB> | Transaction<DB>

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
  location_id: string
  name: Json
  description: Json | null
  is_active: boolean
  sort_order: number
  created_at: Date | string
  created_by: string
  updated_at: Date | string
  updated_by: string
}

function toLocation(r: LocationRow): InventoryLocation {
  return {
    locationId: r.location_id,
    name: r.name as InventoryLocation['name'],
    description: r.description as InventoryLocation['description'],
    isActive: r.is_active,
    sortOrder: r.sort_order,
    createdAt: toDate(r.created_at),
    createdBy: r.created_by,
    updatedAt: toDate(r.updated_at),
    updatedBy: r.updated_by,
  }
}

export async function getLocations(activeOnly = true): Promise<InventoryLocation[]> {
  let q = db.selectFrom('inventory.locations').selectAll()
  if (activeOnly) q = q.where('is_active', '=', true)
  const rows = await q.orderBy('sort_order').execute()
  return rows.map((r) => toLocation(r as unknown as LocationRow))
}

export async function getLocationById(id: string): Promise<InventoryLocation | undefined> {
  const r = await db
    .selectFrom('inventory.locations')
    .selectAll()
    .where('location_id', '=', id)
    .executeTakeFirst()
  return r ? toLocation(r as unknown as LocationRow) : undefined
}

export async function upsertLocation(
  data: InventoryLocationUpsert,
  user: JWTUser,
): Promise<InventoryLocation> {
  if (data.locationId) {
    const update: Record<string, unknown> = {
      updated_by: user.memberId,
      updated_at: new Date(),
    }
    if (data.name !== undefined) update.name = data.name as unknown as Json
    if (data.description !== undefined)
      update.description = (data.description as unknown as Json) ?? null
    if (data.isActive !== undefined) update.is_active = data.isActive
    if (data.sortOrder !== undefined) update.sort_order = data.sortOrder

    await db
      .updateTable('inventory.locations')
      .set(update as any)
      .where('location_id', '=', data.locationId)
      .execute()
    return getLocationById(data.locationId) as Promise<InventoryLocation>
  } else {
    const id = generateShortId()
    await db
      .insertInto('inventory.locations')
      .values({
        location_id: id,
        name: data.name as unknown as Json,
        description: (data.description as unknown as Json) ?? null,
        is_active: data.isActive ?? true,
        sort_order: data.sortOrder ?? 0,
        created_by: user.memberId,
        updated_by: user.memberId,
      })
      .execute()
    return getLocationById(id) as Promise<InventoryLocation>
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────

type CategoryRow = {
  category_id: string
  name: Json
  description: Json | null
  is_active: boolean
  sort_order: number
  created_at: Date | string
  created_by: string
  updated_at: Date | string
  updated_by: string
}

function toCategory(r: CategoryRow): InventoryCategory {
  return {
    categoryId: r.category_id,
    name: r.name as InventoryCategory['name'],
    description: r.description as InventoryCategory['description'],
    isActive: r.is_active,
    sortOrder: r.sort_order,
    createdAt: toDate(r.created_at),
    createdBy: r.created_by,
    updatedAt: toDate(r.updated_at),
    updatedBy: r.updated_by,
  }
}

export async function getCategories(activeOnly = true): Promise<InventoryCategory[]> {
  let q = db.selectFrom('inventory.categories').selectAll()
  if (activeOnly) q = q.where('is_active', '=', true)
  const rows = await q.orderBy('sort_order').execute()
  return rows.map((r) => toCategory(r as unknown as CategoryRow))
}

export async function getCategoryById(id: string): Promise<InventoryCategory | undefined> {
  const r = await db
    .selectFrom('inventory.categories')
    .selectAll()
    .where('category_id', '=', id)
    .executeTakeFirst()
  return r ? toCategory(r as unknown as CategoryRow) : undefined
}

export async function upsertCategory(
  data: InventoryCategoryUpsert,
  user: JWTUser,
): Promise<InventoryCategory> {
  if (data.categoryId) {
    const update: Record<string, unknown> = {
      updated_by: user.memberId,
      updated_at: new Date(),
    }
    if (data.name !== undefined) update.name = data.name as unknown as Json
    if (data.description !== undefined)
      update.description = (data.description as unknown as Json) ?? null
    if (data.isActive !== undefined) update.is_active = data.isActive
    if (data.sortOrder !== undefined) update.sort_order = data.sortOrder

    await db
      .updateTable('inventory.categories')
      .set(update as any)
      .where('category_id', '=', data.categoryId)
      .execute()
    return getCategoryById(data.categoryId) as Promise<InventoryCategory>
  } else {
    const id = generateShortId()
    await db
      .insertInto('inventory.categories')
      .values({
        category_id: id,
        name: data.name as unknown as Json,
        description: (data.description as unknown as Json) ?? null,
        is_active: data.isActive ?? true,
        sort_order: data.sortOrder ?? 0,
        created_by: user.memberId,
        updated_by: user.memberId,
      })
      .execute()
    return getCategoryById(id) as Promise<InventoryCategory>
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Items
// ─────────────────────────────────────────────────────────────────────────────

type ItemRow = {
  item_id: string
  category_id: string
  location_id: string | null
  item_type: string
  name: Json
  description: Json | null
  quantity: number
  low_stock_threshold: number | null
  condition: string
  serial_number: string | null
  image_url: string | null
  notes: string | null
  tags: string[]
  is_active: boolean
  created_at: Date | string
  created_by: string
  updated_at: Date | string
  updated_by: string
}

function toItem(r: ItemRow, category?: CategoryRow, location?: LocationRow | null): InventoryItem {
  return {
    itemId: r.item_id,
    categoryId: r.category_id,
    locationId: r.location_id ?? null,
    itemType: r.item_type as InventoryItem['itemType'],
    name: r.name as InventoryItem['name'],
    description: r.description as InventoryItem['description'],
    quantity: r.quantity,
    lowStockThreshold: r.low_stock_threshold ?? null,
    condition: r.condition as InventoryItem['condition'],
    serialNumber: r.serial_number ?? null,
    imageUrl: r.image_url ?? null,
    notes: r.notes ?? null,
    tags: r.tags ?? [],
    isActive: r.is_active,
    createdAt: toDate(r.created_at),
    createdBy: r.created_by,
    updatedAt: toDate(r.updated_at),
    updatedBy: r.updated_by,
    ...(category !== undefined ? { category: toCategory(category) } : {}),
    ...(location !== undefined
      ? { location: location !== null ? toLocation(location) : null }
      : {}),
  }
}

export async function getItems(filters?: InventoryFilters): Promise<InventoryItem[]> {
  let q = db
    .selectFrom('inventory.items as i')
    .leftJoin('inventory.categories as c', 'c.category_id', 'i.category_id')
    .leftJoin('inventory.locations as l', 'l.location_id', 'i.location_id')
    .selectAll('i')
    .select([
      sql<Json>`c.name`.as('category_name'),
      sql<Json | null>`c.description`.as('category_description'),
      sql<boolean>`c.is_active`.as('category_is_active'),
      sql<number>`c.sort_order`.as('category_sort_order'),
      sql<Date>`c.created_at`.as('category_created_at'),
      sql<string>`c.created_by`.as('category_created_by'),
      sql<Date>`c.updated_at`.as('category_updated_at'),
      sql<string>`c.updated_by`.as('category_updated_by'),
      sql<Json | null>`l.name`.as('location_name'),
      sql<Json | null>`l.description`.as('location_description'),
      sql<boolean | null>`l.is_active`.as('location_is_active'),
      sql<number | null>`l.sort_order`.as('location_sort_order'),
      sql<Date | null>`l.created_at`.as('location_created_at'),
      sql<string | null>`l.created_by`.as('location_created_by'),
      sql<Date | null>`l.updated_at`.as('location_updated_at'),
      sql<string | null>`l.updated_by`.as('location_updated_by'),
    ])

  if (!filters?.includeInactive) {
    q = q.where('i.is_active', '=', true)
  }
  if (filters?.categoryId) {
    q = q.where('i.category_id', '=', filters.categoryId)
  }
  if (filters?.locationId) {
    q = q.where('i.location_id', '=', filters.locationId)
  }
  if (filters?.itemType) {
    q = q.where('i.item_type', '=', filters.itemType as any)
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
    .orderBy('i.category_id')
    .orderBy(sql`i.name->>'en'`)
    .execute()

  return rows.map((r: any) => {
    const itemRow = r as ItemRow
    const categoryRow: CategoryRow | undefined = r.category_name
      ? {
          category_id: r.category_id,
          name: r.category_name,
          description: r.category_description,
          is_active: r.category_is_active,
          sort_order: r.category_sort_order,
          created_at: r.category_created_at,
          created_by: r.category_created_by,
          updated_at: r.category_updated_at,
          updated_by: r.category_updated_by,
        }
      : undefined

    const locationRow: LocationRow | null =
      r.location_id && r.location_name
        ? {
            location_id: r.location_id,
            name: r.location_name,
            description: r.location_description,
            is_active: r.location_is_active,
            sort_order: r.location_sort_order,
            created_at: r.location_created_at,
            created_by: r.location_created_by,
            updated_at: r.location_updated_at,
            updated_by: r.location_updated_by,
          }
        : null

    return toItem(itemRow, categoryRow, locationRow)
  })
}

export async function getItemById(id: string): Promise<InventoryItem | undefined> {
  const r = await db
    .selectFrom('inventory.items')
    .selectAll()
    .where('item_id', '=', id)
    .executeTakeFirst()
  if (!r) return undefined

  const itemRow = r as unknown as ItemRow
  const categoryRow = itemRow.category_id
    ? await getCategoryRowById(itemRow.category_id)
    : undefined
  const locationRow = itemRow.location_id ? await getLocationRowById(itemRow.location_id) : null

  return toItem(itemRow, categoryRow, locationRow)
}

async function getCategoryRowById(id: string): Promise<CategoryRow | undefined> {
  const r = await db
    .selectFrom('inventory.categories')
    .selectAll()
    .where('category_id', '=', id)
    .executeTakeFirst()
  return r ? (r as unknown as CategoryRow) : undefined
}

async function getLocationRowById(id: string): Promise<LocationRow | undefined> {
  const r = await db
    .selectFrom('inventory.locations')
    .selectAll()
    .where('location_id', '=', id)
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
      updated_by: user.memberId,
      updated_at: new Date(),
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
    await db.transaction().execute(async (txn) => {
      await txn
        .updateTable('inventory.items')
        .set(update as any)
        .where('item_id', '=', itemId)
        .execute()

      await writeAuditLog(txn, itemId, user.memberId, 'UPDATED', oldValues, changed)
    })

    return getItemById(itemId) as Promise<InventoryItem>
  } else {
    const id = generateShortId()
    await db.transaction().execute(async (txn) => {
      await txn
        .insertInto('inventory.items')
        .values({
          item_id: id,
          category_id: data.categoryId,
          location_id: data.locationId ?? null,
          item_type: (data.itemType ?? 'CONSUMABLE') as any,
          name: data.name as unknown as Json,
          description: (data.description as unknown as Json) ?? null,
          quantity: data.quantity ?? 0,
          low_stock_threshold: data.lowStockThreshold ?? null,
          condition: (data.condition ?? 'UNKNOWN') as any,
          serial_number: data.serialNumber ?? null,
          image_url: data.imageUrl ?? null,
          notes: data.notes ?? null,
          tags: data.tags ?? [],
          is_active: data.isActive ?? true,
          created_by: user.memberId,
          updated_by: user.memberId,
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
  await db.transaction().execute(async (txn) => {
    // Apply the delta atomically in SQL so concurrent adjustments cannot lose
    // updates. The `quantity + delta >= 0` guard rejects an over-decrement at the
    // DB level, so no row is updated when the result would go negative.
    const updated = await txn
      .updateTable('inventory.items')
      .set({
        quantity: sql`quantity + ${delta}`,
        updated_by: user.memberId,
        updated_at: new Date() as any,
      })
      .where('item_id', '=', itemId)
      .where(sql<boolean>`quantity + ${delta} >= 0`)
      .returning('quantity')
      .executeTakeFirst()

    if (!updated) {
      // No row updated: either the item is gone or the delta would go negative.
      const exists = await txn
        .selectFrom('inventory.items')
        .select('item_id')
        .where('item_id', '=', itemId)
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
    .insertInto('inventory.audit_log')
    .values({
      item_id: itemId,
      member_id: memberId,
      change_type: changeType,
      old_value: oldValue ? (oldValue as unknown as Json) : null,
      new_value: newValue ? (newValue as unknown as Json) : null,
      notes: notes ?? null,
    })
    .execute()
}

export async function getAuditLog(itemId: string): Promise<InventoryAuditLogEntry[]> {
  const rows = await db
    .selectFrom('inventory.audit_log')
    .selectAll()
    .where('item_id', '=', itemId)
    .orderBy('created_at', 'desc')
    .execute()

  return rows.map((r) => ({
    logId: r.log_id,
    itemId: r.item_id,
    memberId: r.member_id,
    changeType: r.change_type,
    oldValue: r.old_value as Record<string, unknown> | null,
    newValue: r.new_value as Record<string, unknown> | null,
    notes: r.notes ?? null,
    createdAt: toDate(r.created_at),
  }))
}
