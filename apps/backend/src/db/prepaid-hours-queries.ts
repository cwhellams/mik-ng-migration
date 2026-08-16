import { camelDb } from './connection.ts'
import { sql, type Updateable } from 'kysely'
import type { Json, PrepaidPackages, ShopProducts } from './schema.camel.d.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  PrepaidPackage,
  PrepaidPackageUpsert,
  MemberPackage,
  UsageLog,
  UnbilledTimeByAircraft,
} from '@mik/contracts/prepaid-hours'
import { FlightLogStatus } from '@mik/contracts/flight-log'
import { ProductTypeEnum } from '@mik/contracts/shop'
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
  const products = await camelDb
    .selectFrom('shop.products')
    .select([
      'productId',
      'name',
      'description',
      'simplbooksItemId',
      'stockQuantity',
      'vatPercent',
      'lowStockThreshold',
    ])
    .where('productId', 'in', productIds)
    .execute()
  return new Map(
    products.map((p) => [
      p.productId,
      {
        name: p.name as unknown as Localised,
        description: p.description as unknown as Localised | null,
        simplbooksItemId: p.simplbooksItemId,
        stockQuantity: Number(p.stockQuantity),
        vatPercent: Number(p.vatPercent),
        lowStockThreshold: p.lowStockThreshold == null ? null : Number(p.lowStockThreshold),
      },
    ]),
  )
}

function mapPackage(r: Record<string, unknown>, product?: ProductData): PrepaidPackage {
  return {
    productId: r.productId as string,
    nameEn: product?.name.en,
    nameFi: product?.name.fi,
    nameSv: product?.name.sv,
    descriptionEn: product?.description?.en,
    descriptionFi: product?.description?.fi,
    descriptionSv: product?.description?.sv,
    aircraftRegistration: r.aircraftRegistration as string,
    minutesPerPackage: Number(r.minutesPerPackage),
    perMinRate: Number(r.perMinRate),
    totalPrice: Number(r.totalPrice),
    totalPackagesAvailable: Number(r.totalPackagesAvailable),
    maxPerMember: r.maxPerMember == null ? null : Number(r.maxPerMember),
    soldCount: Number(r.soldCount),
    simplbooksItemId: product?.simplbooksItemId ?? null,
    vatPercent: product?.vatPercent ?? 0,
    lowStockThreshold: product?.lowStockThreshold ?? null,
    expiresAt: r.expiresAt as string,
    isActive: r.isActive as boolean,
    createdAt: (r.createdAt instanceof Date
      ? r.createdAt
      : new Date(r.createdAt as string)
    ).toISOString(),
    createdBy: r.createdBy as string,
    updatedAt: (r.updatedAt instanceof Date
      ? r.updatedAt
      : new Date(r.updatedAt as string)
    ).toISOString(),
    updatedBy: r.updatedBy as string,
  }
}

export async function getPrepaidPackages(aircraftRegistration?: string): Promise<PrepaidPackage[]> {
  let q = camelDb.selectFrom('prepaid.packages').selectAll()
  if (aircraftRegistration) q = q.where('aircraftRegistration', '=', aircraftRegistration)
  const rows = await q.orderBy('expiresAt').execute()
  const productMap = await loadProductData(rows.map((r) => r.productId))
  return rows.map((r) =>
    mapPackage(r as unknown as Record<string, unknown>, productMap.get(r.productId)),
  )
}

export async function getPrepaidPackageById(id: string): Promise<PrepaidPackage | undefined> {
  const r = await camelDb
    .selectFrom('prepaid.packages')
    .selectAll()
    .where('productId', '=', id)
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
  await camelDb
    .insertInto('prepaid.packages')
    .values({
      productId: packageId,
      aircraftRegistration: data.aircraftRegistration,
      minutesPerPackage: data.minutesPerPackage,
      totalPackagesAvailable: data.totalPackagesAvailable,
      perMinRate: data.perMinRate,
      maxPerMember: data.maxPerMember ?? null,
      expiresAt: data.expiresAt,
      isActive: data.isActive ?? true,
      createdBy: user.memberId,
      updatedBy: user.memberId,
    })
    .execute()
  return getPrepaidPackageById(packageId) as Promise<PrepaidPackage>
}

