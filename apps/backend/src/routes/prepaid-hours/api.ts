import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import { PrepaidPackageUpsertSchema, ExtendExpirySchema } from '@mik/contracts/prepaid-hours'
import {
  getPrepaidPackages,
  getPrepaidPackageById,
  insertPrepaidPackage,
  updatePrepaidPackage,
  getMemberPackages,
  extendExpiryForAircraft,
  getUsageLog,
  getUnbilledTimeByAircraft,
} from '../../db/prepaid-hours-queries.ts'

export const router = Router()
router.use(
  validateUser(
    MIKPermissions.STORE_USER,
    MIKPermissions.STORE_ADMIN,
    MIKPermissions.INVOICING_ADMIN,
  ),
)

const isTreasurer = (req: Request) =>
  req.user?.permissions?.includes(MIKPermissions.INVOICING_ADMIN) ||
  req.user?.permissions?.includes(MIKPermissions.STORE_ADMIN)

// ─────────────────────────────────────────────────────────────────────────────
// Package definitions (admin / treasurer)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/packages', async (req: Request<Record<string, string>>, res: Response) => {
  const { aircraft } = req.query as { aircraft?: string }
  res.json(await getPrepaidPackages(aircraft))
})

router.get('/packages/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const pkg = await getPrepaidPackageById(req.params.id)
  if (!pkg) return problem({ status: 404, detail: 'Package not found' })
  res.json(pkg)
})

router.post(
  '/packages',
  validateUser(MIKPermissions.STORE_ADMIN, MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = PrepaidPackageUpsertSchema.parse(req.body)
    res.status(HttpStatusCode.Created).json(await insertPrepaidPackage(data, req.user!))
  },
)

router.put(
  '/packages/:id',
  validateUser(MIKPermissions.STORE_ADMIN, MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = PrepaidPackageUpsertSchema.partial().parse(req.body)
    res.json(await updatePrepaidPackage(req.params.id, data, req.user!))
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Member packages (owned)
// ─────────────────────────────────────────────────────────────────────────────

// Admin: all member packages; member: their own
router.get('/member-packages', async (req: Request<Record<string, string>>, res: Response) => {
  const admin = isTreasurer(req)
  const memberId = admin ? (req.query.memberId as string | undefined) : req.user!.memberId
  const packageId = req.query.packageId as string | undefined
  res.json(await getMemberPackages(memberId, packageId))
})

// Usage log for a specific member package
router.get(
  '/member-packages/:id/usage',
  validateUser(MIKPermissions.STORE_ADMIN, MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    res.json(await getUsageLog(Number(req.params.id)))
  },
)

// Unbilled flight time grouped by aircraft for the current member
router.get('/unbilled-time', async (req: Request<Record<string, string>>, res: Response) => {
  res.json(await getUnbilledTimeByAircraft(req.user!.memberId))
})

// ─────────────────────────────────────────────────────────────────────────────
// Bulk expiry extension (treasurer / store admin)
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  '/extend-expiry',
  validateUser(MIKPermissions.STORE_ADMIN, MIKPermissions.INVOICING_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = ExtendExpirySchema.parse(req.body)
    const updated = await extendExpiryForAircraft(
      data.aircraftRegistration,
      data.daysToAdd,
      req.user!,
    )
    res.json({ updated })
  },
)
