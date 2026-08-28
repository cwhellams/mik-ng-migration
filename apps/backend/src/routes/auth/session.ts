/**
 * Active-session management (#1234).
 *
 * Mounted twice from routes/members/api.ts, exactly as memberPasskeysRouter is:
 * at `/me/sessions` for your own sessions and at `/:memberId/sessions` for an
 * admin looking at somebody else's. Visibility is the same self-or-admin rule
 * the passkeys card uses -- MEMBER_ADMIN, or it is your own profile.
 *
 * What these routes can and cannot promise is worth stating plainly, because the
 * UI repeats it to the member: terminating a session takes effect when the
 * device next exchanges its refresh token, so it is bounded by the 15-minute
 * access-token life rather than instant. See routes/auth/login.ts's `/refresh`,
 * which is where revocation is actually enforced, and the sessions migration for
 * why it is enforced there and nowhere else.
 */

import { MIKPermissions } from '@mik/contracts/members'
import {
  SessionIdSchema,
  type RevokeOthersResponse,
  type Session,
  type SessionListResponse,
} from '@mik/contracts/session'
import { Router, type Request, type Response } from 'express'

import { createLoginEvent } from '../../db/auth-queries.ts'
import {
  getActiveSessionsForMember,
  getSessionById,
  revokeOtherSessions,
  revokeSession,
  type SessionRow,
} from '../../db/session-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { deviceLabel } from '../../util/deviceLabel.ts'

export const memberSessionsRouter = Router({ mergeParams: true })

/** The shape passkey.ts's sibling routes already answer denials with. */
type ErrorBody = { error: string }

type Requester = {
  memberId: string
  permissions: MIKPermissions[]
  /** The requester's own session, from the access token's `sid` claim. */
  sid?: string
}

const requesterOf = (req: Request<Record<string, string>>): Requester => req.user as Requester

/**
 * Resolve whose sessions this request is about, mirroring memberPasskeysRouter's
 * rule so the two cards on the same profile can never disagree about who may see
 * what. Returns null when the caller is asking about somebody else without
 * MEMBER_ADMIN, which the callers turn into a 403.
 */
const resolveTarget = (
  req: Request<Record<string, string>>,
): { targetMemberId: string; isSelf: boolean; isAdmin: boolean } | null => {
  const user = requesterOf(req)
  const requested = req.params.memberId
  const isSelf = !requested || requested === 'me' || requested === user.memberId
  const isAdmin = user.permissions.includes(MIKPermissions.MEMBER_ADMIN)

  if (isSelf) {
    return { targetMemberId: user.memberId, isSelf, isAdmin }
  }
  if (!isAdmin) {
    return null
  }
  return { targetMemberId: requested, isSelf, isAdmin }
}

const toDto = (row: SessionRow, currentSessionId: string | undefined): Session => ({
  id: row.id,
  ipAddress: row.ipAddress,
  userAgent: row.userAgent,
  device: deviceLabel(row.userAgent),
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
  // Compared against the *requester's* session, never the target's. An admin
  // reading someone else's list is on none of those devices, so every row there
  // is correctly not current.
  isCurrent: Boolean(currentSessionId) && row.id === currentSessionId,
})

memberSessionsRouter.get(
  '/',
  validateUser(),
  async (req: Request<Record<string, string>>, res: Response<SessionListResponse | ErrorBody>) => {
    const target = resolveTarget(req)
    if (!target) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const sessions = await getActiveSessionsForMember(target.targetMemberId)
    res.json({ sessions: sessions.map((row) => toDto(row, requesterOf(req).sid)) })
  },
)

memberSessionsRouter.delete(
  '/:sessionId',
  validateUser(),
  async (req: Request<Record<string, string>>, res: Response) => {
    const user = requesterOf(req)
    const target = resolveTarget(req)
    if (!target) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Ending your own current session is /logout's job, not this route's:
    // logout already clears the cookies as well, and keeping DELETE disjoint
    // from "the session I am calling from" means it never has to touch the
    // caller's cookies at all. The card also disables the button on that row,
    // but this is the check that actually holds.
    if (user.sid && req.params.sessionId === user.sid) {
      return res.status(409).json({ error: 'Use logout to end the current session' })
    }

    // Check the shape before the lookup. The id column is a UUID, so anything
    // that is not one makes Postgres raise on the comparison and turns a
    // mistyped URL into a 500 rather than a 404.
    if (!SessionIdSchema.safeParse(req.params.sessionId).success) {
      return res.status(404).json({ error: 'Session not found' })
    }

    // Look the row up first so the audit entry is attributed to the session's
    // real owner rather than to whoever is calling, and so an unknown id is a
    // 404 instead of a silent success.
    const session = await getSessionById(req.params.sessionId)
    if (!session || session.memberId !== target.targetMemberId) {
      return res.status(404).json({ error: 'Session not found' })
    }

    const revoked = await revokeSession(
      session.id,
      target.isSelf ? 'user_terminated' : 'admin_terminated',
    )
    if (!revoked) {
      // Already revoked. Nothing changed, and the row is not in the active list
      // the caller was looking at, so it reads as gone either way.
      return res.status(404).json({ error: 'Session not found' })
    }

    await createLoginEvent(
      session.memberId,
      'session_terminated',
      req.ip,
      req.headers['user-agent'],
    )

    res.json({ ok: true })
  },
)

memberSessionsRouter.post(
  '/revoke-others',
  validateUser(),
  async (req: Request<Record<string, string>>, res: Response<RevokeOthersResponse | ErrorBody>) => {
    const user = requesterOf(req)
    const target = resolveTarget(req)
    if (!target) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // "Others" is relative to the caller. Acting on yourself, that means every
    // session but the one you are sitting in; an admin acting on another member
    // is on none of that member's devices, so there is no session to spare and
    // all of them go.
    const revokedCount = await revokeOtherSessions(
      target.targetMemberId,
      target.isSelf ? (user.sid ?? null) : null,
      'bulk_logout_others',
    )

    await createLoginEvent(
      target.targetMemberId,
      'sessions_bulk_revoked',
      req.ip,
      req.headers['user-agent'],
    )

    res.json({ ok: true, revokedCount })
  },
)
