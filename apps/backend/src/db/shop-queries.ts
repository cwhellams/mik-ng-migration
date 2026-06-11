import { db } from './connection.ts'
import { randomUUID } from 'node:crypto'
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
} from '../routes/shop/models.ts'
import { sql } from 'kysely'
import type { Json } from './schema.d.ts'
import { insertOutboxItem } from './outbox-simplbooks-queries.ts'
import { SimplbooksEventType } from '../services/simplbooks/models.ts'
import { problem } from '../routes/response.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function newId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()
}

// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────

export async function getCategories(activeOnly = true): Promise<Category[]> {
  let q = db.selectFrom('shop.categories').selectAll()
  if (activeOnly) q = q.where('is_active', '=', true)
  const rows = await q.orderBy('sort_order').execute()
  return rows.map((r) => ({
    categoryId: r.category_id,
    name: r.name as Category['name'],
    description: r.description as Category['description'],
    isActive: r.is_active,
    sortOrder: r.sort_order,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    updatedBy: r.updated_by,
  }))
}

export async function getCategoryById(id: string): Promise<Category | undefined> {
  const r = await db
    .selectFrom('shop.categories')
    .selectAll()
    .where('category_id', '=', id)
    .executeTakeFirst()
  if (!r) return undefined
  return {
    categoryId: r.category_id,
    name: r.name as Category['name'],
    description: r.description as Category['description'],
    isActive: r.is_active,
    sortOrder: r.sort_order,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    updatedBy: r.updated_by,
  }
}

export async function insertCategory(data: CategoryUpsert, user: JWTUser): Promise<Category> {
  const id = newId()
  await db
    .insertInto('shop.categories')
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
  return getCategoryById(id) as Promise<Category>
}

export async function updateCategory(
  id: string,
  data: Partial<CategoryUpsert>,
  user: JWTUser,
): Promise<Category> {
  const update: Record<string, unknown> = { updated_by: user.memberId, updated_at: new Date() }
  if (data.name !== undefined) update.name = data.name as object
  if (data.description !== undefined) update.description = data.description as object
  if (data.isActive !== undefined) update.is_active = data.isActive
  if (data.sortOrder !== undefined) update.sort_order = data.sortOrder
  await db.updateTable('shop.categories').set(update).where('category_id', '=', id).execute()
  return getCategoryById(id) as Promise<Category>
}

export async function deleteCategory(id: string): Promise<void> {
  await db.deleteFrom('shop.categories').where('category_id', '=', id).execute()
}

// ─────────────────────────────────────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────────────────────────────────────

