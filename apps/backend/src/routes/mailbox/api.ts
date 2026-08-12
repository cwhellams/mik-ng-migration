import { Router, type Request, type Response } from 'express'
import { HttpStatusCode } from 'axios'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problem } from '../response.ts'
import {
  getMessagesForMember,
  getUnreadCountForMember,
  markAllMessagesRead,
  markMessageRead,
} from '../../db/mailbox-queries.ts'
import { MailboxListQuerySchema, type MailboxMessage } from '@mik/contracts/mailbox'

export const router = Router()

router.use(validateUser(MIKPermissions.MEMBER))

const toApiMessage = (
  m: Awaited<ReturnType<typeof getMessagesForMember>>[number],
): MailboxMessage => ({
  id: m.id,
  type: m.type,
  severity: m.severity,
  title: m.title,
  body: m.body,
  createdAt: m.createdAt,
  readAt: m.readAt,
})

/** List the current member's own mailbox messages, newest first. */
router.get('/', async (req: Request, res: Response<MailboxMessage[]>) => {
  const { limit, offset } = MailboxListQuerySchema.parse(req.query)
  const messages = await getMessagesForMember(req.user!.memberId, { limit, offset })
  res.status(HttpStatusCode.Ok).json(messages.map(toApiMessage))
})

/** Unread count for the current member, used for the profile-menu badge. */
router.get('/unread-count', async (req: Request, res: Response<{ count: number }>) => {
  const count = await getUnreadCountForMember(req.user!.memberId)
  res.status(HttpStatusCode.Ok).json({ count })
})

/** Mark a single message read. Ownership is enforced in the query itself. */
router.patch('/:id/read', async (req: Request, res: Response) => {
  const id = req.params.id as string
  if (!/^\d+$/.test(id)) {
    return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid message id.' })
  }
  const updated = await markMessageRead(id, req.user!.memberId)
  if (!updated) {
    return problem({ status: HttpStatusCode.NotFound, detail: 'Message not found.' })
  }
  res.status(HttpStatusCode.Ok).json({ ok: true })
})

/** Mark every unread message read for the current member. */
router.patch('/read-all', async (req: Request, res: Response) => {
  await markAllMessagesRead(req.user!.memberId)
  res.status(HttpStatusCode.Ok).json({ ok: true })
})
