import { mapAudit } from './audit.ts'
import type { Updateable } from 'kysely'

import type { ShopCategories, ShopDiscountCodes, ShopProducts } from '@mik/db-schema/schema'
import { db, type DbRow } from './connection.ts'
import { generateShortId } from '../util/nanoId.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  Category,
  CategoryUpsert,
  Product,
  ProductUpsert,
  PropertyUpsert,
  DiscountCode,
  DiscountCodeUpsert,
  Cart,
  CartItemUpsert,
  Order,
  OrderCreate,
  OrderListResponse,
  ProductFilters,
  OrderFilters,
} from '@mik/contracts/shop'
import { sql } from 'kysely'
import type { Json, JsonValue } from '@mik/db-schema/schema'
import { insertOutboxItem } from './outbox-simplbooks-queries.ts'
import { SimplbooksEventType } from '../services/simplbooks/models.ts'
import { problem } from '../routes/response.ts'
import type { MIKLang } from '@mik/contracts/members'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────

export async function getCategories(activeOnly = true): Promise<Category[]> {
  let q = db.selectFrom('shop.categories').selectAll()
  if (activeOnly) q = q.where('isActive', '=', true)
  const rows = await q.orderBy('sortOrder').execute()
  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name as Category['name'],
    description: r.description as Category['description'],
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    ...mapAudit(r),
  }))
}

export async function getCategoryById(id: string): Promise<Category | undefined> {
  const r = await db
    .selectFrom('shop.categories')
    .selectAll()
    .where('categoryId', '=', id)
    .executeTakeFirst()
  if (!r) return undefined
  return {
    categoryId: r.categoryId,
    name: r.name as Category['name'],
    description: r.description as Category['description'],
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    ...mapAudit(r),
  }
}

export async function insertCategory(data: CategoryUpsert, user: JWTUser): Promise<Category> {
  const id = generateShortId()
  await db
    .insertInto('shop.categories')
    .values({
      categoryId: id,
      name: data.name,
      description: data.description ?? null,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
      createdBy: user.memberId,
      updatedBy: user.memberId,
    })
    .execute()
  return getCategoryById(id) as Promise<Category>
}

export async function updateCategory(
  id: string,
  data: Partial<CategoryUpsert>,
  user: JWTUser,
): Promise<Category> {
  const update: Updateable<ShopCategories> = {
    updatedBy: user.memberId,
    updatedAt: new Date(),
  }
  if (data.name !== undefined) update.name = data.name as JsonValue
  if (data.description !== undefined) update.description = data.description as JsonValue
  if (data.isActive !== undefined) update.isActive = data.isActive
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder
  await db.updateTable('shop.categories').set(update).where('categoryId', '=', id).execute()
  return getCategoryById(id) as Promise<Category>
}

export async function deleteCategory(id: string): Promise<void> {
  await db.deleteFrom('shop.categories').where('categoryId', '=', id).execute()
}

// ─────────────────────────────────────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────────────────────────────────────

export async function getProducts(filters?: ProductFilters): Promise<Product[]> {
  let q = db.selectFrom('shop.products').selectAll()
  if (filters?.categoryId) q = q.where('categoryId', '=', filters.categoryId)
  if (filters?.published !== undefined) q = q.where('isPublished', '=', filters.published)
  if (filters?.active !== undefined) q = q.where('isActive', '=', filters.active)
  if (filters?.tag)
    q = q.where((eb) => eb(sql`${eb.ref('tags')}`, '@>', sql`ARRAY[${filters.tag}]::TEXT[]`))
  if (filters?.search) {
    const term = `%${filters.search}%`
    q = q.where((eb) =>
      eb.or([
        eb(sql`${eb.ref('name')}::text`, 'like', term),
        eb(sql`${eb.ref('description')}::text`, 'like', term),
      ]),
    )
  }
  const rows = await q.orderBy('name').execute()
  const products = rows.map(mapProduct)
  await fillAircraftImages(products)
  await fillFlightPackageStock(products)
  await fillProductOrderFlags(products)
  return products
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const r = await db
    .selectFrom('shop.products')
    .selectAll()
    .where('productId', '=', id)
    .executeTakeFirst()
  if (!r) return undefined
  const product = mapProduct(r)
  product.properties = await getProductProperties(id)
  await fillAircraftImages([product])
  await fillFlightPackageStock([product])
  await fillProductOrderFlags([product])
  return product
}

async function fillProductOrderFlags(products: Product[]): Promise<void> {
  if (products.length === 0) return

  const productIds = products.map((product) => product.productId)
  const rows = await db
    .selectFrom('shop.orderItems')
    .select('productId')
    .where('productId', 'in', productIds)
    .groupBy('productId')
    .execute()

  const orderedProductIds = new Set(rows.map((row) => row.productId))
  for (const product of products) {
    product.hasOrders = orderedProductIds.has(product.productId)
  }
}

/** Recompute stockQuantity for flight packages from prepaid.packages (source of truth). */
async function fillFlightPackageStock(products: Product[]): Promise<void> {
  const pkgProducts = products.filter((p) => p.productType === 'FLIGHT_HOURS_PACKAGE')
  if (pkgProducts.length === 0) return
  const ids = pkgProducts.map((p) => p.productId)
  const pkgs = await db
    .selectFrom('prepaid.packages')
    .select(['productId', 'totalPackagesAvailable', 'soldCount'])
    .where('productId', 'in', ids)
    .execute()
  const stockByProductId = new Map(
    pkgs.map((p) => [p.productId, Math.max(0, p.totalPackagesAvailable - p.soldCount)]),
  )
  for (const product of pkgProducts) {
    const remaining = stockByProductId.get(product.productId)
    if (remaining !== undefined) product.stockQuantity = remaining
  }
}

