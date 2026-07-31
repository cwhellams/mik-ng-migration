import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import {
  CategoryUpsertSchema,
  ProductUpsertSchema,
  PropertyUpsertSchema,
  DiscountCodeUpsertSchema,
  CartItemUpsertSchema,
  OrderCreateSchema,
  ProductFiltersSchema,
  OrderFiltersSchema,
  OrderStatusEnum,
} from './models.ts'
import {
  getCategories,
  getCategoryById,
  insertCategory,
  updateCategory,
  deleteCategory,
  getProducts,
  getProductById,
  insertProduct,
  updateProduct,
  deleteProduct,
  hasProductOrders,
  getProductProperties,
  upsertProductProperty,
  deleteProductProperty,
  getDiscountCodes,
  getDiscountCodeByCode,
  insertDiscountCode,
  updateDiscountCode,
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
  applyDiscountToCart,
  getOrders,
  getOrderById,
  createOrderFromCart,
  updateOrderStatus,
} from '../../db/shop-queries.ts'
import { isAdminShopView, isPurchasableProduct } from './shop-visibility.ts'
import { getItems } from '../../services/simplbooks/simplbooksApiClient.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import logger from '../../lib/logger.ts'

export const router = Router()
router.use(
  validateUser(
    MIKPermissions.STORE_USER,
    MIKPermissions.STORE_ADMIN,
    MIKPermissions.INVOICING_ADMIN,
  ),
)

const isStoreAdmin = (req: Request) =>
  req.user?.permissions?.includes(MIKPermissions.STORE_ADMIN) ?? false

// ─────────────────────────────────────────────────────────────────────────────
// SimplBooks items proxy (admin only — used to populate product picker)
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/simplbooks-items',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (_req: Request, res: Response) => {
    const articles = await getItems()
    const items = articles
      .filter((a) => a.code && a.name)
      .map((a) => ({ code: a.code!, name: a.name! }))
    res.json(items)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────

router.get('/categories', async (req: Request<Record<string, string>>, res: Response) => {
  const admin = req.user?.permissions?.includes(MIKPermissions.STORE_ADMIN) ?? false
  const categories = await getCategories(!admin)
  res.json(categories)
})

router.get('/categories/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const cat = await getCategoryById(req.params.id)
  if (!cat) return problem({ status: 404, detail: 'Category not found' })
  res.json(cat)
})

router.post(
  '/categories',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = CategoryUpsertSchema.parse(req.body)
    const cat = await insertCategory(data, req.user!)
    res.status(HttpStatusCode.Created).json(cat)
  },
)

router.put(
  '/categories/:id',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = CategoryUpsertSchema.partial().parse(req.body)
    const cat = await updateCategory(req.params.id, data, req.user!)
    res.json(cat)
  },
)

router.delete(
  '/categories/:id',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    await deleteCategory(req.params.id)
    res.status(HttpStatusCode.NoContent).send()
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────────────────────────────────────

// Product listing — any authenticated user; admins see all, members see published+active only
router.get(
  '/products',
  ...validateUser(),
  async (req: Request<Record<string, string>>, res: Response) => {
    const adminShopView = isAdminShopView(isStoreAdmin(req), req.query.adminView)
    const filters = ProductFiltersSchema.parse({
      ...req.query,
      // non-admin users may only see published and active products
      ...(adminShopView ? {} : { published: 'true', active: 'true' }),
    })
    const products = await getProducts(filters)
    res.json(products)
  },
)

router.get('/products/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const product = await getProductById(req.params.id)
  if (!product) return problem({ status: 404, detail: 'Product not found' })

  const adminShopView = isAdminShopView(isStoreAdmin(req), req.query.adminView)
  if (!adminShopView && !isPurchasableProduct(product)) {
    return problem({ status: 404, detail: 'Product not found' })
  }
  res.json(product)
})

