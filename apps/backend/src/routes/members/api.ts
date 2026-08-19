import { Router } from 'express'
import type { Request, Response } from 'express'

import {
  type MemberListResponse,
  type Member,
  MemberAdminPatchSchema,
  MIKPermissions,
  MemberProfileSchema,
  type MemberListFilters,
  type MemberRolesResponse,
  type MemberRole,
  MemberRoleSchema,
  MIKLang,
  MemberListFiltersSchema,
  type AnnualMembershipStats,
  MIKMemberTypes,
  type NonRenewalListResponse,
  NonRenewalActionType,
  MemberChangeLogFiltersSchema,
  MemberChangeType,
  type MemberChangeLogResponse,
} from '@mik/contracts/members'
import {
  getMemberById,
  getMemberByEmail,
  getAllMemberRoles,
  getMembers,
  updateMember,
  getMemberRoleById,
  updateMemberRole,
  addMemberRole,
  removeMemberRole,
  addMember,
  removeMember,
  setMembershipApproval,
  updateMemberLang,
  getMembersForAnnualMembershipFee,
  updateMemberRoles,
  getMemberRolesByMemberId,
  deactivateMember,
  restoreMember,
  getUnpaidMembershipFeesForYear,
  hasMemberFlownBillableFlightInYear,
  getMembersWithNoOrUnpaidAnnualFee,
  insertNonRenewalAction,
  canMemberBeDeleted,
  setMustUpdateProfileBulk,
  clearMustUpdateProfile,
  getMemberChangeLog,
} from '../../db/member-queries.ts'
import { getInvoices } from '../../db/invoicing-queries.ts'
import { getFlightLogs } from '../../db/flight-log-queries.ts'
import type { InvoiceListResponse } from '@mik/contracts/invoicing'
import type { FlightLogListResponse } from '@mik/contracts/flight-log'
import { cancelAllFutureBookingsForMember } from '../../db/booking-queries.ts'
import {
  getGdprFlightLogs,
  getGdprBookings,
  getGdprInvoices,
  getGdprAnnualFees,
  getGdprShopOrders,
  getGdprPrepaidPackages,
  getGdprTraining,
  getGdprExamAttempts,
  getGdprLoginEvents,
  getGdprPasskeys,
  getGdprPushSubscriptions,
  getGdprPendingEmailChanges,
  getGdprIncidentReports,
  getGdprProfileAuditTrail,
  getGdprFlightLogAuditTrail,
} from '../../db/gdpr-queries.ts'
import { db } from '../../db/connection.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { UpsertSchema } from '@mik/contracts/schema'
import { RegisterRequestSchema, juniorAgeIssues } from '@mik/contracts/auth'
import type { JWTUser } from '../auth/token.ts'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import { sendEmail } from '../../lib/sendGmail.ts'
import { renderEmail } from '../../templates/renderEmail.ts'
import { SimplbooksEventType } from '../../services/simplbooks/models.ts'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  addContactToMailingList,
  removeContactFromMailingList,
  isBrevoConfigured,
} from '../../services/brevo/brevoClient.ts'
import { getMemberForBrevoSync } from '../../db/brevo-sync-queries.ts'
import logger from '../../lib/logger.ts'
import { removeMemberFromBrevo } from '../../workers/brevoSyncWorker.ts'
import { getCurrentYear } from '../../services/simplbooks/simplbooksOutboxHandler.ts'
import { memberPasskeysRouter } from '../auth/passkey.ts'
import { generateMagicLinkToken } from '../auth/magiclink.ts'
import {
  createPendingEmailChange,
  claimPendingEmailChangeByTokenHash,
} from '../../db/email-change-queries.ts'
import dayjs from 'dayjs'

export const router = Router()

// Mount passkey-management subroutes for self (/me/passkeys) and admin (/:memberId/passkeys).
router.use('/me/passkeys', memberPasskeysRouter)
router.use('/:memberId/passkeys', memberPasskeysRouter)

const isMemberAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.MEMBER_ADMIN) ?? false

type MailingListSyncData = {
  brevoContactId: number
  oldLists: string[]
  newLists: string[]
} | null