/** For FLIGHT_HOURS_PACKAGE products with no imageUrl, populate it from the linked aircraft. */
async function fillAircraftImages(products: Product[]): Promise<void> {
  const pkgProducts = products.filter(
    (p) => p.productType === 'FLIGHT_HOURS_PACKAGE' && !p.imageUrl,
  )
  if (pkgProducts.length === 0) return
  const ids = pkgProducts.map((p) => p.productId)
  const pkgs = await db
    .selectFrom('prepaid.packages')
    .select(['productId', 'aircraftRegistration'])
    .where('productId', 'in', ids)
    .execute()
  const regByProductId = new Map(pkgs.map((p) => [p.productId, p.aircraftRegistration]))
  const registrations = [...new Set(pkgs.map((p) => p.aircraftRegistration))]
  if (registrations.length === 0) return
  const aircrafts = await db
    .selectFrom('flight.aircraft')
    .select(['registration', 'imageUrl'])
    .where('registration', 'in', registrations)
    .execute()
  const imgByRegistration = new Map(aircrafts.map((a) => [a.registration, a.imageUrl]))
  for (const product of pkgProducts) {
    const reg = regByProductId.get(product.productId)
    if (reg) product.imageUrl = imgByRegistration.get(reg) ?? null
  }
}

function mapProduct(r: DbRow<'shop.products'>): Product {
  return {
    productId: r.productId,
    categoryId: r.categoryId,
    simplbooksItemId: r.simplbooksItemId,
    productType: r.productType as Product['productType'],
    name: r.name as Product['name'],
    description: r.description as Product['description'],
    price: Number(r.price),
    vatPercent: Number(r.vatPercent),
    stockQuantity: Number(r.stockQuantity),
    lowStockThreshold: r.lowStockThreshold != null ? Number(r.lowStockThreshold) : null,
    maxOrderQuantity: r.maxOrderQuantity != null ? Number(r.maxOrderQuantity) : null,
    isActive: r.isActive,
    isPublished: r.isPublished,
    tags: r.tags as string[],
    metadata: r.metadata as Record<string, unknown> | null,
    imageUrl: r.imageUrl,
    hasOrders: false,
    ...mapAudit(r),
  }
}

export async function insertProduct(data: ProductUpsert, user: JWTUser): Promise<Product> {
  const id = generateShortId()
  await db
    .insertInto('shop.products')
    .values({
      productId: id,
      categoryId: data.categoryId,
      simplbooksItemId: data.simplbooksItemId ?? null,
      productType: data.productType ?? 'STANDARD',
      name: data.name,
      description: data.description ?? null,
      price: data.price,
      vatPercent: data.vatPercent ?? 24,
      stockQuantity: data.stockQuantity ?? 0,
      lowStockThreshold: data.lowStockThreshold ?? null,
      maxOrderQuantity: data.maxOrderQuantity ?? null,
      isActive: data.isActive ?? true,
      isPublished: data.isPublished ?? false,
      tags: data.tags ?? [],
      // The contract types metadata as Record<string, unknown>, so its values are not
      // provably JSON. This is the boundary where that assumption is made.
      metadata: (data.metadata as Json | undefined) ?? null,
      imageUrl: data.imageUrl ?? null,
      createdBy: user.memberId,
      updatedBy: user.memberId,
    })
    .execute()
  return getProductById(id) as Promise<Product>
}

export async function updateProduct(
  id: string,
  data: Partial<ProductUpsert>,
  user: JWTUser,
): Promise<Product> {
  const update: Updateable<ShopProducts> = {
    updatedBy: user.memberId,
    updatedAt: new Date(),
  }
  if (data.categoryId !== undefined) update.categoryId = data.categoryId
  if (data.simplbooksItemId !== undefined) update.simplbooksItemId = data.simplbooksItemId
  if (data.productType !== undefined) update.productType = data.productType
  if (data.name !== undefined) update.name = data.name as JsonValue
  if (data.description !== undefined) update.description = data.description as JsonValue
  if (data.price !== undefined) update.price = data.price
  if (data.vatPercent !== undefined) update.vatPercent = data.vatPercent
  if (data.stockQuantity !== undefined) update.stockQuantity = data.stockQuantity
  if (data.lowStockThreshold !== undefined) update.lowStockThreshold = data.lowStockThreshold
  if (data.maxOrderQuantity !== undefined) update.maxOrderQuantity = data.maxOrderQuantity
  if (data.isActive !== undefined) update.isActive = data.isActive
  if (data.isPublished !== undefined) update.isPublished = data.isPublished
  if (data.tags !== undefined) update.tags = data.tags
  if (data.metadata !== undefined) update.metadata = data.metadata as JsonValue
  if (data.imageUrl !== undefined) update.imageUrl = data.imageUrl
  await db.updateTable('shop.products').set(update).where('productId', '=', id).execute()
  return getProductById(id) as Promise<Product>
}

export async function deleteProduct(id: string): Promise<void> {
  await db.deleteFrom('shop.products').where('productId', '=', id).execute()
}

