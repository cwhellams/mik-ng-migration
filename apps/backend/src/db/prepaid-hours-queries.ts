import { db } from './connection.ts'
import { sql } from 'kysely'
import type { Json } from './schema.d.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  PrepaidPackage,
  PrepaidPackageUpsert,
  MemberPackage,
  UsageLog,
  UnbilledTimeByAircraft,
} from '../routes/prepaid-hours/models.ts'
import { ProductTypeEnum } from '../routes/shop/models.ts'
import { insertProduct } from './shop-queries.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Package definitions
// ─────────────────────────────────────────────────────────────────────────────

type Localised = { en: string; fi: string; sv: string }
const FLIGHT_PACKAGE_CATEGORY_ID = 'FLT_PKG'
const FLIGHT_PACKAGE_PRODUCT_TYPE = ProductTypeEnum.enum.FLIGHT_HOURS_PACKAGE

type ProductData = {
  name: Localised
  description: Localised | null
  simplbooksItemId: string | null
  stockQuantity: number
  vatPercent: number
  lowStockThreshold: number | null
}

async function loadProductData(productIds: string[]): Promise<Map<string, ProductData>> {
  if (productIds.length === 0) return new Map()
  const products = await db
    .selectFrom('shop.products')
    .select([
      'product_id',
      'name',
      'description',
      'simplbooks_item_id',
      'stock_quantity',
      'vat_percent',
      'low_stock_threshold',
    ])
    .where('product_id', 'in', productIds)
    .execute()
  return new Map(
    products.map(p => [
      p.product_id,
      {
        name: p.name as unknown as Localised,
        description: p.description as unknown as Localised | null,
        simplbooksItemId: p.simplbooks_item_id,
        stockQuantity: Number(p.stock_quantity),
        vatPercent: Number(p.vat_percent),
        lowStockThreshold: p.low_stock_threshold == null ? null : Number(p.low_stock_threshold),
      },
    ]),
  )
}

function mapPackage(r: Record<string, unknown>, product?: ProductData): PrepaidPackage {
  return {
    productId: r.product_id as string,
    nameEn: product?.name.en,
    nameFi: product?.name.fi,
    nameSv: product?.name.sv,
    descriptionEn: product?.description?.en,
    descriptionFi: product?.description?.fi,
    descriptionSv: product?.description?.sv,
    aircraftRegistration: r.aircraft_registration as string,
    minutesPerPackage: Number(r.minutes_per_package),
    perMinRate: Number(r.per_min_rate),
    totalPrice: Number(r.total_price),
    totalPackagesAvailable: product?.stockQuantity ?? 0,
    maxPerMember: r.max_per_member == null ? null : Number(r.max_per_member),
    soldCount: Number(r.sold_count),
    simplbooksItemId: product?.simplbooksItemId ?? null,
    vatPercent: product?.vatPercent ?? 0,
    lowStockThreshold: product?.lowStockThreshold ?? null,
    expiresAt: r.expires_at as string,
    isActive: r.is_active as boolean,
    createdAt: (r.created_at instanceof Date
      ? r.created_at
      : new Date(r.created_at as string)
    ).toISOString(),
    createdBy: r.created_by as string,
    updatedAt: (r.updated_at instanceof Date
      ? r.updated_at
      : new Date(r.updated_at as string)
    ).toISOString(),
    updatedBy: r.updated_by as string,
  }
}

export async function getPrepaidPackages(aircraftRegistration?: string): Promise<PrepaidPackage[]> {
  let q = db.selectFrom('prepaid.packages').selectAll()
  if (aircraftRegistration) q = q.where('aircraft_registration', '=', aircraftRegistration)
  const rows = await q.orderBy('expires_at').execute()
  const productMap = await loadProductData(rows.map(r => r.product_id))
  return rows.map(r =>
    mapPackage(r as unknown as Record<string, unknown>, productMap.get(r.product_id)),
  )
}