/** Capture the data needed to sync mailing list changes to Brevo (call BEFORE DB update) */
async function captureMailingListSyncData(
  memberId: string,
  newLists: string[] | null | undefined,
): Promise<MailingListSyncData> {
  if (newLists === undefined || !isBrevoConfigured) return null
  const current = await getMemberForBrevoSync(memberId)
  if (!current?.brevoContactId) return null
  return {
    brevoContactId: Number(current.brevoContactId),
    oldLists: (current.mailingLists as string[] | null) ?? [],
    newLists: newLists ?? [],
  }
}

/** Apply mailing list diff to Brevo (call AFTER DB update) */
async function applyMailingListSync(syncData: MailingListSyncData): Promise<void> {
  if (!syncData) return
  const { brevoContactId, oldLists, newLists } = syncData
  const added = newLists.filter((id) => !oldLists.includes(id))
  const removed = oldLists.filter((id) => !newLists.includes(id))

  const toNumericListIds = (ids: string[]): number[] => {
    const numericIds: number[] = []
    for (const id of ids) {
      const parsed = Number.parseInt(id, 10)
      if (Number.isNaN(parsed)) {
        logger.warn('Ignoring invalid mailing list ID during Brevo sync', { id })
        continue
      }
      numericIds.push(parsed)
    }
    return numericIds
  }

  const addedNumeric = toNumericListIds(added)
  const removedNumeric = toNumericListIds(removed)

  try {
    await Promise.all([
      ...addedNumeric.map((id) => addContactToMailingList(brevoContactId, id)),
      ...removedNumeric.map((id) => removeContactFromMailingList(brevoContactId, id)),
    ])
  } catch (err) {
    logger.error('Failed to sync mailing list changes to Brevo', err)
  }
}

router.get(
  '/annual-membership-stats',
  validateUser(MIKPermissions.INVOICING_ADMIN),
  async (req: Request, res: Response<AnnualMembershipStats>) => {
    const year = req.query.year
      ? Number.parseInt(req.query.year as string)
      : new Date().getFullYear()
    const members = await getMembersForAnnualMembershipFee(year)

    const stats: AnnualMembershipStats = {
      totalAutoRenewMembers: members.length,
      totalAutoRenewEquipmentFee: members.filter((m) => m.autoRenewEquipmentFee === true).length,
      year,
    }

    res.status(HttpStatusCode.Ok).json(stats)
  },
)

/** Longest period the change log can be queried for in one request */
const CHANGE_LOG_MAX_DAYS = 366

router.get(
  '/changelog',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<MemberChangeLogResponse>) => {
    const parsed = MemberChangeLogFiltersSchema.safeParse(req.query)

    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail:
          'Invalid query parameters. startDate and endDate are required in YYYY-MM-DD format.',
        extensions: {
          errors: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        },
      })
    }

    const filters = parsed.data

    if (dayjs(filters.startDate).isAfter(dayjs(filters.endDate), 'day')) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Start date cannot be after end date.',
      })
    }

    if (dayjs(filters.endDate).diff(dayjs(filters.startDate), 'day') > CHANGE_LOG_MAX_DAYS) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `The period cannot be longer than ${CHANGE_LOG_MAX_DAYS} days.`,
      })
    }

    const entries = await getMemberChangeLog(filters)

    res.status(HttpStatusCode.Ok).json({
      entries,
      summary: {
        newMembers: entries.filter((e) => e.changeType === MemberChangeType.APPROVED).length,
        leftMembers: entries.filter(
          (e) =>
            e.changeType === MemberChangeType.LEFT || e.changeType === MemberChangeType.DELETED,
        ).length,
        totalChanges: entries.length,
      },
      filters,
    })
  },
)

const rolesForNewMember = (memberType: MIKMemberTypes): string[] => {
  if (
    memberType === MIKMemberTypes.FLYING ||
    memberType === MIKMemberTypes.JUNIOR ||
    memberType === MIKMemberTypes.HONORARY
  ) {
    return ['MEMBER', 'FLYING_MEMBER']
  } else if (memberType === MIKMemberTypes.NONFLYING) {
    return ['MEMBER']
  } else {
    return []
  }
}

router.post(
  '/:memberId/approve',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<Member>) => {
    const memberId = req.params.memberId

    const approval = await setMembershipApproval(memberId, req.user!.memberId, true)
    const { subject, html } = renderEmail('registration-approved', approval.lang, {
      firstName: approval.firstName,
    })
    sendEmail(approval.email, subject, html)

    // add default roles for the member
    await updateMemberRoles(memberId, rolesForNewMember(approval.memberType), req.user!)

    const roles = await getMemberRolesByMemberId(memberId)

    res.status(HttpStatusCode.Created).json({ ...approval, roles })
  },
)