router.post(
  '/products',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = ProductUpsertSchema.parse(req.body)
    if (data.productType === 'FLIGHT_HOURS_PACKAGE') {
      return problem({
        status: 400,
        detail: 'Flight hours packages must be created from the dedicated flight packages form',
      })
    }
    const product = await insertProduct(data, req.user!)
    res.status(HttpStatusCode.Created).json(product)
  },
)

router.put(
  '/products/:id',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = ProductUpsertSchema.partial().parse(req.body)
    if (data.productType === 'FLIGHT_HOURS_PACKAGE') {
      return problem({
        status: 400,
        detail: 'Flight hours packages must be managed from the dedicated flight packages form',
      })
    }
    const product = await updateProduct(req.params.id, data, req.user!)
    res.json(product)
  },
)

router.delete(
  '/products/:id',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const productId = req.params.id
    if (await hasProductOrders(productId)) {
      return problem({
        status: 409,
        detail: 'Product cannot be deleted because it has associated orders',
      })
    }
    await deleteProduct(productId)
    res.status(HttpStatusCode.NoContent).send()
  },
)

// Product properties
router.get(
  '/products/:id/properties',
  async (req: Request<Record<string, string>>, res: Response) => {
    const props = await getProductProperties(req.params.id)
    res.json(props)
  },
)

router.put(
  '/products/:id/properties',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = PropertyUpsertSchema.parse(req.body)
    await upsertProductProperty(req.params.id, data)
    const props = await getProductProperties(req.params.id)
    res.json(props)
  },
)

router.delete(
  '/products/:productId/properties/:propertyId',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    await deleteProductProperty(Number(req.params.propertyId))
    res.status(HttpStatusCode.NoContent).send()
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Discount codes (admin only)
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/discount-codes',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (_req: Request<Record<string, string>>, res: Response) => {
    res.json(await getDiscountCodes())
  },
)

router.post(
  '/discount-codes',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = DiscountCodeUpsertSchema.parse(req.body)
    res.status(HttpStatusCode.Created).json(await insertDiscountCode(data, req.user!))
  },
)

router.put(
  '/discount-codes/:id',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = DiscountCodeUpsertSchema.partial().parse(req.body)
    res.json(await updateDiscountCode(Number(req.params.id), data, req.user!))
  },
)

