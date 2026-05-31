import { Router } from 'express'
import type { Request, Response } from 'express'

import {
  type MemberListResponse,
  type Member,
  MIKPermissions,
  MemberProfileSchema,
  MemberSchema,
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
} from './models.ts'
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
} from '../../db/member-queries.ts'
import { getInvoices } from '../../db/invoicing-queries.ts'
import { getFlightLogs } from '../../db/flight-log-queries.ts'
import type { InvoiceListResponse } from '../invoicing/models.ts'
import type { FlightLogListResponse } from '../flight-log/models.ts'
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
  getGdprPendingEmailChanges,
  getGdprIncidentReports,
  getGdprProfileAuditTrail,
  getGdprFlightLogAuditTrail,
} from '../../db/gdpr-queries.ts'
import { db } from '../../db/connection.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { UpsertSchema } from '../../types/schema.ts'
import { RegisterRequestSchema } from '../auth/schema.ts'
import type { JWTUser } from '../auth/token.ts'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import { sendEmail } from '../../lib/sendGmail.ts'
import {
  membershipApprovedEmailBodyHtml,
  membershipApprovedEmailSubject,
} from '../../templates/registrationEmailTemplate.ts'
import {
  memberRemovedEmailSubject,
  memberRemovedEmailBodyHtml,
  dtoStudentRemovedEmailSubject,
  dtoStudentRemovedEmailBodyHtml,
} from '../../templates/memberRemovedEmailTemplate.ts'
import {
  nonRenewalReminderEmailSubject,
  nonRenewalReminderEmailBodyHtml,
} from '../../templates/nonRenewalReminderEmailTemplate.ts'
import {
  newMemberEmailSubject,
  newMemberEmailBodyHtml,
} from '../../templates/newMemberEmailTemplate.ts'
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
import {
  emailChangeVerifySubject,
  emailChangeVerifyBodyHtml,
} from '../../templates/emailChangeVerifyTemplate.ts'
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
  if (!current?.brevo_contact_id) return null
  return {
    brevoContactId: Number(current.brevo_contact_id),
    oldLists: (current.mailing_lists as string[] | null) ?? [],
    newLists: newLists ?? [],
  }
}

/** Apply mailing list diff to Brevo (call AFTER DB update) */
async function applyMailingListSync(syncData: MailingListSyncData): Promise<void> {
  if (!syncData) return
  const { brevoContactId, oldLists, newLists } = syncData
  const added = newLists.filter(id => !oldLists.includes(id))
  const removed = oldLists.filter(id => !newLists.includes(id))

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
      ...addedNumeric.map(id => addContactToMailingList(brevoContactId, id)),
      ...removedNumeric.map(id => removeContactFromMailingList(brevoContactId, id)),
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
      totalAutoRenewEquipmentFee: members.filter(m => m.autoRenewEquipmentFee === true).length,
      year,
    }

    res.status(HttpStatusCode.Ok).json(stats)
  },
)

const rolesForNewMember = (memberType: MIKMemberTypes): string[] => {
  if (memberType === MIKMemberTypes.FLYING || memberType === MIKMemberTypes.JUNIOR) {
    return ['MEMBER', 'FLYING_MEMBER']
  } else if (memberType === MIKMemberTypes.NONFLYING || memberType === MIKMemberTypes.HONORARY) {
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

    // skip integrations during migration
    const createSimplbooks = req.headers['x-mik-migration'] !== 'true'

    const approval = await setMembershipApproval(memberId, req.user!.memberId, createSimplbooks)
    if (createSimplbooks) {
      sendEmail(
        approval.email,
        membershipApprovedEmailSubject(approval.lang),
        membershipApprovedEmailBodyHtml(approval.lang, { firstName: approval.firstName }),
      )
    } else {
      console.log(`Skipping sending approval email to ${approval.email} due to migration flag`)
    }

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

router.patch(
  '/me',
  // anyone can update their own (limited) details
  validateUser(),
  async (req: Request, res: Response<Member>): Promise<void> => {
    // only subset of member fields are editable here, the rest are skipped
    const patch = MemberProfileSchema.partial().parse(req.body)

    const mailingListSync = await captureMailingListSyncData(req.user!.memberId, patch.mailingLists)

    await updateMember(req.user?.memberId!, patch, req.user!)

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

    sendEmail(
      normalizedEmail,
      emailChangeVerifySubject(member.lang),
      emailChangeVerifyBodyHtml(member.lang, {
        firstName: member.firstName,
        newEmail: normalizedEmail,
        href,
      }),
    )

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

    await updateMember(req.user!.memberId, { email: claimed.new_email }, req.user!)

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
      .map(s => s.trim())
      .filter(Boolean)
      .map(entry => {
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
        roles: roles.map(role => ({ ...role, permissions: [] })),
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
          await sendEmail(
            secretary.email,
            newMemberEmailSubject(secretary.lang),
            newMemberEmailBodyHtml(secretary.lang, {
              firstName: secretary.first,
              href,
            }),
          )
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

    sendEmail(
      member.email,
      nonRenewalReminderEmailSubject(member.lang),
      nonRenewalReminderEmailBodyHtml(member.lang, { firstName: member.firstName, year }),
    )

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
    const invoices = rawItems.map(row => ({
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
      billableMemberId: memberId,
      limit: 10,
      orderLatestFirst: true,
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

    const patch = MemberSchema.partial().parse(req.body)

    const mailingListSync = await captureMailingListSyncData(memberId, patch.mailingLists)

    const updated = await updateMember(memberId, patch, req.user!)
    if (!updated) {
      return problem({ status: 404 })
    }

    await applyMailingListSync(mailingListSync)

    const member = await getMemberById(memberId)
    res.status(200).json(member)
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
  sendEmail(
    member.email,
    memberRemovedEmailSubject(member.lang),
    memberRemovedEmailBodyHtml(member.lang, { firstName: member.firstName }),
  )

  // If DTO student, notify koulutus@mik.fi
  if (member.isTrainingProgramPilot) {
    const dtoEmail = process.env.DTO_NOTIFICATION_EMAIL ?? 'koulutus@mik.fi'
    sendEmail(
      dtoEmail,
      dtoStudentRemovedEmailSubject(MIKLang.FI),
      dtoStudentRemovedEmailBodyHtml(MIKLang.FI, {
        firstName: member.firstName,
        lastName: member.lastName,
        memberId: member.memberId,
      }),
    )
  }

  const unpaidFees = await getUnpaidMembershipFeesForYear(memberId, currentYear)

  // Create credit notes for unpaid fees
  if (!hasBillableFlights && unpaidFees.length > 0) {
    for (const fee of unpaidFees) {
      if (fee.pmt_ref) {
        await db
          .insertInto('accts.outbox_simplbooks')
          .values({
            id: randomUUID(),
            event_type: SimplbooksEventType.CREDIT_NOTE,
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