router.get(
  '/',
  // Only validated members can list other members
  validateUser(MIKPermissions.MEMBER, MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{}, {}, {}, MemberListFilters>, res: Response<MemberListResponse>) => {
    const { role, ...filters } = MemberListFiltersSchema.parse(req.query)

    // either no roles filter, or one/multiple roles
    const roles = role ? (Array.isArray(role) ? role : [role]) : []

    const members = await getMembers(isMemberAdmin(req.user), roles, filters)

    res.status(200).json({
      members: members,
    })
  },
)

router.get(
  '/me',
  // anyone can fetch their own details
  validateUser(),
  async (req: Request, res: Response<Member>) => {
    const member = await getMemberById(req.user!.memberId)
    if (!member) {
      return problem({ status: 404 })
    }
    res.status(200).json(member)
  },
)

// Saving any of these identity/contact fields counts as the member reviewing
// their profile, which clears an admin-set must_update_profile flag.
const MUST_UPDATE_PROFILE_REVIEW_FIELDS = [
  'firstName',
  'lastName',
  'phoneNumber',
  'phoneCountry',
  'streetAddress',
  'postcode',
  'townCity',
  'country',
]

router.patch(
  '/me',
  // anyone can update their own (limited) details
  validateUser(),
  async (req: Request, res: Response<Member>): Promise<void> => {
    // only subset of member fields are editable here, the rest are skipped
    const patch = MemberProfileSchema.partial().parse(req.body)

    // memberType isn't editable here, but dateOfBirth is — a junior member could
    // otherwise self-edit their way out of the age-15-17 window this schema doesn't
    // check without knowing the member's current memberType.
    if ('dateOfBirth' in patch) {
      const existingMember = await getMemberById(req.user!.memberId)
      if (!existingMember) {
        return problem({ status: 404 })
      }
      const ageIssues = juniorAgeIssues(existingMember.memberType, patch.dateOfBirth)
      if (ageIssues.length > 0) {
        return problem({
          status: 400,
          detail: ageIssues[0].message,
          extensions: { errors: ageIssues },
        })
      }
    }

    const mailingListSync = await captureMailingListSyncData(req.user!.memberId, patch.mailingLists)

    await updateMember(req.user?.memberId!, patch, req.user!)

    // Clear the must_update_profile flag only when the user actually saved their
    // profile identity/contact details — not when they merely toggled a mailing
    // list or another incidental field via PATCH /me.
    const reviewedProfile = MUST_UPDATE_PROFILE_REVIEW_FIELDS.some((field) => field in patch)
    if (reviewedProfile) {
      await clearMustUpdateProfile(req.user!.memberId, req.user!)
    }

    await applyMailingListSync(mailingListSync)

    const member = await getMemberById(req.user!.memberId)
    res.status(200).json(member)
  },
)

router.patch('/me/lang', validateUser(), async (req: Request, res: Response): Promise<void> => {
  const validatedLang = z.nativeEnum(MIKLang).parse(req.body.lang)
  await updateMemberLang(req.user?.memberId!, validatedLang, req.user!)
  res.sendStatus(200)
})

// Email change request — sends verification email to the new address
const EmailChangeRequestSchema = z.object({
  newEmail: z.string().email(),
})

router.post(
  '/me/email-change/request',
  validateUser(),
  async (req: Request, res: Response): Promise<void> => {
    const { newEmail } = EmailChangeRequestSchema.parse(req.body)
    const normalizedEmail = newEmail.toLowerCase()

    const member = await getMemberById(req.user!.memberId)
    if (!member) {
      res.status(404).json(problem({ status: 404, detail: 'Member not found' }))
      return
    }

    if (normalizedEmail === member.email) {
      res
        .status(400)
        .json(problem({ status: 400, detail: 'New email is the same as current email' }))
      return
    }

    const existing = await getMemberByEmail(normalizedEmail)
    if (existing) {
      res.status(409).json(problem({ status: 409, detail: 'Email already in use' }))
      return
    }

    const { token, tokenHash } = generateMagicLinkToken()
    const expiresAt = dayjs().add(15, 'minutes').toDate()

    await createPendingEmailChange(req.user!.memberId, normalizedEmail, tokenHash, expiresAt)

    const href = `${process.env.PUBLIC_URL}/profile/email-change/verify?token=${token}`

    const { subject, html } = renderEmail('email-change-verify', member.lang, {
      firstName: member.firstName,
      newEmail: normalizedEmail,
      href,
    })
    sendEmail(normalizedEmail, subject, html)

    logger.info(
      'Email change verification sent to %s for member %s',
      normalizedEmail,
      member.memberId,
    )

    res.sendStatus(204)
  },
)

