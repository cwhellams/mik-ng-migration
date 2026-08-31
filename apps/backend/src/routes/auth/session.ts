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
 *
 * Denials answer with problem() rather than the bare `{ error }` body
 * memberPasskeysRouter uses. The card feeds whatever comes back straight into
 * <SnackAlert>, which renders `detail || title || 'Error'` -- an `{ error }` body
 * has neither field, so every refusal here would reach the member as a bare
 * "Error". That matters most for the 409 on deleting your own current session,
 * whose whole purpose is to tell them to use logout instead.
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
import { problem } from '../response.ts'

export const memberSessionsRouter = Router({ mergeParams: true })

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
  async (req: Request<Record<string, string>>, res: Response<SessionListResponse>) => {
    const target = resolveTarget(req)
    if (!target) {
      return problem({ status: 403, detail: 'You may only view your own sessions' })
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
      return problem({ status: 403, detail: 'You may only manage your own sessions' })
    }

    // Ending your own current session is /logout's job, not this route's:
    // logout already clears the cookies as well, and keeping DELETE disjoint
    // from "the session I am calling from" means it never has to touch the
    // caller's cookies at all. The card also disables the button on that row,
    // but this is the check that actually holds.
    if (user.sid && req.params.sessionId === user.sid) {
      return problem({ status: 409, detail: 'Use logout to end the current session' })
    }

    // Check the shape before the lookup. The id column is a UUID, so anything
    // that is not one makes Postgres raise on the comparison and turns a
    // mistyped URL into a 500 rather than a 404.
    if (!SessionIdSchema.safeParse(req.params.sessionId).success) {
      return problem({ status: 404, detail: 'Session not found' })
    }

    // Look the row up first so the audit entry is attributed to the session's
    // real owner rather than to whoever is calling, and so an unknown id is a
    // 404 instead of a silent success.
    const session = await getSessionById(req.params.sessionId)
    if (!session || session.memberId !== target.targetMemberId) {
      return problem({ status: 404, detail: 'Session not found' })
    }

    const revoked = await revokeSession(
      session.id,
      target.isSelf ? 'user_terminated' : 'admin_terminated',
    )
    if (!revoked) {
      // Already revoked. Nothing changed, and the row is not in the active list
      // the caller was looking at, so it reads as gone either way.
      return problem({ status: 404, detail: 'Session not found' })
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
  async (req: Request<Record<string, string>>, res: Response<RevokeOthersResponse>) => {
    const user = requesterOf(req)
    const target = resolveTarget(req)
    if (!target) {
      return problem({ status: 403, detail: 'You may only manage your own sessions' })
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

    // Only record the event when something was actually revoked, matching the
    // DELETE handler above. A stale card, a retry or a double-click all reach
    // here with nothing left to revoke, and an audit row saying a bulk logout
    // happened alongside revokedCount: 0 tells two different stories.
    if (revokedCount > 0) {
      await createLoginEvent(
        target.targetMemberId,
        'sessions_bulk_revoked',
        req.ip,
        req.headers['user-agent'],
      )
    }

    res.json({ ok: true, revokedCount })
  },
)