export async function getPrepaidPackageById(id: string): Promise<PrepaidPackage | undefined> {
  const r = await db
    .selectFrom('prepaid.packages')
    .selectAll()
    .where('product_id', '=', id)
    .executeTakeFirst()
  if (!r) return undefined
  const productMap = await loadProductData([id])
  return mapPackage(r as unknown as Record<string, unknown>, productMap.get(id))
}

export async function insertPrepaidPackage(
  data: PrepaidPackageUpsert,
  user: JWTUser,
): Promise<PrepaidPackage> {
  // Auto-create a shop product of type FLIGHT_HOURS_PACKAGE
  const product = await insertProduct(
    {
      categoryId: FLIGHT_PACKAGE_CATEGORY_ID,
      productType: FLIGHT_PACKAGE_PRODUCT_TYPE,
      name: { en: data.nameEn, fi: data.nameFi, sv: data.nameSv },
      description:
        data.descriptionEn != null || data.descriptionFi != null || data.descriptionSv != null
          ? {
              en: data.descriptionEn ?? '',
              fi: data.descriptionFi ?? '',
              sv: data.descriptionSv ?? '',
            }
          : undefined,
      price: data.perMinRate * data.minutesPerPackage,
      vatPercent: data.vatPercent ?? 0,
      stockQuantity: data.totalPackagesAvailable,
      maxOrderQuantity: data.maxPerMember ?? null,
      simplbooksItemId: data.simplbooksItemId ?? null,
      tags: [],
      isActive: data.isActive ?? true,
      isPublished: true,
    },
    user,
  )
  const packageId = data.packageId || product.productId
  await db
    .insertInto('prepaid.packages')
    .values({
      product_id: packageId,
      aircraft_registration: data.aircraftRegistration,
      minutes_per_package: data.minutesPerPackage,
      total_packages_available: data.totalPackagesAvailable,
      per_min_rate: data.perMinRate,
      max_per_member: data.maxPerMember ?? null,
      expires_at: data.expiresAt,
      is_active: data.isActive ?? true,
      created_by: user.memberId,
      updated_by: user.memberId,
    })
    .execute()
  return getPrepaidPackageById(packageId) as Promise<PrepaidPackage>
}