// Email change verification — applies the email change after token verification
router.post(
  '/me/email-change/verify',
  validateUser(),
  async (req: Request, res: Response<Member>): Promise<void> => {
    const raw: unknown = req.body.token
    if (typeof raw !== 'string' || !raw) {
      res.status(400).json(problem({ status: 400, detail: 'Token is required' }))
      return
    }

    const tokenHash = createHash('sha256').update(raw).digest('hex')
    // memberId is included in the atomic UPDATE to ensure the token is never
    // consumed if the requesting user is not the token owner (prevents cross-member reuse)
    const claimed = await claimPendingEmailChangeByTokenHash(tokenHash, req.user!.memberId)

    if (!claimed) {
      res.status(401).json(problem({ status: 401, detail: 'Invalid or expired verification link' }))
      return
    }

    await updateMember(req.user!.memberId, { email: claimed.newEmail }, req.user!)

    const member = await getMemberById(req.user!.memberId)
    res.status(200).json(member)
  },
)

// returns the available mailing lists configured via AIRCRAFT_MAILING_LISTS env var
router.get(
  '/mailing-lists',
  validateUser(),
  (req: Request, res: Response<{ id: string; name: string }[]>): void => {
    const raw = process.env.AIRCRAFT_MAILING_LISTS ?? ''
    const lists = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const [id, ...rest] = entry.split(':')
        return { id: id.trim(), name: rest.length ? rest.join(':').trim() : id.trim() }
      })
    res.status(200).json(lists)
  },
)

// list roles and permissions
router.get(
  '/roles',
  validateUser(MIKPermissions.MEMBER, MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<MemberRolesResponse>) => {
    if (isMemberAdmin(req.user)) {
      // admin can see all roles and permissions
      res.status(200).json({
        roles: await getAllMemberRoles(),
        permissions: Object.values(MIKPermissions),
      })
    } else {
      // normal users can see only public roles without permissions
      const roles = await getAllMemberRoles(true)
      res.status(200).json({
        roles: roles.map((role) => ({ ...role, permissions: [] })),
        permissions: [],
      })
    }
  },
)

//
// Admin only role routes
//

router.get(
  '/roles/:roleId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ roleId: string }>, res: Response<MemberRole>) => {
    const role = await getMemberRoleById(req.params.roleId)
    if (!role) {
      return problem({ status: 404 })
    }
    res.status(200).json(role)
  },
)

router.patch(
  '/roles/:roleId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ roleId: string }>, res: Response<MemberRole>) => {
    const patch = MemberRoleSchema.partial().parse(req.body)
    const success = await updateMemberRole(req.params.roleId, patch, req.user!)
    if (!success) {
      return problem({ status: 404 })
    }

    const role = await getMemberRoleById(req.params.roleId)
    res.status(200).json(role)
  },
)

router.post(
  '/roles',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<MemberRole>) => {
    const role = UpsertSchema(MemberRoleSchema).parse(req.body)
    const created = await addMemberRole(role, req.user!)

    res.status(200).json(created)
  },
)

router.delete(
  '/roles/:roleId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ roleId: string }>, res: Response) => {
    const success = await removeMemberRole(req.params.roleId)
    if (!success) {
      return problem({ status: 404 })
    }

    res.status(204).end()
  },
)

//
// Admin only member routes
//

router.post(
  '/',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<Member>) => {
    const member = RegisterRequestSchema.parse(req.body)
    const memberId = await addMember(member, req.user)
    const created = await getMemberById(memberId)
    res.status(200).json(created)

    void (async () => {
      try {
        const secretaries = await getMembers(true, ['SECRETARY'], {})
        const href = `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/club/members`
        for (const secretary of secretaries) {
          const { subject, html } = renderEmail('new-member', secretary.lang, {
            firstName: secretary.first,
            href,
          })
          await sendEmail(secretary.email, subject, html)
        }
      } catch (error) {
        logger.error('Failed to send new member notification emails', { error, memberId })
      }
    })()
  },
)