export async function hasProductOrders(productId: string): Promise<boolean> {
  const row = await db
    .selectFrom('shop.orderItems')
    .select((eb) => [eb.fn.countAll<number>().as('count')])
    .where('productId', '=', productId)
    .executeTakeFirst()

  return Number(row?.count ?? 0) > 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Product properties & options
// ─────────────────────────────────────────────────────────────────────────────

export async function getProductProperties(productId: string) {
  const props = await db
    .selectFrom('shop.productProperties')
    .selectAll()
    .where('productId', '=', productId)
    .orderBy('sortOrder')
    .execute()

  if (props.length === 0) return []

  const opts = await db
    .selectFrom('shop.productPropertyOptions')
    .selectAll()
    .where(
      'propertyId',
      'in',
      props.map((p) => p.propertyId),
    )
    .orderBy('sortOrder')
    .execute()

  return props.map((p) => ({
    propertyId: p.propertyId,
    productId: p.productId,
    name: p.name as Product['name'],
    isRequired: p.isRequired,
    sortOrder: p.sortOrder,
    options: opts
      .filter((o) => o.propertyId === p.propertyId)
      .map((o) => ({
        optionId: o.optionId,
        propertyId: o.propertyId,
        value: o.value as Product['name'],
        sortOrder: o.sortOrder,
        isActive: o.isActive,
        stockQuantity: o.stockQuantity,
      })),
  }))
}

export async function upsertProductProperty(
  productId: string,
  data: PropertyUpsert,
): Promise<void> {
  let propertyId: number

  if (data.propertyId) {
    await db
      .updateTable('shop.productProperties')
      .set({
        name: data.name,
        isRequired: data.isRequired,
        sortOrder: data.sortOrder,
      })
      .where('propertyId', '=', data.propertyId)
      .execute()
    propertyId = data.propertyId
  } else {
    const result = await db
      .insertInto('shop.productProperties')
      .values({
        productId: productId,
        name: data.name,
        isRequired: data.isRequired,
        sortOrder: data.sortOrder,
      })
      .returning('propertyId')
      .executeTakeFirstOrThrow()
    propertyId = result.propertyId
  }

  for (const opt of data.options) {
    if (opt.optionId) {
      await db
        .updateTable('shop.productPropertyOptions')
        .set({
          value: opt.value,
          sortOrder: opt.sortOrder,
          isActive: opt.isActive,
          stockQuantity: opt.stockQuantity ?? null,
        })
        .where('optionId', '=', opt.optionId)
        .execute()
    } else {
      await db
        .insertInto('shop.productPropertyOptions')
        .values({
          propertyId: propertyId,
          value: opt.value,
          sortOrder: opt.sortOrder,
          isActive: opt.isActive,
          stockQuantity: opt.stockQuantity ?? null,
        })
        .execute()
    }
  }
}

function normalizeSelectedOptions(
  selectedOptions?: Record<string, number> | null,
): Record<string, number> {
  if (!selectedOptions) return {}
  return Object.fromEntries(
    Object.entries(selectedOptions)
      .filter(([, optionId]) => Number.isFinite(optionId))
      .map(([propertyId, optionId]) => [propertyId, Number(optionId)]),
  )
}

function selectedOptionsKey(selectedOptions?: Record<string, number> | null): string {
  const normalized = normalizeSelectedOptions(selectedOptions)
  return JSON.stringify(
    Object.entries(normalized)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([propertyId, optionId]) => [Number(propertyId), optionId]),
  )
}

async function validateSelectedOptionsStock(
  productId: string,
  quantity: number,
  selectedOptions?: Record<string, number> | null,
): Promise<void> {
  const properties = await getProductProperties(productId)
  const normalized = normalizeSelectedOptions(selectedOptions)

  for (const property of properties.filter((p) => p.isRequired)) {
    const selectedOptionId = normalized[String(property.propertyId)]
    if (!selectedOptionId) {
      throw new Error('Please select all required product options')
    }
  }

  for (const [propertyIdStr, selectedOptionId] of Object.entries(normalized)) {
    const propertyId = Number(propertyIdStr)
    const property = properties.find((p) => p.propertyId === propertyId)
    if (!property) throw new Error('Invalid product option selection')

    const option = property.options?.find((o) => o.optionId === selectedOptionId)
    if (!option || !option.isActive) throw new Error('Invalid product option selection')
    if (option.stockQuantity != null && quantity > option.stockQuantity) {
      throw new Error('Selected option does not have enough stock')
    }
  }
}

export async function deleteProductProperty(propertyId: number): Promise<void> {
  await db.deleteFrom('shop.productProperties').where('propertyId', '=', propertyId).execute()
}

// ─────────────────────────────────────────────────────────────────────────────
// Discount codes
// ─────────────────────────────────────────────────────────────────────────────

export async function getDiscountCodes(): Promise<DiscountCode[]> {
  const rows = await db.selectFrom('shop.discountCodes').selectAll().execute()
  const categoryMap = await getDiscountCodeCategoryMap(rows.map((row) => row.codeId))
  return rows.map((row) =>
    mapDiscountCode({ ...row, categoryIds: categoryMap.get(row.codeId) ?? [] }),
  )
}

export async function getDiscountCodeByCode(code: string): Promise<DiscountCode | undefined> {
  const row = await db
    .selectFrom('shop.discountCodes')
    .selectAll()
    .where('code', '=', code)
    .executeTakeFirst()

  if (!row) return undefined

  const categoryMap = await getDiscountCodeCategoryMap([row.codeId])
  return mapDiscountCode({ ...row, categoryIds: categoryMap.get(row.codeId) ?? [] })
}

async function getDiscountCodeById(id: number): Promise<DiscountCode | undefined> {
  const row = await db
    .selectFrom('shop.discountCodes')
    .selectAll()
    .where('codeId', '=', id)
    .executeTakeFirst()

  if (!row) return undefined

  const categoryMap = await getDiscountCodeCategoryMap([row.codeId])
  return mapDiscountCode({ ...row, categoryIds: categoryMap.get(row.codeId) ?? [] })
}

async function getDiscountCodeCategoryMap(codeIds: number[]): Promise<Map<number, string[]>> {
  if (!codeIds.length) return new Map()

  let rows: Array<{ codeId: number; categoryId: string }>
  try {
    rows = await db
      .selectFrom('shop.discountCodeCategories')
      .select(['codeId', 'categoryId'])
      .where('codeId', 'in', codeIds)
      .execute()
  } catch (error) {
    if (isMissingDiscountCodeCategoryTableError(error)) {
      await ensureDiscountCodeCategoryTable()
      rows = await db
        .selectFrom('shop.discountCodeCategories')
        .select(['codeId', 'categoryId'])
        .where('codeId', 'in', codeIds)
        .execute()
    } else {
      throw error
    }
  }

  const grouped = new Map<number, string[]>()
  for (const row of rows) {
    const current = grouped.get(row.codeId) ?? []
    current.push(row.categoryId)
    grouped.set(row.codeId, current)
  }
  return grouped
}

