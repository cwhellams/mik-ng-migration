import type { ItemUnit, ItemUnitStatus, ItemUnitUpsert } from '@mik/contracts/inventory-units'
import { sql } from 'kysely'
import type { Updateable } from 'kysely'

import { auditUpdate, mapAudit } from './audit.ts'
import { db, type DbRow } from './connection.ts'
import { writeAuditLog, type Executor } from './inventory-queries.ts'
import type { InventoryItemUnits, Json } from './schema.d.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import { generateShortId } from '../util/nanoId.ts'

/**
 * The physical units of an inventory item (#1139).
 *
 * Kept in its own module rather than folded into `inventory-queries.ts` because
 * the reservation queries are its main consumer, but it shares that file's
 * `writeAuditLog` and `Executor` — a unit leaving service is a change to the
 * item, and belongs in the item's one history rather than a second log.
 */

const mapRow = (row: DbRow<'inventory.itemUnits'>): ItemUnit => ({
  unitId: row.unitId,
  itemId: row.itemId,
  tag: row.tag,
  status: row.status as ItemUnitStatus,
  condition: row.condition,
  notes: row.notes,
  isActive: row.isActive,
  ...mapAudit(row),
})

export const getUnitsByItemId = async (
  itemId: string,
  includeInactive = true,
): Promise<ItemUnit[]> => {
  let query = db.selectFrom('inventory.itemUnits').selectAll().where('itemId', '=', itemId)

  if (!includeInactive) {
    query = query.where('isActive', '=', true)
  }

  const rows = await query.orderBy('tag', 'asc').orderBy('unitId', 'asc').execute()
  return rows.map(mapRow)
}

export const getUnitById = async (unitId: string): Promise<ItemUnit | undefined> => {
  const row = await db
    .selectFrom('inventory.itemUnits')
    .selectAll()
    .where('unitId', '=', unitId)
    .executeTakeFirst()

  return row ? mapRow(row) : undefined
}

/**
 * How many of an item's units count towards reservation capacity.
 *
 * Delegates to `inventory.in_service_unit_count()` rather than re-stating the
 * predicate, so the app's friendly pre-check and the capacity trigger cannot
 * disagree about which statuses hold a place in the pool. Raw SQL, so the
 * function name stays snake_case (see DATA_LAYER.md).
 */
export const getInServiceUnitCount = async (
  itemId: string,
  executor: Executor = db,
): Promise<number> => {
  const result = await sql<{ count: number }>`
    SELECT inventory.in_service_unit_count(${itemId}) AS count
  `.execute(executor)

  return Number(result.rows[0]?.count ?? 0)
}

/**
 * Insert or update a unit. `status` is not patchable here — it only moves
 * through `transitionUnitStatus` below, so every change to whether a unit is in
 * service leaves an audit-log row behind.
 *
 * Takes a *partial* upsert (with `itemId` always present) rather than the full
 * one: a PUT patches the fields the caller sent, and every field below is read
 * as "present or not". Saying so in the type is what lets the route hand its
 * `ItemUnitUpsertSchema.partial()` result straight over, instead of the `as any`
 * the older inventory routes need.
 */
export const upsertUnit = async (
  data: Partial<ItemUnitUpsert> & Pick<ItemUnitUpsert, 'itemId'>,
  user: JWTUser,
): Promise<ItemUnit> => {
  if (data.unitId) {
    const unitId = data.unitId
    const update: Updateable<InventoryItemUnits> = { ...auditUpdate(user) }
    const changed: Record<string, Json> = {}

    if (data.tag !== undefined) update.tag = changed.tag = data.tag ?? null
    if (data.condition !== undefined) update.condition = changed.condition = data.condition
    if (data.notes !== undefined) update.notes = changed.notes = data.notes ?? null
    if (data.isActive !== undefined) update.isActive = changed.isActive = data.isActive

    // Callers 404 on a missing unit before getting here, so this is a guard
    // rather than a path: without it the audit entry would have no item to
    // attach to.
    const before = await getUnitById(unitId)
    if (!before) throw new Error('Unit not found')

    await db.transaction().execute(async (txn) => {
      await txn
        .updateTable('inventory.itemUnits')
        .set(update)
        .where('unitId', '=', unitId)
        .execute()

      const previous = before as unknown as Record<string, Json | undefined>
      const oldValues: Record<string, Json> = {}
      for (const key of Object.keys(changed)) {
        oldValues[key] = previous[key] ?? null
      }

      await writeAuditLog(txn, before.itemId, user.memberId, 'UNIT_UPDATED', oldValues, {
        unitId,
        ...changed,
      })
    })

    return getUnitById(unitId) as Promise<ItemUnit>
  }

  const unitId = generateShortId()
  await db.transaction().execute(async (txn) => {
    await txn
      .insertInto('inventory.itemUnits')
      .values({
        unitId,
        itemId: data.itemId,
        tag: data.tag ?? null,
        condition: data.condition ?? 'UNKNOWN',
        notes: data.notes ?? null,
        isActive: data.isActive ?? true,
        createdBy: user.memberId,
        updatedBy: user.memberId,
      })
      .execute()

    await writeAuditLog(txn, data.itemId, user.memberId, 'UNIT_CREATED', null, {
      unitId,
      tag: data.tag ?? null,
    })
  })

  return getUnitById(unitId) as Promise<ItemUnit>
}

/**
 * Move a unit to a new status, recording the move in the item's audit log.
 *
 * The status write and its log entry commit together, so the history can't
 * develop a gap. Accepts an `Executor` so a caller that is already inside a
 * transaction — the loan checkout/return flows of #1140 — can make this part of
 * it rather than opening a second one.
 *
 * Returns `undefined` when no such unit exists.
 */
export const transitionUnitStatus = async (
  unitId: string,
  toStatus: ItemUnitStatus,
  notes: string | null | undefined,
  user: JWTUser,
  executor?: Executor,
): Promise<ItemUnit | undefined> => {
  const run = async (txn: Executor): Promise<ItemUnit | undefined> => {
    // The prior status is read inside the transaction, so the audit entry says
    // what the move actually was rather than guessing at the "from" side.
    const before = await txn
      .selectFrom('inventory.itemUnits')
      .select(['itemId', 'status'])
      .where('unitId', '=', unitId)
      .executeTakeFirst()

    if (!before) return undefined

    const updated = await txn
      .updateTable('inventory.itemUnits')
      .set({ status: toStatus, ...auditUpdate(user) })
      .where('unitId', '=', unitId)
      .returningAll()
      .executeTakeFirst()

    if (!updated) return undefined

    await writeAuditLog(
      txn,
      before.itemId,
      user.memberId,
      'UNIT_STATUS_CHANGE',
      { unitId, status: before.status },
      { unitId, status: toStatus },
      notes ?? null,
    )

    return mapRow(updated)
  }

  return executor ? run(executor) : db.transaction().execute(run)
}