// Specific routes must come before parametric routes
router.get(
  '/trash',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<MemberListResponse>) => {
    // Get all removed members (same as regular list but with showRemoved=true)
    const members = await getMembers(true, [], {
      showRemoved: true,
      showUnapproved: false,
      showExternal: false,
    })

    res.status(200).json({ members })
  },
)

router.get(
  '/non-renewals',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<NonRenewalListResponse>) => {
    const year = req.query.year
      ? Number.parseInt(req.query.year as string)
      : new Date().getFullYear()

    const members = await getMembersWithNoOrUnpaidAnnualFee(year)
    res.status(HttpStatusCode.Ok).json({ members, year })
  },
)

router.post(
  '/:memberId/send-renewal-reminder',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<void>) => {
    const { memberId } = req.params
    const year = new Date().getFullYear()

    const member = await getMemberById(memberId)
    if (!member) {
      return problem({ status: 404, detail: 'Member not found' })
    }

    const { subject, html } = renderEmail('member-nonrenewal-reminder', member.lang, {
      firstName: member.firstName,
      year,
    })
    sendEmail(member.email, subject, html)

    await insertNonRenewalAction(
      memberId,
      NonRenewalActionType.REMINDER_SENT,
      req.user!.memberId,
      `Final renewal reminder email sent for year ${year}`,
    )

    res.status(HttpStatusCode.NoContent).end()
  },
)

router.get(
  '/:memberId/invoices',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<InvoiceListResponse>) => {
    const { memberId } = req.params

    const member = await getMemberById(memberId)
    if (!member) {
      return problem({ status: 404 })
    }

    const rawItems = await getInvoices(req.user!.memberId, true, { memberId })
    const invoices = rawItems.map((row) => ({
      id: String(row.id),
      created_at: row.created_at ? new Date(row.created_at as any).toISOString() : '',
      created_by: row.created_by,
      currency: row.currency === null ? null : String(row.currency),
      description: row.description,
      due_at: new Date(row.due_at as any).toISOString().split('T')[0],
      invoice_type: row.invoice_type as any,
      is_paid: row.is_paid === null ? null : Boolean(row.is_paid),
      member_id: row.member_id,
      paid_at: row.paid_at ? new Date(row.paid_at as any).toISOString() : null,
      pmt_ref: row.pmt_ref,
      sent_at: row.sent_at ? new Date(row.sent_at as any).toISOString().split('T')[0] : null,
      total_sum: row.total_sum === null ? null : String(row.total_sum),
      updated_at: row.updated_at ? new Date(row.updated_at as any).toISOString() : '',
      updated_by: row.updated_by,
    }))

    res.status(200).json({ invoices })
  },
)

router.get(
  '/:memberId/flights',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<FlightLogListResponse>) => {
    const { memberId } = req.params

    const member = await getMemberById(memberId)
    if (!member) {
      return problem({ status: 404 })
    }

    const result = await getFlightLogs({
      anyCrewMemberId: memberId,
      limit: 10,
      orderLatestFirst: true,
      page: 1,
    })
    res.status(200).json(result)
  },
)

router.get(
  '/:memberId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<Member>) => {
    const memberId = req.params.memberId

    const member = await getMemberById(memberId)
    if (member === undefined) {
      return problem({ status: 404 })
    }
    res.status(200).json(member)
  },
)