export async function updatePrepaidPackage(
  id: string,
  data: Partial<PrepaidPackageUpsert>,
  user: JWTUser,
): Promise<PrepaidPackage> {
  // Updateable<> rather than Record<string, unknown>: an untyped patch object hides
  // un-migrated snake_case column names from the compiler.
  const update: Updateable<PrepaidPackages> = { updatedBy: user.memberId, updatedAt: new Date() }
  if (data.aircraftRegistration !== undefined)
    update.aircraftRegistration = data.aircraftRegistration
  if (data.minutesPerPackage !== undefined) update.minutesPerPackage = data.minutesPerPackage
  if (data.totalPackagesAvailable !== undefined)
    update.totalPackagesAvailable = data.totalPackagesAvailable
  if (data.perMinRate !== undefined) update.perMinRate = data.perMinRate
  if (data.maxPerMember !== undefined) update.maxPerMember = data.maxPerMember
  if (data.expiresAt !== undefined) update.expiresAt = data.expiresAt
  if (data.isActive !== undefined) update.isActive = data.isActive
  await camelDb.updateTable('prepaid.packages').set(update).where('productId', '=', id).execute()

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
    data.lowStockThreshold !== undefined ||
    data.isActive !== undefined
  if (hasProductUpdate) {
    const current = await getPrepaidPackageById(id)
    const productUpdate: Updateable<ShopProducts> = {
      updatedBy: user.memberId,
      updatedAt: new Date(),
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
    if (data.vatPercent !== undefined) productUpdate.vatPercent = data.vatPercent
    if (data.simplbooksItemId !== undefined) productUpdate.simplbooksItemId = data.simplbooksItemId
    if (data.totalPackagesAvailable !== undefined)
      productUpdate.stockQuantity = Math.max(
        0,
        data.totalPackagesAvailable - (current?.soldCount ?? 0),
      )
    if (data.maxPerMember !== undefined) productUpdate.maxOrderQuantity = data.maxPerMember
    if (data.minutesPerPackage !== undefined || data.perMinRate !== undefined) {
      const mins = data.minutesPerPackage ?? current?.minutesPerPackage ?? 0
      const rate = data.perMinRate ?? current?.perMinRate ?? 0
      productUpdate.price = rate * mins
    }
    if (data.lowStockThreshold !== undefined)
      productUpdate.lowStockThreshold = data.lowStockThreshold
    if (data.isActive !== undefined) productUpdate.isActive = data.isActive
    await camelDb
      .updateTable('shop.products')
      .set(productUpdate)
      .where('productId', '=', id)
      .execute()
  }
  return getPrepaidPackageById(id) as Promise<PrepaidPackage>
}

// ─────────────────────────────────────────────────────────────────────────────
// Member packages (owned instances)
// ─────────────────────────────────────────────────────────────────────────────

function mapMemberPackage(r: Record<string, unknown>): MemberPackage {
  const memberId = r.memberMemberId as string | undefined
  const firstName = r.memberFirstName as string | undefined
  const lastName = r.memberLastName as string | undefined
  const email = r.memberEmail as string | undefined

  return {
    memberPackageId: r.memberPackageId as number,
    memberId: r.memberId as string,
    productId: r.productId as string,
    orderId: r.orderId as string | null,
    totalMinutes: Number(r.totalMinutes),
    usedMinutes: Number(r.usedMinutes),
    remainingMinutes: Number(r.remainingMinutes),
    expiresAt: r.expiresAt as string,
    isExpired: r.isExpired as boolean,
    createdAt: (r.createdAt instanceof Date
      ? r.createdAt
      : new Date(r.createdAt as string)
    ).toISOString(),
    updatedAt: (r.updatedAt instanceof Date
      ? r.updatedAt
      : new Date(r.updatedAt as string)
    ).toISOString(),
    member:
      memberId && firstName && lastName && email
        ? {
            memberId,
            firstName,
            lastName,
            email,
            phoneNumber: (r.memberPhoneNumber as string | null) ?? null,
          }
        : undefined,
    package:
      r.packageAircraftRegistration != null
        ? {
            productId: r.productId as string,
            nameEn: (r.productName as { en?: string } | null)?.en,
            nameFi: (r.productName as { fi?: string } | null)?.fi,
            nameSv: (r.productName as { sv?: string } | null)?.sv,
            aircraftRegistration: r.packageAircraftRegistration as string,
            minutesPerPackage: Number(r.packageMinutesPerPackage),
            perMinRate: Number(r.packagePerMinRate),
            totalPrice: Number(r.packageTotalPrice),
            totalPackagesAvailable: 0,
            maxPerMember: r.packageMaxPerMember == null ? null : Number(r.packageMaxPerMember),
            soldCount: Number(r.packageSoldCount),
            simplbooksItemId: null,
            vatPercent: 0,
            expiresAt: r.packageExpiresAt as string,
            isActive: r.packageIsActive as boolean,
            createdAt: (r.packageCreatedAt instanceof Date
              ? r.packageCreatedAt
              : new Date(r.packageCreatedAt as string)
            ).toISOString(),
            createdBy: r.packageCreatedBy as string,
            updatedAt: (r.packageUpdatedAt instanceof Date
              ? r.packageUpdatedAt
              : new Date(r.packageUpdatedAt as string)
            ).toISOString(),
            updatedBy: r.packageUpdatedBy as string,
          }
        : undefined,
  }
}

export async function getMemberPackages(
  memberId?: string,
  productId?: string,
): Promise<MemberPackage[]> {
  let q = camelDb
    .selectFrom('prepaid.memberPackages as mp')
    .leftJoin('prepaid.packages as p', 'p.productId', 'mp.productId')
    .leftJoin('member.register as m', 'm.memberId', 'mp.memberId')
    .leftJoin('shop.products as sp', 'sp.productId', 'mp.productId')
    .selectAll('mp')
    .select([
      'm.memberId as memberMemberId',
      'm.firstName as memberFirstName',
      'm.lastName as memberLastName',
      'm.email as memberEmail',
      'm.phoneNumber as memberPhoneNumber',
      'p.aircraftRegistration as packageAircraftRegistration',
      'p.minutesPerPackage as packageMinutesPerPackage',
      'p.perMinRate as packagePerMinRate',
      'p.totalPrice as packageTotalPrice',
      'p.maxPerMember as packageMaxPerMember',
      'p.soldCount as packageSoldCount',
      'p.totalPackagesAvailable as packageTotalPackagesAvailable',
      'p.expiresAt as packageExpiresAt',
      'p.isActive as packageIsActive',
      'p.createdAt as packageCreatedAt',
      'p.createdBy as packageCreatedBy',
      'p.updatedAt as packageUpdatedAt',
      'p.updatedBy as packageUpdatedBy',
      'sp.name as productName',
    ])
  if (memberId) q = q.where('mp.memberId', '=', memberId)
  if (productId) q = q.where('mp.productId', '=', productId)
  const rows = await q.orderBy('mp.expiresAt').execute()
  const packages = rows.map(mapMemberPackage)
  return attachUnbilledMinutes(packages)
}

async function attachUnbilledMinutes(packages: MemberPackage[]): Promise<MemberPackage[]> {
  const memberIds = [...new Set(packages.map((p) => p.memberId))]
  const aircraftRegs = [
    ...new Set(
      packages.map((p) => p.package?.aircraftRegistration).filter((r): r is string => r != null),
    ),
  ]

  if (memberIds.length === 0 || aircraftRegs.length === 0) {
    return packages.map((p) => ({ ...p, unbilledMinutes: 0 }))
  }

  // Sum unbilled (billable but not yet billed) flight minutes per member+aircraft
  const unbilledRows = await camelDb
    .selectFrom('flight.logs')
    .select((eb) => [
      'billableMemberId',
      'aircraftRegistration',
      eb.cast<number>(eb.fn.sum('flightMins'), 'integer').as('totalMins'),
    ])
    .where('isBillableFlight', '=', true)
    .where('isBilled', '=', false)
    .where('status', '!=', FlightLogStatus.PAID)
    .where('billableMemberId', 'in', memberIds)
    .where('aircraftRegistration', 'in', aircraftRegs)
    .groupBy(['billableMemberId', 'aircraftRegistration'])
    .execute()

  const unbilledMap = new Map<string, number>()
  for (const row of unbilledRows) {
    unbilledMap.set(`${row.billableMemberId}__${row.aircraftRegistration}`, Number(row.totalMins))
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
      (p) => p.package?.aircraftRegistration === aircraft && p.memberId === pkg.memberId,
    )
    let remaining = unbilledMap.get(key) ?? 0
    for (const p of pkgsForGroup) {
      const allocated = Math.min(p.remainingMinutes, remaining)
      allocMap.set(p.memberPackageId, allocated)
      remaining -= allocated
    }
  }

  return packages.map((p) => ({ ...p, unbilledMinutes: allocMap.get(p.memberPackageId) ?? 0 }))
}

