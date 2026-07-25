import { Router, type Request, type Response } from 'express'
import { HttpStatusCode } from 'axios'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import {
  deletePushSubscriptionByEndpoint,
  getPushSubscriptionsByMemberId,
  upsertPushSubscription,
} from '../../db/push-queries.ts'
import { PushSubscriptionRequestSchema, PushUnsubscribeRequestSchema } from './models.ts'

export const router = Router()

router.use(validateUser(MIKPermissions.MEMBER))

/** Returns the VAPID public key so the frontend can subscribe via PushManager. */
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  if (!publicKey) {
    return problem({
      status: HttpStatusCode.ServiceUnavailable,
      detail: 'Push notifications are not configured on this server.',
    })
  }
  res.status(HttpStatusCode.Ok).json({ publicKey })
})

/** List the current member's own push subscriptions (per-device opt-in state). */
router.get('/subscriptions', async (req: Request, res: Response) => {
  const memberId = req.user!.memberId
  const subscriptions = await getPushSubscriptionsByMemberId(memberId)
  res.status(HttpStatusCode.Ok).json({
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      endpoint: s.endpoint,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
    })),
  })
})

router.post('/subscribe', async (req: Request, res: Response) => {
  const memberId = req.user!.memberId
  const parsed = PushSubscriptionRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }))
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Invalid push subscription payload.',
      extensions: { errors },
    })
  }

  const id = await upsertPushSubscription({
    memberId,
    endpoint: parsed.data.endpoint,
    keysAuth: parsed.data.keys.auth,
    keysP256dh: parsed.data.keys.p256dh,
    userAgent: req.headers['user-agent'] ?? null,
  })

  res.status(HttpStatusCode.Ok).json({ ok: true, id })
})

router.delete('/subscribe', async (req: Request, res: Response) => {
  const memberId = req.user!.memberId
  const parsed = PushUnsubscribeRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Invalid unsubscribe payload.',
    })
  }

  const removed = await deletePushSubscriptionByEndpoint(memberId, parsed.data.endpoint)
  if (!removed) {
    return problem({ status: HttpStatusCode.NotFound, detail: 'Subscription not found.' })
  }

  res.status(HttpStatusCode.Ok).json({ ok: true })
})