router.patch(
  '/:memberId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<Member>) => {
    const memberId = req.params.memberId

    const patch = MemberAdminPatchSchema.partial().parse(req.body)

    // Capture current canMakeReservations before update to detect access revocation
    const existingMember = await getMemberById(memberId)
    if (!existingMember) {
      return problem({ status: 404 })
    }

    // memberType and dateOfBirth can each be patched independently (the admin edit UI
    // sends them in separate requests), so RegisterRequestSchema's age check — which only
    // ever sees both together at registration time — can't catch a patch that leaves the
    // member JUNIOR with an out-of-range age. Validate the effective post-patch state.
    const effectiveMemberType = patch.memberType ?? existingMember.memberType
    const effectiveDateOfBirth =
      'dateOfBirth' in patch ? patch.dateOfBirth : existingMember.dateOfBirth
    const ageIssues = juniorAgeIssues(effectiveMemberType, effectiveDateOfBirth)
    if (ageIssues.length > 0) {
      return problem({
        status: 400,
        detail: ageIssues[0].message,
        extensions: { errors: ageIssues },
      })
    }

    if (patch.email) {
      const normalizedEmail = patch.email.toLowerCase()
      if (normalizedEmail !== existingMember.email) {
        const existingByEmail = await getMemberByEmail(normalizedEmail)
        if (existingByEmail && existingByEmail.memberId !== memberId) {
          return problem({ status: 409, detail: 'Email already in use' })
        }
      }
    }

    const mailingListSync = await captureMailingListSyncData(memberId, patch.mailingLists)

    const updated = await updateMember(memberId, patch, req.user!)
    if (!updated) {
      return problem({ status: 404 })
    }

    await applyMailingListSync(mailingListSync)

    // If booking access was revoked, cancel all future bookings
    if (existingMember.canMakeReservations && patch.canMakeReservations === false) {
      const cancelled = await cancelAllFutureBookingsForMember(
        memberId,
        'Booking access revoked',
        req.user!.memberId,
      )
      logger.info(
        `Cancelled ${cancelled} future booking(s) for member ${memberId} due to booking access revocation`,
      )
    }

    const member = await getMemberById(memberId)
    res.status(200).json(member)
  },
)

// Set/clear the must-update-profile flag for one or more members. The single
// admin toggle sends a one-element memberIds array, so this one endpoint covers
// both the per-member and bulk cases. `updated` is the number of rows actually
// changed, letting the client detect ids that no longer exist.
router.post(
  '/must-update-profile',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<{ updated: number }>): Promise<void> => {
    const { memberIds, mustUpdateProfile } = z
      .object({ memberIds: z.array(z.string()).min(1), mustUpdateProfile: z.boolean() })
      .parse(req.body)

    const updated = await setMustUpdateProfileBulk(memberIds, mustUpdateProfile, req.user!)
    res.status(200).json({ updated })
  },
)

router.delete(
  '/:memberId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response) => {
    const memberId = req.params.memberId

    const checkedMember = await getMemberById(memberId)
    if (!checkedMember) {
      return problem({ status: 404 })
    }

    const deletability = await canMemberBeDeleted(memberId)
    if (!deletability.canDelete) {
      return problem({
        status: 400,
        detail: 'Member cannot be deleted due to existing related records',
        extensions: {
          hasInvoices: deletability.hasInvoices,
          hasFlights: deletability.hasFlights,
          hasBookings: deletability.hasBookings,
          hasBrevoId: deletability.hasBrevoId,
        },
      })
    }

    const updated = await removeMember(memberId)
    if (!updated) {
      return problem({ status: 404 })
    }

    res.status(204).end()
  },
)

//
// Member removal/deactivation routes
//

router.post(
  '/:memberId/restore',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<Member>) => {
    const memberId = req.params.memberId

    const member = await getMemberById(memberId)
    if (!member) {
      return problem({ status: 404, detail: 'Member not found' })
    }

    if (member.memberType !== MIKMemberTypes.REMOVED) {
      return problem({ status: 400, detail: 'Member is not in removed state' })
    }

    const restored = await restoreMember(memberId, req.user!.memberId)

    res.status(200).json(restored)
  },
)

router.post(
  '/:memberId/deactivate',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<void>) => {
    const reason = req.body.reason || ('Cancelled by admin' as string)
    const memberId = req.params.memberId
    await cancelMembershipHandler(req, res, memberId, reason)

    // Log to non-renewal tracking table after the response has been sent (best-effort, non-fatal)
    if (res.statusCode === HttpStatusCode.NoContent) {
      insertNonRenewalAction(
        memberId,
        NonRenewalActionType.MEMBERSHIP_CANCELLED,
        req.user!.memberId,
        reason,
      ).catch(() => {
        // Do not propagate tracking errors
      })
    }
  },
)

router.post('/me/cancel-membership', validateUser(), async (req: Request, res: Response<void>) => {
  const reason = 'Self-service membership cancellation'
  const memberId = req.user!.memberId
  return await cancelMembershipHandler(req, res, memberId, reason)
})