export async function updatePrepaidPackage(
  id: string,
  data: Partial<PrepaidPackageUpsert>,
  user: JWTUser,
): Promise<PrepaidPackage> {
  const update: Record<string, unknown> = { updated_by: user.memberId, updated_at: new Date() }
  if (data.aircraftRegistration !== undefined)
    update.aircraft_registration = data.aircraftRegistration
  if (data.minutesPerPackage !== undefined) update.minutes_per_package = data.minutesPerPackage
  if (data.totalPackagesAvailable !== undefined)
    update.total_packages_available = data.totalPackagesAvailable
  if (data.perMinRate !== undefined) update.per_min_rate = data.perMinRate
  if (data.maxPerMember !== undefined) update.max_per_member = data.maxPerMember
  if (data.expiresAt !== undefined) update.expires_at = data.expiresAt
  if (data.isActive !== undefined) update.is_active = data.isActive
  await db.updateTable('prepaid.packages').set(update).where('product_id', '=', id).execute()

  // Sync all product-level fields to shop.products
  const hasProductUpdate =
    data.nameEn !== undefined ||
    data.nameFi !== undefined ||
    data.nameSv !== undefined ||
    data.descriptionEn !== undefined ||
    data.descriptionFi !== undefined ||
    data.descriptionSv !== undefined ||
    data.vatPercent !== undefined ||
    data.simplbooksItemId !== undefined ||
    data.totalPackagesAvailable !== undefined ||
    data.maxPerMember !== undefined ||
    data.minutesPerPackage !== undefined ||
    data.perMinRate !== undefined ||
    data.lowStockThreshold !== undefined
  if (hasProductUpdate) {
    const current = await getPrepaidPackageById(id)
    const productUpdate: Record<string, unknown> = {
      updated_by: user.memberId,
      updated_at: new Date(),
    }
    if (data.nameEn !== undefined || data.nameFi !== undefined || data.nameSv !== undefined) {
      productUpdate.name = {
        en: data.nameEn ?? current?.nameEn ?? '',
        fi: data.nameFi ?? current?.nameFi ?? '',
        sv: data.nameSv ?? current?.nameSv ?? '',
      } as unknown as Json
    }
    if (
      data.descriptionEn !== undefined ||
      data.descriptionFi !== undefined ||
      data.descriptionSv !== undefined
    ) {
      productUpdate.description = {
        en: data.descriptionEn ?? current?.descriptionEn ?? '',
        fi: data.descriptionFi ?? current?.descriptionFi ?? '',
        sv: data.descriptionSv ?? current?.descriptionSv ?? '',
      } as unknown as Json
    }
    if (data.vatPercent !== undefined) productUpdate.vat_percent = data.vatPercent
    if (data.simplbooksItemId !== undefined)
      productUpdate.simplbooks_item_id = data.simplbooksItemId
    if (data.totalPackagesAvailable !== undefined)
      productUpdate.stock_quantity = data.totalPackagesAvailable
    if (data.maxPerMember !== undefined) productUpdate.max_order_quantity = data.maxPerMember
    if (data.minutesPerPackage !== undefined || data.perMinRate !== undefined) {
      const mins = data.minutesPerPackage ?? current?.minutesPerPackage ?? 0
      const rate = data.perMinRate ?? current?.perMinRate ?? 0
      productUpdate.price = rate * mins
    }
    if (data.lowStockThreshold !== undefined)
      productUpdate.low_stock_threshold = data.lowStockThreshold
    await db.updateTable('shop.products').set(productUpdate).where('product_id', '=', id).execute()
  }
  return getPrepaidPackageById(id) as Promise<PrepaidPackage>
}

// ─────────────────────────────────────────────────────────────────────────────
// Member packages (owned instances)
// ─────────────────────────────────────────────────────────────────────────────

function mapMemberPackage(r: Record<string, unknown>): MemberPackage {
  const memberId = r.member_member_id as string | undefined
  const firstName = r.member_first_name as string | undefined
  const lastName = r.member_last_name as string | undefined
  const email = r.member_email as string | undefined

  return {
    memberPackageId: r.member_package_id as number,
    memberId: r.member_id as string,
    productId: r.product_id as string,
    orderId: r.order_id as string | null,
    totalMinutes: Number(r.total_minutes),
    usedMinutes: Number(r.used_minutes),
    remainingMinutes: Number(r.remaining_minutes),
    expiresAt: r.expires_at as string,
    isExpired: r.is_expired as boolean,
    createdAt: (r.created_at instanceof Date
      ? r.created_at
      : new Date(r.created_at as string)
    ).toISOString(),
    updatedAt: (r.updated_at instanceof Date
      ? r.updated_at
      : new Date(r.updated_at as string)
    ).toISOString(),
    member:
      memberId && firstName && lastName && email
        ? {
            memberId,
            firstName,
            lastName,
            email,
            phoneNumber: (r.member_phone_number as string | null) ?? null,
          }
        : undefined,
    package:
      r.package_aircraft_registration != null
        ? {
            productId: r.product_id as string,
            nameEn: (r.product_name as { en?: string } | null)?.en,
            nameFi: (r.product_name as { fi?: string } | null)?.fi,
            nameSv: (r.product_name as { sv?: string } | null)?.sv,
            aircraftRegistration: r.package_aircraft_registration as string,
            minutesPerPackage: Number(r.package_minutes_per_package),
            perMinRate: Number(r.package_per_min_rate),
            totalPrice: Number(r.package_total_price),
            totalPackagesAvailable: 0,
            maxPerMember:
              r.package_max_per_member == null ? null : Number(r.package_max_per_member),
            soldCount: Number(r.package_sold_count),
            simplbooksItemId: null,
            vatPercent: 0,
            expiresAt: r.package_expires_at as string,
            isActive: r.package_is_active as boolean,
            createdAt: (r.package_created_at instanceof Date
              ? r.package_created_at
              : new Date(r.package_created_at as string)
            ).toISOString(),
            createdBy: r.package_created_by as string,
            updatedAt: (r.package_updated_at instanceof Date
              ? r.package_updated_at
              : new Date(r.package_updated_at as string)
            ).toISOString(),
            updatedBy: r.package_updated_by as string,
          }
        : undefined,
  }
}