async function replaceDiscountCodeCategories(codeId: number, categoryIds: string[]): Promise<void> {
  try {
    await db.deleteFrom('shop.discountCodeCategories').where('codeId', '=', codeId).execute()
  } catch (error) {
    if (isMissingDiscountCodeCategoryTableError(error)) {
      await ensureDiscountCodeCategoryTable()
      await db.deleteFrom('shop.discountCodeCategories').where('codeId', '=', codeId).execute()
    } else {
      throw error
    }
  }

  const uniqueCategoryIds = [...new Set(categoryIds)]
  if (!uniqueCategoryIds.length) return

  await db
    .insertInto('shop.discountCodeCategories')
    .values(uniqueCategoryIds.map((categoryId) => ({ codeId: codeId, categoryId: categoryId })))
    .execute()
}

async function ensureDiscountCodeCategoryTable(): Promise<void> {
  await db.schema
    .createTable('shop.discountCodeCategories')
    .ifNotExists()
    .addColumn('code_id', 'integer', (col) => col.notNull())
    .addColumn('category_id', 'varchar(9)', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .addPrimaryKeyConstraint('pk_shop_discount_code_categories', ['code_id', 'category_id'])
    .addForeignKeyConstraint(
      'fk_shop_discount_code_categories_code_id',
      ['code_id'],
      'shop.discountCodes',
      ['code_id'],
      (cb) => cb.onDelete('cascade'),
    )
    .addForeignKeyConstraint(
      'fk_shop_discount_code_categories_category_id',
      ['category_id'],
      'shop.categories',
      ['category_id'],
    )
    .execute()
}

function isMissingDiscountCodeCategoryTableError(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false
  const candidate = error as { code?: string }
  return candidate.code === '42P01'
}

function isDiscountCodeApplicableToCart(code: DiscountCode, cart: Cart): boolean {
  if (!code.categoryIds.length) return true
  const allowed = new Set(code.categoryIds)
  return cart.items.some((item) => {
    const categoryId = item.product?.categoryId
    return !!categoryId && allowed.has(categoryId)
  })
}

// Takes the discount-code row plus an aggregated categoryIds column, so DbRow alone
// does not describe it.
function mapDiscountCode(r: Record<string, unknown>): DiscountCode {
  return {
    codeId: r.codeId as number,
    code: r.code as string,
    description: r.description as string | null,
    categoryIds: (r.categoryIds as string[] | undefined) ?? [],
    discountType: r.discountType as DiscountCode['discountType'],
    discountValue: Number(r.discountValue),
    minOrderAmount: r.minOrderAmount != null ? Number(r.minOrderAmount) : null,
    maxUses: r.maxUses != null ? Number(r.maxUses) : null,
    usesCount: Number(r.usesCount),
    validFrom: (r.validFrom instanceof Date
      ? r.validFrom
      : new Date(r.validFrom as string)
    ).toISOString(),
    validUntil:
      r.validUntil != null
        ? (r.validUntil instanceof Date
            ? r.validUntil
            : new Date(r.validUntil as string)
          ).toISOString()
        : null,
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

export async function insertDiscountCode(
  data: DiscountCodeUpsert,
  user: JWTUser,
): Promise<DiscountCode> {
  const result = await db
    .insertInto('shop.discountCodes')
    .values({
      code: data.code,
      description: data.description ?? null,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minOrderAmount: data.minOrderAmount ?? null,
      maxUses: data.maxUses ?? null,
      validFrom: data.validFrom,
      validUntil: data.validUntil ?? null,
      isActive: data.isActive ?? true,
      createdBy: user.memberId,
      updatedBy: user.memberId,
    })
    .returning('codeId')
    .executeTakeFirstOrThrow()

  await replaceDiscountCodeCategories(result.codeId, data.categoryIds ?? [])

  const discountCode = await getDiscountCodeById(result.codeId)
  if (!discountCode) throw new Error('Discount code not found after insert')
  return discountCode
}

export async function updateDiscountCode(
  id: number,
  data: Partial<DiscountCodeUpsert>,
  user: JWTUser,
): Promise<DiscountCode> {
  const update: Updateable<ShopDiscountCodes> = {
    updatedBy: user.memberId,
    updatedAt: new Date(),
  }
  if (data.code !== undefined) update.code = data.code
  if (data.description !== undefined) update.description = data.description
  if (data.discountType !== undefined) update.discountType = data.discountType
  if (data.discountValue !== undefined) update.discountValue = data.discountValue
  if (data.minOrderAmount !== undefined) update.minOrderAmount = data.minOrderAmount
  if (data.maxUses !== undefined) update.maxUses = data.maxUses
  if (data.validFrom !== undefined) update.validFrom = data.validFrom
  if (data.validUntil !== undefined) update.validUntil = data.validUntil
  if (data.isActive !== undefined) update.isActive = data.isActive
  await db.updateTable('shop.discountCodes').set(update).where('codeId', '=', id).execute()

  if (data.categoryIds !== undefined) {
    await replaceDiscountCodeCategories(id, data.categoryIds)
  }

  const discountCode = await getDiscountCodeById(id)
  if (!discountCode) throw new Error('Discount code not found after update')
  return discountCode
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart
// ─────────────────────────────────────────────────────────────────────────────

async function getOrCreateCart(memberId: string): Promise<string> {
  const existing = await db
    .selectFrom('shop.carts')
    .select('cartId')
    .where('memberId', '=', memberId)
    .executeTakeFirst()
  if (existing) return existing.cartId

  const cartId = generateShortId()
  await db.insertInto('shop.carts').values({ cartId: cartId, memberId: memberId }).execute()
  return cartId
}

export async function getCart(memberId: string): Promise<Cart> {
  const cartId = await getOrCreateCart(memberId)
  const cart = await db
    .selectFrom('shop.carts')
    .selectAll()
    .where('cartId', '=', cartId)
    .executeTakeFirstOrThrow()
  const items = await db
    .selectFrom('shop.cartItems')
    .selectAll()
    .where('cartId', '=', cartId)
    .orderBy('createdAt')
    .execute()

  const productIds = [...new Set(items.map((i) => i.productId))]
  const products = productIds.length
    ? await db
        .selectFrom('shop.products')
        .selectAll()
        .where('productId', 'in', productIds)
        .execute()
    : []

  return {
    cartId: cart.cartId,
    memberId: cart.memberId,
    discountCodeId: cart.discountCodeId,
    createdAt: cart.createdAt instanceof Date ? cart.createdAt.toISOString() : cart.createdAt,
    updatedAt: cart.updatedAt instanceof Date ? cart.updatedAt.toISOString() : cart.updatedAt,
    items: items.map((i) => ({
      cartItemId: i.cartItemId,
      cartId: i.cartId,
      productId: i.productId,
      quantity: i.quantity,
      selectedOptions: i.selectedOptions as Record<string, number> | null,
      createdAt: (i.createdAt instanceof Date
        ? i.createdAt
        : new Date(i.createdAt as string)
      ).toISOString(),
      updatedAt: (i.updatedAt instanceof Date
        ? i.updatedAt
        : new Date(i.updatedAt as string)
      ).toISOString(),
      product: products.find((p) => p.productId === i.productId)
        ? mapProduct(products.find((p) => p.productId === i.productId)!)
        : undefined,
    })),
  }
}

export async function addCartItem(memberId: string, data: CartItemUpsert): Promise<Cart> {
  const cartId = await getOrCreateCart(memberId)

  const selectedOptions = normalizeSelectedOptions(data.selectedOptions)

  // Check if same product and same selected options already in cart
  const existingRows = await db
    .selectFrom('shop.cartItems')
    .selectAll()
    .where('cartId', '=', cartId)
    .where('productId', '=', data.productId)
    .execute()

  const incomingKey = selectedOptionsKey(selectedOptions)
  const existing = existingRows.find(
    (row) =>
      selectedOptionsKey((row.selectedOptions as Record<string, number> | null) ?? null) ===
      incomingKey,
  )

  const newCartQty = (existing?.quantity ?? 0) + data.quantity

  await validateSelectedOptionsStock(data.productId, newCartQty, selectedOptions)

  // Enforce limits for this product
  const product = await getProductById(data.productId)
  if (!product) {
    return problem({ status: 404, detail: 'Product not found' })
  }
  if (product.stockQuantity <= 0) {
    return problem({ status: 409, detail: 'Product is out of stock' })
  }
  if (newCartQty > product.stockQuantity) {
    return problem({
      status: 409,
      detail: `Only ${product.stockQuantity} item(s) available in stock`,
    })
  }
  if (product?.maxOrderQuantity != null && newCartQty > product.maxOrderQuantity) {
    return problem({
      status: 409,
      detail: `Maximum quantity per order is ${product.maxOrderQuantity}`,
    })
  }

  // For flight hour packages, also enforce overall per-member limit
  if (product?.productType === 'FLIGHT_HOURS_PACKAGE' && product.maxOrderQuantity != null) {
    const row = await db
      .selectFrom('prepaid.memberPackages')
      .select((eb) => [eb.fn.countAll<number>().as('count')])
      .where('memberId', '=', memberId)
      .where('productId', '=', data.productId)
      .executeTakeFirst()
    const alreadyOwned = Number(row?.count ?? 0)
    if (alreadyOwned + newCartQty > product.maxOrderQuantity) {
      const remaining = Math.max(0, product.maxOrderQuantity - alreadyOwned)
      throw new Error(
        `You already own ${alreadyOwned} of this package (maximum ${product.maxOrderQuantity}). You may add at most ${remaining} more.`,
      )
    }
  }

  if (existing) {
    await db
      .updateTable('shop.cartItems')
      .set({ quantity: newCartQty, updatedAt: new Date() })
      .where('cartItemId', '=', existing.cartItemId)
      .execute()
  } else {
    await db
      .insertInto('shop.cartItems')
      .values({
        cartId: cartId,
        productId: data.productId,
        quantity: data.quantity,
        selectedOptions: selectedOptions ?? null,
      })
      .execute()
  }

  await db
    .updateTable('shop.carts')
    .set({ updatedAt: new Date() })
    .where('cartId', '=', cartId)
    .execute()
  return getCart(memberId)
}

export async function updateCartItem(
  memberId: string,
  cartItemId: number,
  quantity: number,
): Promise<Cart> {
  const cartId = await getOrCreateCart(memberId)
  if (quantity <= 0) {
    await db
      .deleteFrom('shop.cartItems')
      .where('cartItemId', '=', cartItemId)
      .where('cartId', '=', cartId)
      .execute()
  } else {
    // Enforce limits when increasing quantity
    const item = await db
      .selectFrom('shop.cartItems')
      .select(['productId', 'selectedOptions'])
      .where('cartItemId', '=', cartItemId)
      .where('cartId', '=', cartId)
      .executeTakeFirst()
    if (item) {
      await validateSelectedOptionsStock(
        item.productId,
        quantity,
        (item.selectedOptions as Record<string, number> | null) ?? null,
      )

      const product = await getProductById(item.productId)
      if (!product) {
        return problem({ status: 404, detail: 'Product not found' })
      }
      if (product.stockQuantity <= 0) {
        return problem({ status: 409, detail: 'Product is out of stock' })
      }
      if (quantity > product.stockQuantity) {
        return problem({
          status: 409,
          detail: `Only ${product.stockQuantity} item(s) available in stock`,
        })
      }
      if (product?.maxOrderQuantity != null && quantity > product.maxOrderQuantity) {
        return problem({
          status: 409,
          detail: `Maximum quantity per order is ${product.maxOrderQuantity}`,
        })
      }
      if (product?.productType === 'FLIGHT_HOURS_PACKAGE' && product.maxOrderQuantity != null) {
        const row = await db
          .selectFrom('prepaid.memberPackages')
          .select((eb) => [eb.fn.countAll<number>().as('count')])
          .where('memberId', '=', memberId)
          .where('productId', '=', item.productId)
          .executeTakeFirst()
        const alreadyOwned = Number(row?.count ?? 0)
        if (alreadyOwned + quantity > product.maxOrderQuantity) {
          const remaining = Math.max(0, product.maxOrderQuantity - alreadyOwned)
          throw new Error(
            `You already own ${alreadyOwned} of this package (maximum ${product.maxOrderQuantity}). You may add at most ${remaining} more.`,
          )
        }
      }
    }
    await db
      .updateTable('shop.cartItems')
      .set({ quantity, updatedAt: new Date() })
      .where('cartItemId', '=', cartItemId)
      .where('cartId', '=', cartId)
      .execute()
  }
  await db
    .updateTable('shop.carts')
    .set({ updatedAt: new Date() })
    .where('cartId', '=', cartId)
    .execute()
  return getCart(memberId)
}

export async function removeCartItem(memberId: string, cartItemId: number): Promise<Cart> {
  const cartId = await getOrCreateCart(memberId)
  await db
    .deleteFrom('shop.cartItems')
    .where('cartItemId', '=', cartItemId)
    .where('cartId', '=', cartId)
    .execute()
  await db
    .updateTable('shop.carts')
    .set({ updatedAt: new Date() })
    .where('cartId', '=', cartId)
    .execute()
  return getCart(memberId)
}

export async function clearCart(memberId: string): Promise<Cart> {
  const cartId = await getOrCreateCart(memberId)
  await db.deleteFrom('shop.cartItems').where('cartId', '=', cartId).execute()
  await db
    .updateTable('shop.carts')
    .set({ discountCodeId: null, updatedAt: new Date() })
    .where('cartId', '=', cartId)
    .execute()
  return getCart(memberId)
}

export async function applyDiscountToCart(
  memberId: string,
  discountCodeId: number | null,
): Promise<Cart> {
  const cartId = await getOrCreateCart(memberId)

  if (discountCodeId != null) {
    const [discountCode, cart] = await Promise.all([
      getDiscountCodeById(discountCodeId),
      getCart(memberId),
    ])
    if (!discountCode?.isActive) throw new Error('Invalid discount code')
    if (discountCode.validUntil && new Date(discountCode.validUntil) < new Date()) {
      throw new Error('Discount code has expired')
    }
    if (discountCode.maxUses != null && discountCode.usesCount >= discountCode.maxUses) {
      throw new Error('Discount code has reached maximum uses')
    }
    if (!isDiscountCodeApplicableToCart(discountCode, cart)) {
      throw new Error('Discount code is not applicable to products in your cart')
    }
  }

  await db
    .updateTable('shop.carts')
    .set({ discountCodeId: discountCodeId, updatedAt: new Date() })
    .where('cartId', '=', cartId)
    .execute()
  return getCart(memberId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Orders
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrders(filters?: OrderFilters): Promise<OrderListResponse> {
  const page = filters?.page ?? 1
  const pageSize = filters?.pageSize ?? 50
  const offset = (page - 1) * pageSize

  let dataQuery = db
    .selectFrom('shop.orders as o')
    .leftJoin('member.register as m', 'm.memberId', 'o.memberId')
    .selectAll('o')
    .select([
      'm.memberId as memberMemberId',
      'm.firstName as memberFirstName',
      'm.lastName as memberLastName',
      'm.email as memberEmail',
      'm.phoneNumber as memberPhoneNumber',
      // Carried so the order confirmation email can be written in the member's
      // own language without a second query — see ../templates/shopOrderEmails.ts.
      'm.langIso639 as memberLang',
    ])
  let countQuery = db
    .selectFrom('shop.orders as o')
    .select((eb) => [eb.fn.countAll<number>().as('count')])

  if (filters?.memberId) {
    dataQuery = dataQuery.where('o.memberId', '=', filters.memberId)
    countQuery = countQuery.where('o.memberId', '=', filters.memberId)
  }
  if (filters?.status) {
    dataQuery = dataQuery.where('o.status', '=', filters.status)
    countQuery = countQuery.where('o.status', '=', filters.status)
  }
  if (filters?.categoryId) {
    dataQuery = dataQuery.where((eb) =>
      eb.exists(
        eb
          .selectFrom('shop.orderItems as oi')
          .innerJoin('shop.products as p', 'p.productId', 'oi.productId')
          .select(sql`1`.as('one'))
          .whereRef('oi.orderId', '=', 'o.orderId')
          .where('p.categoryId', '=', filters.categoryId!),
      ),
    )
    countQuery = countQuery.where((eb) =>
      eb.exists(
        eb
          .selectFrom('shop.orderItems as oi')
          .innerJoin('shop.products as p', 'p.productId', 'oi.productId')
          .select(sql`1`.as('one'))
          .whereRef('oi.orderId', '=', 'o.orderId')
          .where('p.categoryId', '=', filters.categoryId!),
      ),
    )
  }

  if (filters?.dateRange) {
    const from = new Date()
    switch (filters.dateRange) {
      case '7d':
        from.setDate(from.getDate() - 7)
        break
      case '1m':
        from.setMonth(from.getMonth() - 1)
        break
      case '3m':
        from.setMonth(from.getMonth() - 3)
        break
      case '6m':
        from.setMonth(from.getMonth() - 6)
        break
      case '1y':
        from.setFullYear(from.getFullYear() - 1)
        break
    }
    dataQuery = dataQuery.where('o.createdAt', '>=', from)
    countQuery = countQuery.where('o.createdAt', '>=', from)
  }

  const [rows, totalRow] = await Promise.all([
    dataQuery.orderBy('o.createdAt', 'desc').offset(offset).limit(pageSize).execute(),
    countQuery.executeTakeFirst(),
  ])

  const total = Number(totalRow?.count ?? 0)

  return {
    items: rows.map(mapOrder),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  }
}

export async function getOrderById(id: string): Promise<Order | undefined> {
  const r = await db
    .selectFrom('shop.orders as o')
    .leftJoin('member.register as m', 'm.memberId', 'o.memberId')
    .selectAll('o')
    .select([
      'm.memberId as memberMemberId',
      'm.firstName as memberFirstName',
      'm.lastName as memberLastName',
      'm.email as memberEmail',
      'm.phoneNumber as memberPhoneNumber',
      // Carried so the order confirmation email can be written in the member's
      // own language without a second query — see ../templates/shopOrderEmails.ts.
      'm.langIso639 as memberLang',
    ])
    .where('o.orderId', '=', id)
    .executeTakeFirst()
  if (!r) return undefined
  const order = mapOrder(r)
  order.items = await db
    .selectFrom('shop.orderItems')
    .selectAll()
    .where('orderId', '=', id)
    .execute()
    .then((rows) =>
      rows.map((i) => ({
        orderItemId: i.orderItemId,
        orderId: i.orderId,
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        totalPrice: Number(i.totalPrice),
        selectedOptions: i.selectedOptions as Record<string, number> | null,
        productSnapshot: i.productSnapshot as Record<string, unknown>,
      })),
    )
  return order
}

function mapOrder(r: Record<string, unknown>): Order {
  const memberId = r.memberMemberId as string | undefined
  const firstName = r.memberFirstName as string | undefined
  const lastName = r.memberLastName as string | undefined
  const email = r.memberEmail as string | undefined
  const lang = r.memberLang as MIKLang | undefined

  return {
    orderId: r.orderId as string,
    memberId: r.memberId as string,
    status: r.status as Order['status'],
    totalAmount: Number(r.totalAmount),
    discountCodeId: r.discountCodeId as number | null,
    discountAmount: r.discountAmount != null ? Number(r.discountAmount) : null,
    invoiceId: r.invoiceId as string | null,
    notes: r.notes as string | null,
    member:
      memberId && firstName && lastName && email
        ? {
            memberId,
            firstName,
            lastName,
            email,
            phoneNumber: (r.memberPhoneNumber as string | null) ?? null,
            lang,
          }
        : undefined,
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

export async function createOrderFromCart(
  memberId: string,
  data: OrderCreate,
  user: JWTUser,
): Promise<Order> {
  const cart = await getCart(memberId)
  if (!cart.items.length) throw new Error('Cart is empty')

  // Final enforcement: max_order_quantity and per-member limit for flight packages
  for (const item of cart.items) {
    const product = item.product
    if (!product) continue
    if (product.maxOrderQuantity != null && item.quantity > product.maxOrderQuantity) {
      const name = (product.name as Record<string, string>)?.en ?? item.productId
      throw new Error(
        `"${name}": quantity exceeds the maximum of ${product.maxOrderQuantity} per order`,
      )
    }
    if (product.productType === 'FLIGHT_HOURS_PACKAGE' && product.maxOrderQuantity != null) {
      const row = await db
        .selectFrom('prepaid.memberPackages')
        .select((eb) => [eb.fn.countAll<number>().as('count')])
        .where('memberId', '=', memberId)
        .where('productId', '=', item.productId)
        .executeTakeFirst()
      const alreadyOwned = Number(row?.count ?? 0)
      if (alreadyOwned + item.quantity > product.maxOrderQuantity) {
        const name = (product.name as Record<string, string>)?.en ?? item.productId
        throw new Error(
          `"${name}": you already own ${alreadyOwned} of this package (maximum ${product.maxOrderQuantity})`,
        )
      }
    }
  }

  // Resolve discount
  let discountCodeId: number | null = null
  let discountAmount: number | null = null

  if (data.discountCode) {
    const dc = await getDiscountCodeByCode(data.discountCode)
    if (!dc || !dc.isActive) throw new Error('Invalid or expired discount code')
    if (dc.validUntil && new Date(dc.validUntil) < new Date())
      throw new Error('Discount code has expired')
    if (dc.maxUses != null && dc.usesCount >= dc.maxUses)
      throw new Error('Discount code has reached maximum uses')

    discountCodeId = dc.codeId
    const subtotal = cart.items.reduce((s, i) => s + (i.product?.price ?? 0) * i.quantity, 0)
    if (dc.minOrderAmount != null && subtotal < dc.minOrderAmount)
      throw new Error(`Minimum order amount is ${dc.minOrderAmount}`)
    if (!isDiscountCodeApplicableToCart(dc, cart)) {
      throw new Error('Discount code is not applicable to products in your cart')
    }

    discountAmount =
      dc.discountType === 'percent'
        ? Math.round(((subtotal * dc.discountValue) / 100) * 100) / 100
        : Math.min(dc.discountValue, subtotal)
  } else if (cart.discountCodeId) {
    const dc = await getDiscountCodeById(cart.discountCodeId)
    if (!dc || !dc.isActive) throw new Error('Invalid or expired discount code')
    if (dc.validUntil && new Date(dc.validUntil) < new Date()) {
      throw new Error('Discount code has expired')
    }
    if (dc.maxUses != null && dc.usesCount >= dc.maxUses) {
      throw new Error('Discount code has reached maximum uses')
    }

    const subtotal = cart.items.reduce((s, i) => s + (i.product?.price ?? 0) * i.quantity, 0)
    if (dc.minOrderAmount != null && subtotal < dc.minOrderAmount) {
      throw new Error(`Minimum order amount is ${dc.minOrderAmount}`)
    }
    if (!isDiscountCodeApplicableToCart(dc, cart)) {
      throw new Error('Discount code is not applicable to products in your cart')
    }

    discountCodeId = dc.codeId
    discountAmount =
      dc.discountType === 'percent'
        ? Math.round(((subtotal * dc.discountValue) / 100) * 100) / 100
        : Math.min(dc.discountValue, subtotal)
  }

  // Build order items and compute total
  let totalAmount = 0
  const orderItems = cart.items.map((item) => {
    const unitPrice = item.product?.price ?? 0
    const totalPrice = unitPrice * item.quantity
    totalAmount += totalPrice
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: unitPrice,
      totalPrice: totalPrice,
      selectedOptions: item.selectedOptions ?? null,
      productSnapshot: {
        name: item.product?.name,
        description: item.product?.description,
        price: unitPrice,
        simplbooksItemId: item.product?.simplbooksItemId,
      },
    }
  })

  if (discountAmount) totalAmount -= discountAmount

  const orderId = generateShortId()
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('shop.orders')
      .values({
        orderId: orderId,
        memberId: memberId,
        status: 'PENDING',
        totalAmount: totalAmount,
        discountCodeId: discountCodeId,
        discountAmount: discountAmount,
        notes: data.notes ?? null,
        createdBy: user.memberId,
        updatedBy: user.memberId,
      })
      .execute()

    for (const item of orderItems) {
      const stockUpdateResult = await trx
        .updateTable('shop.products')
        .set((eb) => ({ stockQuantity: eb('stockQuantity', '-', item.quantity) }))
        .where('productId', '=', item.productId)
        .where('stockQuantity', '>=', item.quantity)
        .executeTakeFirst()

      if (!stockUpdateResult || stockUpdateResult.numUpdatedRows !== BigInt(1)) {
        const product = cart.items.find((ci) => ci.productId === item.productId)?.product
        const name = (product?.name as Record<string, string> | undefined)?.en ?? item.productId
        throw new Error(`"${name}": not enough stock available`)
      }

      await trx
        .insertInto('shop.orderItems')
        .values({ orderId: orderId, ...item })
        .execute()

      const product = cart.items.find((ci) => ci.productId === item.productId)?.product
      if (product?.productType === 'FLIGHT_HOURS_PACKAGE') {
        const pkg = await trx
          .selectFrom('prepaid.packages')
          .select(['minutesPerPackage', 'expiresAt'])
          .where('productId', '=', item.productId)
          .executeTakeFirst()

        if (!pkg) {
          throw new Error(`Package definition not found for product ${item.productId}`)
        }

        const totalMinutes = Number(pkg.minutesPerPackage)

        for (let i = 0; i < item.quantity; i++) {
          await trx
            .insertInto('prepaid.memberPackages')
            .values({
              memberId: memberId,
              productId: item.productId,
              orderId: orderId,
              totalMinutes: totalMinutes,
              expiresAt: pkg.expiresAt,
            })
            .execute()
        }

        await trx
          .updateTable('prepaid.packages')
          .set((eb) => ({ soldCount: eb('soldCount', '+', item.quantity) }))
          .where('productId', '=', item.productId)
          .execute()
      }
    }

    // Decrement stock for selected options (e.g. apparel sizes)
    for (const item of cart.items) {
      const selected = normalizeSelectedOptions(item.selectedOptions)
      for (const optionId of Object.values(selected)) {
        const option = await trx
          .selectFrom('shop.productPropertyOptions')
          .select(['optionId', 'stockQuantity'])
          .where('optionId', '=', optionId)
          .executeTakeFirst()

        if (!option) throw new Error('Invalid product option selection')
        if (option.stockQuantity == null) continue
        if (option.stockQuantity < item.quantity) {
          throw new Error('Selected option does not have enough stock')
        }

        await trx
          .updateTable('shop.productPropertyOptions')
          .set({ stockQuantity: option.stockQuantity - item.quantity })
          .where('optionId', '=', option.optionId)
          .execute()
      }
    }

    // Increment discount code uses
    if (discountCodeId) {
      await trx
        .updateTable('shop.discountCodes')
        .set((eb) => ({ usesCount: eb('usesCount', '+', 1) }))
        .where('codeId', '=', discountCodeId)
        .execute()
    }

    await insertOutboxItem(
      SimplbooksEventType.SHOP_ORDER_INVOICE,
      {
        orderId,
      },
      trx,
    )

    // Clear the cart
    await trx.deleteFrom('shop.cartItems').where('cartId', '=', cart.cartId).execute()
    await trx
      .updateTable('shop.carts')
      .set({ discountCodeId: null, updatedAt: new Date() })
      .where('cartId', '=', cart.cartId)
      .execute()
  })

  return getOrderById(orderId) as Promise<Order>
}

export async function updateOrderStatus(
  id: string,
  status: Order['status'],
  user: JWTUser,
): Promise<Order> {
  await db
    .updateTable('shop.orders')
    .set({ status, updatedBy: user.memberId, updatedAt: new Date() })
    .where('orderId', '=', id)
    .execute()
  return getOrderById(id) as Promise<Order>
}