export async function getMemberPackageById(id: number): Promise<MemberPackage | undefined> {
  const r = await camelDb
    .selectFrom('prepaid.memberPackages')
    .selectAll()
    .where('memberPackageId', '=', id)
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
  const r = await camelDb
    .selectFrom('prepaid.memberPackages as mp')
    .innerJoin('prepaid.packages as p', 'p.productId', 'mp.productId')
    .selectAll('mp')
    .where('mp.memberId', '=', memberId)
    .where('mp.isExpired', '=', false)
    .where('mp.expiresAt', '>=', today)
    .where('mp.remainingMinutes', '>', 0)
    .where('p.aircraftRegistration', '=', aircraftRegistration)
    .orderBy('mp.expiresAt', 'asc')
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

  const result = await camelDb
    .insertInto('prepaid.memberPackages')
    .values({
      memberId: memberId,
      productId: productId,
      orderId: orderId,
      totalMinutes: totalMinutes,
      expiresAt: pkg.expiresAt,
    })
    .returning('memberPackageId')
    .executeTakeFirstOrThrow()

  // Increment sold_count on the package
  await camelDb
    .updateTable('prepaid.packages')
    .set((eb) => ({ soldCount: eb('soldCount', '+', 1) }))
    .where('productId', '=', productId)
    .execute()

  return getMemberPackageById(result.memberPackageId) as Promise<MemberPackage>
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

  await camelDb
    .updateTable('prepaid.memberPackages')
    .set({ usedMinutes: newUsed, isExpired: nowExpired, updatedAt: new Date() })
    .where('memberPackageId', '=', mp.memberPackageId)
    .execute()

  await camelDb
    .insertInto('prepaid.usageLog')
    .values({
      memberPackageId: mp.memberPackageId,
      flightId: flightId,
      minutesUsed: minutesFromPackage,
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
  const productIds = await camelDb
    .selectFrom('prepaid.packages')
    .select('productId')
    .where('aircraftRegistration', '=', aircraftRegistration)
    .execute()

  if (productIds.length === 0) return 0

  const ids = productIds.map((p) => p.productId)

  const result = await camelDb
    .updateTable('prepaid.memberPackages')
    .set((eb) => ({
      expiresAt: sql<string>`(expires_at + make_interval(days => ${sql.lit(daysToAdd)}))::date`,
      updatedAt: new Date(),
    }))
    .where('productId', 'in', ids)
    .where('isExpired', '=', false)
    .executeTakeFirst()

  // Also extend the package definitions themselves
  await camelDb
    .updateTable('prepaid.packages')
    .set((eb) => ({
      expiresAt: sql<string>`(expires_at + make_interval(days => ${sql.lit(daysToAdd)}))::date`,
      updatedAt: new Date(),
      updatedBy: user.memberId,
    }))
    .where('aircraftRegistration', '=', aircraftRegistration)
    .where('isActive', '=', true)
    .execute()

  return Number(result?.numUpdatedRows ?? 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage log
// ─────────────────────────────────────────────────────────────────────────────

export async function getUsageLog(memberPackageId: number): Promise<UsageLog[]> {
  const rows = await camelDb
    .selectFrom('prepaid.usageLog')
    .selectAll()
    .where('memberPackageId', '=', memberPackageId)
    .orderBy('appliedAt', 'desc')
    .execute()
  return rows.map((r) => ({
    usageId: r.usageId,
    memberPackageId: r.memberPackageId,
    flightId: r.flightId as string | null,
    minutesUsed: r.minutesUsed,
    appliedAt: (r.appliedAt instanceof Date
      ? r.appliedAt
      : new Date(r.appliedAt as string)
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
  const rows = await camelDb
    .selectFrom('flight.logs')
    .select((eb) => [
      'aircraftRegistration',
      eb.cast<number>(eb.fn.sum('flightMins'), 'integer').as('airborneMins'),
      eb.cast<number>(eb.fn.sum('blockMins'), 'integer').as('blockMinsSum'),
    ])
    .where('isBillableFlight', '=', true)
    .where('isBilled', '=', false)
    .where('status', '!=', FlightLogStatus.PAID)
    .where('billableMemberId', '=', memberId)
    .groupBy(['aircraftRegistration'])
    .orderBy('aircraftRegistration')
    .execute()

  return rows.map((row) => ({
    aircraftRegistration: row.aircraftRegistration,
    airborneMinutes: Number(row.airborneMins),
    blockMinutes: Number(row.blockMinsSum),
  }))
}