export async function getProducts(filters?: ProductFilters): Promise<Product[]> {
  let q = db.selectFrom('shop.products').selectAll()
  if (filters?.categoryId) q = q.where('category_id', '=', filters.categoryId)
  if (filters?.published !== undefined) q = q.where('is_published', '=', filters.published)
  if (filters?.active !== undefined) q = q.where('is_active', '=', filters.active)
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
    .where('product_id', '=', id)
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
    .selectFrom('shop.order_items')
    .select('product_id')
    .where('product_id', 'in', productIds)
    .groupBy('product_id')
    .execute()

  const orderedProductIds = new Set(rows.map((row) => row.product_id))
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
    .select(['product_id', 'total_packages_available', 'sold_count'])
    .where('product_id', 'in', ids)
    .execute()
  const stockByProductId = new Map(
    pkgs.map((p) => [p.product_id, Math.max(0, p.total_packages_available - p.sold_count)]),
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
    .select(['product_id', 'aircraft_registration'])
    .where('product_id', 'in', ids)
    .execute()
  const regByProductId = new Map(pkgs.map((p) => [p.product_id, p.aircraft_registration]))
  const registrations = [...new Set(pkgs.map((p) => p.aircraft_registration))]
  if (registrations.length === 0) return
  const aircrafts = await db
    .selectFrom('flight.aircraft')
    .select(['registration', 'image_url'])
    .where('registration', 'in', registrations)
    .execute()
  const imgByRegistration = new Map(aircrafts.map((a) => [a.registration, a.image_url]))
  for (const product of pkgProducts) {
    const reg = regByProductId.get(product.productId)
    if (reg) product.imageUrl = imgByRegistration.get(reg) ?? null
  }
}

function mapProduct(r: Record<string, unknown>): Product {
  return {
    productId: r.product_id as string,
    categoryId: r.category_id as string,
    simplbooksItemId: r.simplbooks_item_id as string | null,
    productType: r.product_type as Product['productType'],
    name: r.name as Product['name'],
    description: r.description as Product['description'],
    price: Number(r.price),
    vatPercent: Number(r.vat_percent),
    stockQuantity: Number(r.stock_quantity),
    lowStockThreshold: r.low_stock_threshold != null ? Number(r.low_stock_threshold) : null,
    maxOrderQuantity: r.max_order_quantity != null ? Number(r.max_order_quantity) : null,
    isActive: r.is_active as boolean,
    isPublished: r.is_published as boolean,
    tags: r.tags as string[],
    metadata: r.metadata as Record<string, unknown> | null,
    imageUrl: r.image_url as string | null,
    hasOrders: false,
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

export async function insertProduct(data: ProductUpsert, user: JWTUser): Promise<Product> {
  const id = newId()
  await db
    .insertInto('shop.products')
    .values({
      product_id: id,
      category_id: data.categoryId,
      simplbooks_item_id: data.simplbooksItemId ?? null,
      product_type: data.productType ?? 'STANDARD',
      name: data.name as unknown as Json,
      description: (data.description as unknown as Json) ?? null,
      price: data.price,
      vat_percent: data.vatPercent ?? 24,
      stock_quantity: data.stockQuantity ?? 0,
      low_stock_threshold: data.lowStockThreshold ?? null,
      max_order_quantity: data.maxOrderQuantity ?? null,
      is_active: data.isActive ?? true,
      is_published: data.isPublished ?? false,
      tags: (data.tags ?? []) as unknown as string[],
      metadata: (data.metadata as unknown as Json) ?? null,
      image_url: data.imageUrl ?? null,
      created_by: user.memberId,
      updated_by: user.memberId,
    })
    .execute()
  return getProductById(id) as Promise<Product>
}

export async function updateProduct(
  id: string,
  data: Partial<ProductUpsert>,
  user: JWTUser,
): Promise<Product> {
  const update: Record<string, unknown> = { updated_by: user.memberId, updated_at: new Date() }
  if (data.categoryId !== undefined) update.category_id = data.categoryId
  if (data.simplbooksItemId !== undefined) update.simplbooks_item_id = data.simplbooksItemId
  if (data.productType !== undefined) update.product_type = data.productType
  if (data.name !== undefined) update.name = data.name as object
  if (data.description !== undefined) update.description = data.description as object
  if (data.price !== undefined) update.price = data.price
  if (data.vatPercent !== undefined) update.vat_percent = data.vatPercent
  if (data.stockQuantity !== undefined) update.stock_quantity = data.stockQuantity
  if (data.lowStockThreshold !== undefined) update.low_stock_threshold = data.lowStockThreshold
  if (data.maxOrderQuantity !== undefined) update.max_order_quantity = data.maxOrderQuantity
  if (data.isActive !== undefined) update.is_active = data.isActive
  if (data.isPublished !== undefined) update.is_published = data.isPublished
  if (data.tags !== undefined) update.tags = data.tags as unknown as string[]
  if (data.metadata !== undefined) update.metadata = data.metadata as object
  if (data.imageUrl !== undefined) update.image_url = data.imageUrl
  await db.updateTable('shop.products').set(update).where('product_id', '=', id).execute()
  return getProductById(id) as Promise<Product>
}

export async function deleteProduct(id: string): Promise<void> {
  await db.deleteFrom('shop.products').where('product_id', '=', id).execute()
}

export async function hasProductOrders(productId: string): Promise<boolean> {
  const row = await db
    .selectFrom('shop.order_items')
    .select((eb) => [eb.fn.countAll<number>().as('count')])
    .where('product_id', '=', productId)
    .executeTakeFirst()

  return Number(row?.count ?? 0) > 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Product properties & options
// ─────────────────────────────────────────────────────────────────────────────

export async function getProductProperties(productId: string) {
  const props = await db
    .selectFrom('shop.product_properties')
    .selectAll()
    .where('product_id', '=', productId)
    .orderBy('sort_order')
    .execute()

  if (props.length === 0) return []

  const opts = await db
    .selectFrom('shop.product_property_options')
    .selectAll()
    .where(
      'property_id',
      'in',
      props.map((p) => p.property_id),
    )
    .orderBy('sort_order')
    .execute()

  return props.map((p) => ({
    propertyId: p.property_id,
    productId: p.product_id,
    name: p.name as Product['name'],
    isRequired: p.is_required,
    sortOrder: p.sort_order,
    options: opts
      .filter((o) => o.property_id === p.property_id)
      .map((o) => ({
        optionId: o.option_id,
        propertyId: o.property_id,
        value: o.value as Product['name'],
        sortOrder: o.sort_order,
        isActive: o.is_active,
        stockQuantity: o.stock_quantity,
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
      .updateTable('shop.product_properties')
      .set({
        name: data.name as unknown as Json,
        is_required: data.isRequired,
        sort_order: data.sortOrder,
      })
      .where('property_id', '=', data.propertyId)
      .execute()
    propertyId = data.propertyId
  } else {
    const result = await db
      .insertInto('shop.product_properties')
      .values({
        product_id: productId,
        name: data.name as unknown as Json,
        is_required: data.isRequired,
        sort_order: data.sortOrder,
      })
      .returning('property_id')
      .executeTakeFirstOrThrow()
    propertyId = result.property_id
  }

  for (const opt of data.options) {
    if (opt.optionId) {
      await db
        .updateTable('shop.product_property_options')
        .set({
          value: opt.value as unknown as Json,
          sort_order: opt.sortOrder,
          is_active: opt.isActive,
          stock_quantity: opt.stockQuantity ?? null,
        })
        .where('option_id', '=', opt.optionId)
        .execute()
    } else {
      await db
        .insertInto('shop.product_property_options')
        .values({
          property_id: propertyId,
          value: opt.value as unknown as Json,
          sort_order: opt.sortOrder,
          is_active: opt.isActive,
          stock_quantity: opt.stockQuantity ?? null,
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
  await db.deleteFrom('shop.product_properties').where('property_id', '=', propertyId).execute()
}

// ─────────────────────────────────────────────────────────────────────────────
// Discount codes
// ─────────────────────────────────────────────────────────────────────────────

export async function getDiscountCodes(): Promise<DiscountCode[]> {
  const rows = await db.selectFrom('shop.discount_codes').selectAll().execute()
  const categoryMap = await getDiscountCodeCategoryMap(rows.map((row) => row.code_id))
  return rows.map((row) =>
    mapDiscountCode({ ...row, category_ids: categoryMap.get(row.code_id) ?? [] }),
  )
}

export async function getDiscountCodeByCode(code: string): Promise<DiscountCode | undefined> {
  const row = await db
    .selectFrom('shop.discount_codes')
    .selectAll()
    .where('code', '=', code)
    .executeTakeFirst()

  if (!row) return undefined

  const categoryMap = await getDiscountCodeCategoryMap([row.code_id])
  return mapDiscountCode({ ...row, category_ids: categoryMap.get(row.code_id) ?? [] })
}

async function getDiscountCodeById(id: number): Promise<DiscountCode | undefined> {
  const row = await db
    .selectFrom('shop.discount_codes')
    .selectAll()
    .where('code_id', '=', id)
    .executeTakeFirst()

  if (!row) return undefined

  const categoryMap = await getDiscountCodeCategoryMap([row.code_id])
  return mapDiscountCode({ ...row, category_ids: categoryMap.get(row.code_id) ?? [] })
}

async function getDiscountCodeCategoryMap(codeIds: number[]): Promise<Map<number, string[]>> {
  if (!codeIds.length) return new Map()

  let rows: Array<{ code_id: number; category_id: string }>
  try {
    rows = await db
      .selectFrom('shop.discount_code_categories')
      .select(['code_id', 'category_id'])
      .where('code_id', 'in', codeIds)
      .execute()
  } catch (error) {
    if (isMissingDiscountCodeCategoryTableError(error)) {
      await ensureDiscountCodeCategoryTable()
      rows = await db
        .selectFrom('shop.discount_code_categories')
        .select(['code_id', 'category_id'])
        .where('code_id', 'in', codeIds)
        .execute()
    } else {
      throw error
    }
  }

  const grouped = new Map<number, string[]>()
  for (const row of rows) {
    const current = grouped.get(row.code_id) ?? []
    current.push(row.category_id)
    grouped.set(row.code_id, current)
  }
  return grouped
}

async function replaceDiscountCodeCategories(codeId: number, categoryIds: string[]): Promise<void> {
  try {
    await db.deleteFrom('shop.discount_code_categories').where('code_id', '=', codeId).execute()
  } catch (error) {
    if (isMissingDiscountCodeCategoryTableError(error)) {
      await ensureDiscountCodeCategoryTable()
      await db.deleteFrom('shop.discount_code_categories').where('code_id', '=', codeId).execute()
    } else {
      throw error
    }
  }

  const uniqueCategoryIds = [...new Set(categoryIds)]
  if (!uniqueCategoryIds.length) return

  await db
    .insertInto('shop.discount_code_categories')
    .values(uniqueCategoryIds.map((categoryId) => ({ code_id: codeId, category_id: categoryId })))
    .execute()
}

async function ensureDiscountCodeCategoryTable(): Promise<void> {
  await db.schema
    .createTable('shop.discount_code_categories')
    .ifNotExists()
    .addColumn('code_id', 'integer', (col) => col.notNull())
    .addColumn('category_id', 'varchar(9)', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .addPrimaryKeyConstraint('pk_shop_discount_code_categories', ['code_id', 'category_id'])
    .addForeignKeyConstraint(
      'fk_shop_discount_code_categories_code_id',
      ['code_id'],
      'shop.discount_codes',
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

function mapDiscountCode(r: Record<string, unknown>): DiscountCode {
  return {
    codeId: r.code_id as number,
    code: r.code as string,
    description: r.description as string | null,
    categoryIds: (r.category_ids as string[] | undefined) ?? [],
    discountType: r.discount_type as DiscountCode['discountType'],
    discountValue: Number(r.discount_value),
    minOrderAmount: r.min_order_amount != null ? Number(r.min_order_amount) : null,
    maxUses: r.max_uses != null ? Number(r.max_uses) : null,
    usesCount: Number(r.uses_count),
    validFrom: (r.valid_from instanceof Date
      ? r.valid_from
      : new Date(r.valid_from as string)
    ).toISOString(),
    validUntil:
      r.valid_until != null
        ? (r.valid_until instanceof Date
            ? r.valid_until
            : new Date(r.valid_until as string)
          ).toISOString()
        : null,
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

export async function insertDiscountCode(
  data: DiscountCodeUpsert,
  user: JWTUser,
): Promise<DiscountCode> {
  const result = await db
    .insertInto('shop.discount_codes')
    .values({
      code: data.code,
      description: data.description ?? null,
      discount_type: data.discountType,
      discount_value: data.discountValue,
      min_order_amount: data.minOrderAmount ?? null,
      max_uses: data.maxUses ?? null,
      valid_from: data.validFrom,
      valid_until: data.validUntil ?? null,
      is_active: data.isActive ?? true,
      created_by: user.memberId,
      updated_by: user.memberId,
    })
    .returning('code_id')
    .executeTakeFirstOrThrow()

  await replaceDiscountCodeCategories(result.code_id, data.categoryIds ?? [])

  const discountCode = await getDiscountCodeById(result.code_id)
  if (!discountCode) throw new Error('Discount code not found after insert')
  return discountCode
}

export async function updateDiscountCode(
  id: number,
  data: Partial<DiscountCodeUpsert>,
  user: JWTUser,
): Promise<DiscountCode> {
  const update: Record<string, unknown> = { updated_by: user.memberId, updated_at: new Date() }
  if (data.code !== undefined) update.code = data.code
  if (data.description !== undefined) update.description = data.description
  if (data.discountType !== undefined) update.discount_type = data.discountType
  if (data.discountValue !== undefined) update.discount_value = data.discountValue
  if (data.minOrderAmount !== undefined) update.min_order_amount = data.minOrderAmount
  if (data.maxUses !== undefined) update.max_uses = data.maxUses
  if (data.validFrom !== undefined) update.valid_from = data.validFrom
  if (data.validUntil !== undefined) update.valid_until = data.validUntil
  if (data.isActive !== undefined) update.is_active = data.isActive
  await db.updateTable('shop.discount_codes').set(update).where('code_id', '=', id).execute()

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
    .select('cart_id')
    .where('member_id', '=', memberId)
    .executeTakeFirst()
  if (existing) return existing.cart_id

  const cartId = newId()
  await db.insertInto('shop.carts').values({ cart_id: cartId, member_id: memberId }).execute()
  return cartId
}

export async function getCart(memberId: string): Promise<Cart> {
  const cartId = await getOrCreateCart(memberId)
  const cart = await db
    .selectFrom('shop.carts')
    .selectAll()
    .where('cart_id', '=', cartId)
    .executeTakeFirstOrThrow()
  const items = await db
    .selectFrom('shop.cart_items')
    .selectAll()
    .where('cart_id', '=', cartId)
    .orderBy('created_at')
    .execute()

  const productIds = [...new Set(items.map((i) => i.product_id))]
  const products = productIds.length
    ? await db
        .selectFrom('shop.products')
        .selectAll()
        .where('product_id', 'in', productIds)
        .execute()
    : []

  return {
    cartId: cart.cart_id,
    memberId: cart.member_id,
    discountCodeId: cart.discount_code_id,
    createdAt: cart.created_at instanceof Date ? cart.created_at.toISOString() : cart.created_at,
    updatedAt: cart.updated_at instanceof Date ? cart.updated_at.toISOString() : cart.updated_at,
    items: items.map((i) => ({
      cartItemId: i.cart_item_id,
      cartId: i.cart_id,
      productId: i.product_id,
      quantity: i.quantity,
      selectedOptions: i.selected_options as Record<string, number> | null,
      createdAt: (i.created_at instanceof Date
        ? i.created_at
        : new Date(i.created_at as string)
      ).toISOString(),
      updatedAt: (i.updated_at instanceof Date
        ? i.updated_at
        : new Date(i.updated_at as string)
      ).toISOString(),
      product: products.find((p) => p.product_id === i.product_id)
        ? mapProduct(products.find((p) => p.product_id === i.product_id)!)
        : undefined,
    })),
  }
}

export async function addCartItem(memberId: string, data: CartItemUpsert): Promise<Cart> {
  const cartId = await getOrCreateCart(memberId)

  const selectedOptions = normalizeSelectedOptions(data.selectedOptions)

  // Check if same product and same selected options already in cart
  const existingRows = await db
    .selectFrom('shop.cart_items')
    .selectAll()
    .where('cart_id', '=', cartId)
    .where('product_id', '=', data.productId)
    .execute()

  const incomingKey = selectedOptionsKey(selectedOptions)
  const existing = existingRows.find(
    (row) =>
      selectedOptionsKey((row.selected_options as Record<string, number> | null) ?? null) ===
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
      .selectFrom('prepaid.member_packages')
      .select((eb) => [eb.fn.countAll<number>().as('count')])
      .where('member_id', '=', memberId)
      .where('product_id', '=', data.productId)
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
      .updateTable('shop.cart_items')
      .set({ quantity: newCartQty, updated_at: new Date() })
      .where('cart_item_id', '=', existing.cart_item_id)
      .execute()
  } else {
    await db
      .insertInto('shop.cart_items')
      .values({
        cart_id: cartId,
        product_id: data.productId,
        quantity: data.quantity,
        selected_options: (selectedOptions as unknown as Json) ?? null,
      })
      .execute()
  }

  await db
    .updateTable('shop.carts')
    .set({ updated_at: new Date() })
    .where('cart_id', '=', cartId)
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
      .deleteFrom('shop.cart_items')
      .where('cart_item_id', '=', cartItemId)
      .where('cart_id', '=', cartId)
      .execute()
  } else {
    // Enforce limits when increasing quantity
    const item = await db
      .selectFrom('shop.cart_items')
      .select(['product_id', 'selected_options'])
      .where('cart_item_id', '=', cartItemId)
      .where('cart_id', '=', cartId)
      .executeTakeFirst()
    if (item) {
      await validateSelectedOptionsStock(
        item.product_id,
        quantity,
        (item.selected_options as Record<string, number> | null) ?? null,
      )

      const product = await getProductById(item.product_id)
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
          .selectFrom('prepaid.member_packages')
          .select((eb) => [eb.fn.countAll<number>().as('count')])
          .where('member_id', '=', memberId)
          .where('product_id', '=', item.product_id)
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
      .updateTable('shop.cart_items')
      .set({ quantity, updated_at: new Date() })
      .where('cart_item_id', '=', cartItemId)
      .where('cart_id', '=', cartId)
      .execute()
  }
  await db
    .updateTable('shop.carts')
    .set({ updated_at: new Date() })
    .where('cart_id', '=', cartId)
    .execute()
  return getCart(memberId)
}

export async function removeCartItem(memberId: string, cartItemId: number): Promise<Cart> {
  const cartId = await getOrCreateCart(memberId)
  await db
    .deleteFrom('shop.cart_items')
    .where('cart_item_id', '=', cartItemId)
    .where('cart_id', '=', cartId)
    .execute()
  await db
    .updateTable('shop.carts')
    .set({ updated_at: new Date() })
    .where('cart_id', '=', cartId)
    .execute()
  return getCart(memberId)
}

export async function clearCart(memberId: string): Promise<Cart> {
  const cartId = await getOrCreateCart(memberId)
  await db.deleteFrom('shop.cart_items').where('cart_id', '=', cartId).execute()
  await db
    .updateTable('shop.carts')
    .set({ discount_code_id: null, updated_at: new Date() })
    .where('cart_id', '=', cartId)
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
    .set({ discount_code_id: discountCodeId, updated_at: new Date() })
    .where('cart_id', '=', cartId)
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
    .leftJoin('member.register as m', 'm.member_id', 'o.member_id')
    .selectAll('o')
    .select([
      'm.member_id as member_member_id',
      'm.first_name as member_first_name',
      'm.last_name as member_last_name',
      'm.email as member_email',
      'm.phone_number as member_phone_number',
    ])
  let countQuery = db
    .selectFrom('shop.orders as o')
    .select((eb) => [eb.fn.countAll<number>().as('count')])

  if (filters?.memberId) {
    dataQuery = dataQuery.where('o.member_id', '=', filters.memberId)
    countQuery = countQuery.where('o.member_id', '=', filters.memberId)
  }
  if (filters?.status) {
    dataQuery = dataQuery.where('o.status', '=', filters.status)
    countQuery = countQuery.where('o.status', '=', filters.status)
  }
  if (filters?.categoryId) {
    dataQuery = dataQuery.where((eb) =>
      eb.exists(
        eb
          .selectFrom('shop.order_items as oi')
          .innerJoin('shop.products as p', 'p.product_id', 'oi.product_id')
          .select(sql`1`.as('one'))
          .whereRef('oi.order_id', '=', 'o.order_id')
          .where('p.category_id', '=', filters.categoryId!),
      ),
    )
    countQuery = countQuery.where((eb) =>
      eb.exists(
        eb
          .selectFrom('shop.order_items as oi')
          .innerJoin('shop.products as p', 'p.product_id', 'oi.product_id')
          .select(sql`1`.as('one'))
          .whereRef('oi.order_id', '=', 'o.order_id')
          .where('p.category_id', '=', filters.categoryId!),
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
    dataQuery = dataQuery.where('o.created_at', '>=', from)
    countQuery = countQuery.where('o.created_at', '>=', from)
  }

  const [rows, totalRow] = await Promise.all([
    dataQuery.orderBy('o.created_at', 'desc').offset(offset).limit(pageSize).execute(),
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
    .leftJoin('member.register as m', 'm.member_id', 'o.member_id')
    .selectAll('o')
    .select([
      'm.member_id as member_member_id',
      'm.first_name as member_first_name',
      'm.last_name as member_last_name',
      'm.email as member_email',
      'm.phone_number as member_phone_number',
    ])
    .where('o.order_id', '=', id)
    .executeTakeFirst()
  if (!r) return undefined
  const order = mapOrder(r)
  order.items = await db
    .selectFrom('shop.order_items')
    .selectAll()
    .where('order_id', '=', id)
    .execute()
    .then((rows) =>
      rows.map((i) => ({
        orderItemId: i.order_item_id,
        orderId: i.order_id,
        productId: i.product_id,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price),
        totalPrice: Number(i.total_price),
        selectedOptions: i.selected_options as Record<string, number> | null,
        productSnapshot: i.product_snapshot as Record<string, unknown>,
      })),
    )
  return order
}

function mapOrder(r: Record<string, unknown>): Order {
  const memberId = r.member_member_id as string | undefined
  const firstName = r.member_first_name as string | undefined
  const lastName = r.member_last_name as string | undefined
  const email = r.member_email as string | undefined

  return {
    orderId: r.order_id as string,
    memberId: r.member_id as string,
    status: r.status as Order['status'],
    totalAmount: Number(r.total_amount),
    discountCodeId: r.discount_code_id as number | null,
    discountAmount: r.discount_amount != null ? Number(r.discount_amount) : null,
    invoiceId: r.invoice_id as string | null,
    notes: r.notes as string | null,
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
        .selectFrom('prepaid.member_packages')
        .select((eb) => [eb.fn.countAll<number>().as('count')])
        .where('member_id', '=', memberId)
        .where('product_id', '=', item.productId)
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
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      selected_options: (item.selectedOptions as unknown as Json) ?? null,
      product_snapshot: {
        name: item.product?.name,
        description: item.product?.description,
        price: unitPrice,
        simplbooksItemId: item.product?.simplbooksItemId,
      } as unknown as Json,
    }
  })

  if (discountAmount) totalAmount -= discountAmount

  const orderId = newId()
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('shop.orders')
      .values({
        order_id: orderId,
        member_id: memberId,
        status: 'PENDING',
        total_amount: totalAmount,
        discount_code_id: discountCodeId,
        discount_amount: discountAmount,
        notes: data.notes ?? null,
        created_by: user.memberId,
        updated_by: user.memberId,
      })
      .execute()

    for (const item of orderItems) {
      const stockUpdateResult = await trx
        .updateTable('shop.products')
        .set((eb) => ({ stock_quantity: eb('stock_quantity', '-', item.quantity) }))
        .where('product_id', '=', item.product_id)
        .where('stock_quantity', '>=', item.quantity)
        .executeTakeFirst()

      if (!stockUpdateResult || stockUpdateResult.numUpdatedRows !== BigInt(1)) {
        const product = cart.items.find((ci) => ci.productId === item.product_id)?.product
        const name = (product?.name as Record<string, string> | undefined)?.en ?? item.product_id
        throw new Error(`"${name}": not enough stock available`)
      }

      await trx
        .insertInto('shop.order_items')
        .values({ order_id: orderId, ...item })
        .execute()

      const product = cart.items.find((ci) => ci.productId === item.product_id)?.product
      if (product?.productType === 'FLIGHT_HOURS_PACKAGE') {
        const pkg = await trx
          .selectFrom('prepaid.packages')
          .select(['minutes_per_package', 'expires_at'])
          .where('product_id', '=', item.product_id)
          .executeTakeFirst()

        if (!pkg) {
          throw new Error(`Package definition not found for product ${item.product_id}`)
        }

        const totalMinutes = Number(pkg.minutes_per_package)

        for (let i = 0; i < item.quantity; i++) {
          await trx
            .insertInto('prepaid.member_packages')
            .values({
              member_id: memberId,
              product_id: item.product_id,
              order_id: orderId,
              total_minutes: totalMinutes,
              expires_at: pkg.expires_at,
            })
            .execute()
        }

        await trx
          .updateTable('prepaid.packages')
          .set((eb) => ({ sold_count: eb('sold_count', '+', item.quantity) }))
          .where('product_id', '=', item.product_id)
          .execute()
      }
    }

    // Decrement stock for selected options (e.g. apparel sizes)
    for (const item of cart.items) {
      const selected = normalizeSelectedOptions(item.selectedOptions)
      for (const optionId of Object.values(selected)) {
        const option = await trx
          .selectFrom('shop.product_property_options')
          .select(['option_id', 'stock_quantity'])
          .where('option_id', '=', optionId)
          .executeTakeFirst()

        if (!option) throw new Error('Invalid product option selection')
        if (option.stock_quantity == null) continue
        if (option.stock_quantity < item.quantity) {
          throw new Error('Selected option does not have enough stock')
        }

        await trx
          .updateTable('shop.product_property_options')
          .set({ stock_quantity: option.stock_quantity - item.quantity })
          .where('option_id', '=', option.option_id)
          .execute()
      }
    }

    // Increment discount code uses
    if (discountCodeId) {
      await trx
        .updateTable('shop.discount_codes')
        .set((eb) => ({ uses_count: eb('uses_count', '+', 1) }))
        .where('code_id', '=', discountCodeId)
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
    await trx.deleteFrom('shop.cart_items').where('cart_id', '=', cart.cartId).execute()
    await trx
      .updateTable('shop.carts')
      .set({ discount_code_id: null, updated_at: new Date() })
      .where('cart_id', '=', cart.cartId)
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
    .set({ status, updated_by: user.memberId, updated_at: new Date() })
    .where('order_id', '=', id)
    .execute()
  return getOrderById(id) as Promise<Order>
}