export async function getMemberPackages(
  memberId?: string,
  productId?: string,
): Promise<MemberPackage[]> {
  let q = db
    .selectFrom('prepaid.member_packages as mp')
    .leftJoin('prepaid.packages as p', 'p.product_id', 'mp.product_id')
    .leftJoin('member.register as m', 'm.member_id', 'mp.member_id')
    .leftJoin('shop.products as sp', 'sp.product_id', 'mp.product_id')
    .selectAll('mp')
    .select([
      'm.member_id as member_member_id',
      'm.first_name as member_first_name',
      'm.last_name as member_last_name',
      'm.email as member_email',
      'm.phone_number as member_phone_number',
      'p.aircraft_registration as package_aircraft_registration',
      'p.minutes_per_package as package_minutes_per_package',
      'p.per_min_rate as package_per_min_rate',
      'p.total_price as package_total_price',
      'p.max_per_member as package_max_per_member',
      'p.sold_count as package_sold_count',
      'p.total_packages_available as package_total_packages_available',
      'p.expires_at as package_expires_at',
      'p.is_active as package_is_active',
      'p.created_at as package_created_at',
      'p.created_by as package_created_by',
      'p.updated_at as package_updated_at',
      'p.updated_by as package_updated_by',
      'sp.name as product_name',
    ])
  if (memberId) q = q.where('mp.member_id', '=', memberId)
  if (productId) q = q.where('mp.product_id', '=', productId)
  const rows = await q.orderBy('mp.expires_at').execute()
  const packages = rows.map(mapMemberPackage)
  return attachUnbilledMinutes(packages)
}

async function attachUnbilledMinutes(packages: MemberPackage[]): Promise<MemberPackage[]> {
  const memberIds = [...new Set(packages.map(p => p.memberId))]
  const aircraftRegs = [
    ...new Set(
      packages.map(p => p.package?.aircraftRegistration).filter((r): r is string => r != null),
    ),
  ]

  if (memberIds.length === 0 || aircraftRegs.length === 0) {
    return packages.map(p => ({ ...p, unbilledMinutes: 0 }))
  }

  // Sum unbilled (billable but not yet billed) flight minutes per member+aircraft
  const unbilledRows = await db
    .selectFrom('flight.logs' as any)
    .select((eb: any) => [
      'billable_member_id',
      'aircraft_registration',
      eb.cast(eb.fn.sum('flight_mins'), 'integer').as('total_mins'),
    ])
    .where('is_billable_flight' as any, '=', true)
    .where('is_billed' as any, '=', false)
    .where('billable_member_id' as any, 'in', memberIds)
    .where('aircraft_registration' as any, 'in', aircraftRegs)
    .groupBy(['billable_member_id', 'aircraft_registration'] as any)
    .execute()

  const unbilledMap = new Map<string, number>()
  for (const row of unbilledRows as any[]) {
    unbilledMap.set(
      `${row.billable_member_id}__${row.aircraft_registration}`,
      Number(row.total_mins),
    )
  }

  // Allocate unbilled minutes to packages oldest-first (packages already sorted by expires_at ASC)
  const allocMap = new Map<number, number>()
  const processedKeys = new Set<string>()

  for (const pkg of packages) {
    const aircraft = pkg.package?.aircraftRegistration
    if (!aircraft) continue
    const key = `${pkg.memberId}__${aircraft}`
    if (processedKeys.has(key)) continue
    processedKeys.add(key)

    const pkgsForGroup = packages.filter(
      p => p.package?.aircraftRegistration === aircraft && p.memberId === pkg.memberId,
    )
    let remaining = unbilledMap.get(key) ?? 0
    for (const p of pkgsForGroup) {
      const allocated = Math.min(p.remainingMinutes, remaining)
      allocMap.set(p.memberPackageId, allocated)
      remaining -= allocated
    }
  }

  return packages.map(p => ({ ...p, unbilledMinutes: allocMap.get(p.memberPackageId) ?? 0 }))
}