// GDPR self-service data export: returns complete member data as JSON
router.get(
  '/me/gdpr-export',
  validateUser(),
  async (req: Request, res: Response): Promise<void> => {
    const memberId = req.user!.memberId

    const member = await getMemberById(memberId)
    if (!member) {
      res.status(404).json(problem({ status: 404, detail: 'Member not found' }))
      return
    }

    // Fetch all data categories in parallel
    const [
      flightLog,
      bookings,
      invoices,
      annualFees,
      shopOrders,
      prepaidPackages,
      training,
      examAttempts,
      authenticationEvents,
      passkeys,
      pushSubscriptions,
      pendingEmailChanges,
      incidentReports,
      profileAuditTrail,
      flightLogAuditTrail,
    ] = await Promise.all([
      getGdprFlightLogs(memberId),
      getGdprBookings(memberId),
      getGdprInvoices(memberId),
      getGdprAnnualFees(memberId),
      getGdprShopOrders(memberId),
      getGdprPrepaidPackages(memberId),
      getGdprTraining(memberId),
      getGdprExamAttempts(memberId),
      getGdprLoginEvents(memberId),
      getGdprPasskeys(memberId),
      getGdprPushSubscriptions(memberId),
      getGdprPendingEmailChanges(memberId),
      getGdprIncidentReports(memberId),
      getGdprProfileAuditTrail(memberId),
      getGdprFlightLogAuditTrail(memberId),
    ])

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: member,
      flightLog,
      bookings,
      invoices,
      annualFees,
      shopOrders,
      prepaidPackages,
      training,
      examAttempts,
      authenticationEvents,
      passkeys,
      pushSubscriptions,
      pendingEmailChanges,
      incidentReports,
      profileAuditTrail,
      flightLogAuditTrail,
    }

    // Sanitize memberId for use in a Content-Disposition filename
    const safeMemberId = memberId.replace(/[^\w-]/g, '_')
    const filename = `mik-data-export-${safeMemberId}.json`
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.status(200).json(exportData)
  },
)

const cancelMembershipHandler = async (
  req: Request,
  res: Response,
  memberId: string,
  reason?: string,
) => {
  const member = await getMemberById(memberId)
  if (!member) {
    return problem({ status: 404, detail: 'Member not found' })
  }

  if (member.memberType === MIKMemberTypes.REMOVED) {
    return problem({ status: 400, detail: 'Member is already removed' })
  }

  // Check if member has any billable flights in the current year; if yes, prevent cancellation
  const currentYear = getCurrentYear()
  const hasBillableFlights = await hasMemberFlownBillableFlightInYear(memberId, currentYear)

  if (hasBillableFlights) {
    return problem({
      status: 400,
      detail: 'Membership cannot be cancelled due to existing billable flights in the current year',
    })
  }

  // Remove from Brevo if applicable - do this before DB update to ensure we have the Brevo Id
  await removeMemberFromBrevo(member)

  // Deactivate in db
  await deactivateMember(memberId, memberId, reason)

  // Cancel future bookings
  await cancelAllFutureBookingsForMember(
    memberId,
    'Booking cancelled due to membership cancellation',
    memberId,
  )

  // Send notification
  const removedEmail = renderEmail('member-removed', member.lang, {
    firstName: member.firstName,
  })
  sendEmail(member.email, removedEmail.subject, removedEmail.html)

  // If DTO student, notify koulutus@mik.fi
  if (member.isTrainingProgramPilot) {
    const dtoEmail = process.env.DTO_NOTIFICATION_EMAIL ?? 'koulutus@mik.fi'
    const dtoNotification = renderEmail('dto-student-removed', MIKLang.FI, {
      firstName: member.firstName,
      lastName: member.lastName,
      memberId: member.memberId,
    })
    sendEmail(dtoEmail, dtoNotification.subject, dtoNotification.html)
  }

  const unpaidFees = await getUnpaidMembershipFeesForYear(memberId, currentYear)

  // Create credit notes for unpaid fees
  if (!hasBillableFlights && unpaidFees.length > 0) {
    for (const fee of unpaidFees) {
      if (fee.pmt_ref) {
        await db
          .insertInto('accts.outboxSimplbooks')
          .values({
            id: randomUUID(),
            eventType: SimplbooksEventType.CREDIT_NOTE,
            payload: {
              memberId: memberId,
              invoiceId: fee.id,
              simplbooksInvoiceId: fee.id,
              reason: 'Self-service membership cancellation',
            },
          })
          .execute()
      }
    }
  }

  res.status(HttpStatusCode.NoContent).end()
}