// Validate a discount code (member-facing, no auth required beyond JWT)
router.get(
  '/discount-codes/validate/:code',
  validateUser(MIKPermissions.STORE_USER, MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const dc = await getDiscountCodeByCode(req.params.code)
    if (!dc || !dc.isActive) return problem({ status: 404, detail: 'Invalid discount code' })
    if (dc.validUntil && new Date(dc.validUntil) < new Date())
      return problem({ status: 410, detail: 'Discount code has expired' })
    if (dc.maxUses != null && dc.usesCount >= dc.maxUses)
      return problem({ status: 410, detail: 'Discount code has reached maximum uses' })
    res.json(dc)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Cart (authenticated member)
// ─────────────────────────────────────────────────────────────────────────────

router.use('/cart', validateUser(MIKPermissions.STORE_USER, MIKPermissions.STORE_ADMIN))

router.get('/cart', async (req: Request<Record<string, string>>, res: Response) => {
  res.json(await getCart(req.user!.memberId))
})

router.post('/cart/items', async (req: Request<Record<string, string>>, res: Response) => {
  const data = CartItemUpsertSchema.parse(req.body)
  const product = await getProductById(data.productId)
  if (!product || !isPurchasableProduct(product)) {
    return problem({ status: 404, detail: 'Product not found' })
  }
  const cart = await addCartItem(req.user!.memberId, data)
  res.status(HttpStatusCode.Created).json(cart)
})

router.put('/cart/items/:itemId', async (req: Request<Record<string, string>>, res: Response) => {
  const { quantity } = req.body
  if (typeof quantity !== 'number') return problem({ status: 400, detail: 'quantity is required' })
  const cart = await updateCartItem(req.user!.memberId, Number(req.params.itemId), quantity)
  res.json(cart)
})

router.delete(
  '/cart/items/:itemId',
  async (req: Request<Record<string, string>>, res: Response) => {
    const cart = await removeCartItem(req.user!.memberId, Number(req.params.itemId))
    res.json(cart)
  },
)

router.delete('/cart', async (req: Request<Record<string, string>>, res: Response) => {
  const cart = await clearCart(req.user!.memberId)
  res.json(cart)
})

router.post('/cart/discount', async (req: Request<Record<string, string>>, res: Response) => {
  const { code } = req.body
  if (!code) {
    const cart = await applyDiscountToCart(req.user!.memberId, null)
    return res.json(cart)
  }
  const dc = await getDiscountCodeByCode(code)
  if (!dc || !dc.isActive) return problem({ status: 400, detail: 'Invalid discount code' })
  const cart = await applyDiscountToCart(req.user!.memberId, dc.codeId)
  res.json(cart)
})

// ─────────────────────────────────────────────────────────────────────────────
// Orders
// ─────────────────────────────────────────────────────────────────────────────

// Member creates order from their current cart
router.post(
  '/orders',
  validateUser(MIKPermissions.STORE_USER, MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = OrderCreateSchema.parse(req.body)
    const cart = await getCart(req.user!.memberId)
    const hasUnavailableItem = (cart.items ?? []).some(
      (item) => !item.product || !isPurchasableProduct(item.product),
    )
    if (hasUnavailableItem) {
      return problem({
        status: 409,
        detail: 'Cart contains product(s) that are no longer available',
      })
    }
    const order = await createOrderFromCart(req.user!.memberId, data, req.user!)

    // Send order notification email to the orders inbox (fire-and-forget)
    const notifyEmail = process.env.ORDER_NOTIFICATION_EMAIL
    if (notifyEmail) {
      const member = order.member
      const itemRows = (order.items ?? [])
        .map(
          (i) =>
            `<tr><td>${i.productId}</td><td>${i.quantity}</td><td>€${i.unitPrice.toFixed(2)}</td><td>€${i.totalPrice.toFixed(2)}</td></tr>`,
        )
        .join('')
      const html = `
        <h2>New shop order #${order.orderId}</h2>
        <p><strong>Member:</strong> ${member?.firstName ?? ''} ${member?.lastName ?? ''} &lt;${member?.email ?? req.user!.email}&gt;</p>
        <table border="1" cellpadding="4" cellspacing="0">
          <thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <p><strong>Order total: €${order.totalAmount.toFixed(2)}</strong></p>
        ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
      `
      sendEmail(notifyEmail, `New order #${order.orderId}`, html).catch((err: unknown) =>
        logger.error('Failed to send order notification email', err),
      )
    }

    res.status(HttpStatusCode.Created).json(order)
  },
)

// Admin: list all orders; member: their own orders
router.get(
  '/orders',
  validateUser(MIKPermissions.STORE_USER, MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const admin = isStoreAdmin(req)
    const filters = OrderFiltersSchema.parse(req.query)
    const result = await getOrders({
      ...filters,
      ...(admin ? {} : { memberId: req.user!.memberId }),
    })

    const wantsPaging = req.query.page !== undefined || req.query.pageSize !== undefined
    if (wantsPaging) {
      return res.json(result)
    }

    res.json(result.items)
  },
)

router.get(
  '/orders/:id',
  validateUser(MIKPermissions.STORE_USER, MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const order = await getOrderById(req.params.id)
    if (!order) return problem({ status: 404, detail: 'Order not found' })

    const admin = isStoreAdmin(req)
    if (!admin && order.memberId !== req.user!.memberId) {
      return problem({ status: 403, detail: 'Forbidden' })
    }
    res.json(order)
  },
)

router.put(
  '/orders/:id/status',
  validateUser(MIKPermissions.STORE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const status = OrderStatusEnum.parse(req.body.status)
    const order = await updateOrderStatus(req.params.id, status, req.user!)
    res.json(order)
  },
)