export async function getMemberPackageById(id: number): Promise<MemberPackage | undefined> {
  const r = await db
    .selectFrom('prepaid.member_packages')
    .selectAll()
    .where('member_package_id', '=', id)
    .executeTakeFirst()
  return r ? mapMemberPackage(r) : undefined
}

/**
 * Returns the member's active (non-expired) package for a given aircraft
 * with the earliest expiry date (FIFO usage order).
 */
export async function getActivePackageForMemberAndAircraft(
  memberId: string,
  aircraftRegistration: string,
): Promise<MemberPackage | undefined> {
  const today = new Date().toISOString().split('T')[0]
  const r = await db
    .selectFrom('prepaid.member_packages as mp')
    .innerJoin('prepaid.packages as p', 'p.product_id', 'mp.product_id')
    .selectAll('mp')
    .where('mp.member_id', '=', memberId)
    .where('mp.is_expired', '=', false)
    .where('mp.expires_at', '>=', today)
    .where('mp.remaining_minutes', '>', 0)
    .where('p.aircraft_registration', '=', aircraftRegistration)
    .orderBy('mp.expires_at', 'asc')
    .executeTakeFirst()
  return r ? mapMemberPackage(r) : undefined
}

export async function createMemberPackage(
  memberId: string,
  productId: string,
  orderId: string,
): Promise<MemberPackage> {
  const pkg = await getPrepaidPackageById(productId)
  if (!pkg) throw new Error('Package not found')

  const totalMinutes = pkg.minutesPerPackage

  const result = await db
    .insertInto('prepaid.member_packages')
    .values({
      member_id: memberId,
      product_id: productId,
      order_id: orderId,
      total_minutes: totalMinutes,
      expires_at: pkg.expiresAt,
    })
    .returning('member_package_id')
    .executeTakeFirstOrThrow()

  // Increment sold_count on the package
  await db
    .updateTable('prepaid.packages')
    .set(eb => ({ sold_count: eb('sold_count', '+', 1) }))
    .where('product_id', '=', productId)
    .execute()

  return getMemberPackageById(result.member_package_id) as Promise<MemberPackage>
}

/**
 * Deduct minutes from a member's earliest-expiring package for a given aircraft.
 * Returns the minutes actually deducted from the package (may be less than
 * requestedMinutes if the package ran out, in which case the caller should
 * bill remaining minutes at the standard rate).
 */
export async function deductMinutesFromPackage(
  memberId: string,
  aircraftRegistration: string,
  requestedMinutes: number,
  flightId: string,
): Promise<{
  packageUsed: MemberPackage | null
  minutesFromPackage: number
  minutesAtStandardRate: number
}> {
  const mp = await getActivePackageForMemberAndAircraft(memberId, aircraftRegistration)

  if (!mp) {
    return { packageUsed: null, minutesFromPackage: 0, minutesAtStandardRate: requestedMinutes }
  }

  const minutesFromPackage = Math.min(requestedMinutes, mp.remainingMinutes)
  const minutesAtStandardRate = requestedMinutes - minutesFromPackage
  const newUsed = mp.usedMinutes + minutesFromPackage
  const nowExpired = newUsed >= mp.totalMinutes

  await db
    .updateTable('prepaid.member_packages')
    .set({ used_minutes: newUsed, is_expired: nowExpired, updated_at: new Date() })
    .where('member_package_id', '=', mp.memberPackageId)
    .execute()

  await db
    .insertInto('prepaid.usage_log')
    .values({
      member_package_id: mp.memberPackageId,
      flight_id: flightId,
      minutes_used: minutesFromPackage,
      note: `Flight ${flightId}`,
    })
    .execute()

  const updated = await getMemberPackageById(mp.memberPackageId)
  return { packageUsed: updated ?? null, minutesFromPackage, minutesAtStandardRate }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk extend expiry (AOG / rules extension)
// ─────────────────────────────────────────────────────────────────────────────

export async function extendExpiryForAircraft(
  aircraftRegistration: string,
  daysToAdd: number,
  user: JWTUser,
): Promise<number> {
  // Find all non-expired member_packages for the given aircraft
  const productIds = await db
    .selectFrom('prepaid.packages')
    .select('product_id')
    .where('aircraft_registration', '=', aircraftRegistration)
    .execute()

  if (productIds.length === 0) return 0

  const ids = productIds.map(p => p.product_id)

  const result = await db
    .updateTable('prepaid.member_packages')
    .set(eb => ({
      expires_at: sql<string>`(expires_at + make_interval(days => ${sql.lit(daysToAdd)}))::date`,
      updated_at: new Date(),
    }))
    .where('product_id', 'in', ids)
    .where('is_expired', '=', false)
    .executeTakeFirst()

  // Also extend the package definitions themselves
  await db
    .updateTable('prepaid.packages')
    .set(eb => ({
      expires_at: sql<string>`(expires_at + make_interval(days => ${sql.lit(daysToAdd)}))::date`,
      updated_at: new Date(),
      updated_by: user.memberId,
    }))
    .where('aircraft_registration', '=', aircraftRegistration)
    .where('is_active', '=', true)
    .execute()

  return Number(result?.numUpdatedRows ?? 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage log
// ─────────────────────────────────────────────────────────────────────────────

export async function getUsageLog(memberPackageId: number): Promise<UsageLog[]> {
  const rows = await db
    .selectFrom('prepaid.usage_log')
    .selectAll()
    .where('member_package_id', '=', memberPackageId)
    .orderBy('applied_at', 'desc')
    .execute()
  return rows.map(r => ({
    usageId: r.usage_id,
    memberPackageId: r.member_package_id,
    flightId: r.flight_id as string | null,
    minutesUsed: r.minutes_used,
    appliedAt: (r.applied_at instanceof Date
      ? r.applied_at
      : new Date(r.applied_at as string)
    ).toISOString(),
    note: r.note as string | null,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Unbilled time summary by aircraft
// ─────────────────────────────────────────────────────────────────────────────

export async function getUnbilledTimeByAircraft(
  memberId: string,
): Promise<UnbilledTimeByAircraft[]> {
  const rows = await db
    .selectFrom('flight.logs' as any)
    .select((eb: any) => [
      'aircraft_registration',
      eb.cast(eb.fn.sum('flight_mins'), 'integer').as('airborne_mins'),
      eb.cast(eb.fn.sum('block_mins'), 'integer').as('block_mins_sum'),
    ])
    .where('is_billable_flight' as any, '=', true)
    .where('is_billed' as any, '=', false)
    .where('billable_member_id' as any, '=', memberId)
    .groupBy(['aircraft_registration'] as any)
    .orderBy('aircraft_registration' as any)
    .execute()

  return (rows as any[]).map(row => ({
    aircraftRegistration: row.aircraft_registration as string,
    airborneMinutes: Number(row.airborne_mins),
    blockMinutes: Number(row.block_mins_sum),
  }))
}
