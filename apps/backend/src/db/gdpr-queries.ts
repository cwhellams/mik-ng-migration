/**
 * GDPR data-export queries.
 *
 * All functions return raw database rows (possibly with minor transforms such
 * as Buffer → base64 strings) so the export contains the complete record set
 * without going through model-layer pagination or access-control filtering.
 *
 * Security notes:
 *  - token_hash / code_hash / link_token_hash columns are intentionally
 *    excluded because they are security credentials, not personal data.
 *  - passkey public_key (raw bytes) is excluded; the credential metadata
 *    (id, name, device type, last used) is sufficient for a GDPR export.
 *  - push subscription auth/p256dh keys are excluded; they are cryptographic
 *    material used to encrypt push payloads, not personal data.
 */

import { camelCaseNestedRows, camelDb } from './connection.ts'
import { sql } from 'kysely'
import { jsonArrayFrom } from 'kysely/helpers/postgres'

// ─── Flight logs (all crew roles) ────────────────────────────────────────────

export async function getGdprFlightLogs(memberId: string) {
  return camelDb
    .selectFrom('flight.logs')
    .selectAll()
    .where((eb) =>
      eb.or([
        eb('billableMemberId', '=', memberId),
        eb('picMemberId', '=', memberId),
        eb('crew2MemberId', '=', memberId),
        eb('crew3MemberId', '=', memberId),
        eb('crew4MemberId', '=', memberId),
      ]),
    )
    .orderBy('offBlockTimeEpoch', 'desc')
    .execute()
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function getGdprBookings(memberId: string) {
  return camelDb
    .selectFrom('schedule.bookings')
    .selectAll()
    .where('memberId', '=', memberId)
    .orderBy('startTimeEpoch', 'desc')
    .execute()
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function getGdprInvoices(memberId: string) {
  return camelDb
    .selectFrom('accts.invoice')
    .selectAll()
    .where('memberId', '=', memberId)
    .orderBy('sentAt', 'desc')
    .execute()
}

// ─── Annual fees ──────────────────────────────────────────────────────────────

export async function getGdprAnnualFees(memberId: string) {
  return camelDb
    .selectFrom('member.annualFees')
    .selectAll()
    .where('memberId', '=', memberId)
    .orderBy('year', 'desc')
    .execute()
}

// ─── Shop orders (with items) ─────────────────────────────────────────────────

export async function getGdprShopOrders(memberId: string) {
  const orders = await camelDb
    .selectFrom('shop.orders')
    .selectAll()
    .where('memberId', '=', memberId)
    .orderBy('createdAt', 'desc')
    .execute()

  if (orders.length === 0) return []

  const orderIds = orders.map((o) => o.orderId)
  const items = await camelDb
    .selectFrom('shop.orderItems')
    .selectAll()
    .where('orderId', 'in', orderIds)
    .execute()

  const itemsByOrderId = new Map<string, typeof items>()
  for (const item of items) {
    const list = itemsByOrderId.get(item.orderId) ?? []
    list.push(item)
    itemsByOrderId.set(item.orderId, list)
  }

  return orders.map((o) => ({
    ...o,
    items: itemsByOrderId.get(o.orderId) ?? [],
  }))
}

// ─── Prepaid packages (with usage log) ───────────────────────────────────────

export async function getGdprPrepaidPackages(memberId: string) {
  const packages = await camelDb
    .selectFrom('prepaid.memberPackages')
    .selectAll()
    .where('memberId', '=', memberId)
    .orderBy('createdAt', 'desc')
    .execute()

  if (packages.length === 0) return []

  const packageIds = packages.map((p) => p.memberPackageId)
  const usageLogs = await camelDb
    .selectFrom('prepaid.usageLog')
    .selectAll()
    .where('memberPackageId', 'in', packageIds)
    .orderBy('appliedAt', 'desc')
    .execute()

  const usageByPackageId = new Map<number, typeof usageLogs>()
  for (const log of usageLogs) {
    const list = usageByPackageId.get(log.memberPackageId) ?? []
    list.push(log)
    usageByPackageId.set(log.memberPackageId, list)
  }

  return packages.map((p) => ({
    ...p,
    usageLog: usageByPackageId.get(p.memberPackageId) ?? [],
  }))
}

// ─── Training / DTO ───────────────────────────────────────────────────────────

export async function getGdprTraining(memberId: string) {
  const [syllabi, hilQueue] = await Promise.all([
    camelDb
      .selectFrom('dto.memberSyllabus')
      .selectAll()
      .where('memberId', '=', memberId)
      .orderBy('assignedAt', 'desc')
      .execute(),
    camelDb
      .selectFrom('dto.hilQueue')
      .selectAll()
      .where('memberId', '=', memberId)
      .orderBy('openedAt', 'desc')
      .execute(),
  ])
  return { syllabi, hilQueue }
}

// ─── Exam attempts ────────────────────────────────────────────────────────────

export async function getGdprExamAttempts(memberId: string) {
  return camelDb
    .selectFrom('exam.attempts')
    .selectAll()
    .where('memberId', '=', memberId)
    .orderBy('createdAt', 'desc')
    .execute()
}

// ─── Authentication / login events ───────────────────────────────────────────

export async function getGdprLoginEvents(memberId: string) {
  return camelDb
    .selectFrom('member.loginEvents')
    .selectAll()
    .where('memberId', '=', memberId)
    .orderBy('createdAt', 'desc')
    .execute()
}

// ─── Passkeys (without raw public key bytes) ──────────────────────────────────

export async function getGdprPasskeys(memberId: string) {
  return camelDb
    .selectFrom('member.passkeys')
    .select([
      'id',
      'memberId',
      'credentialId',
      'counter',
      'transports',
      'deviceType',
      'backedUp',
      'name',
      'lastUsedAt',
      'createdAt',
      // public_key intentionally excluded – it is a raw cryptographic key,
      // not personal data, and would produce unreadable binary in JSON output.
    ])
    .where('memberId', '=', memberId)
    .orderBy('createdAt', 'desc')
    .execute()
}

// ─── Push subscriptions (without raw auth/p256dh key material) ───────────────

export async function getGdprPushSubscriptions(memberId: string) {
  return camelDb
    .selectFrom('member.pushSubscriptions')
    .select(['id', 'memberId', 'endpoint', 'userAgent', 'createdAt'])
    .where('memberId', '=', memberId)
    .orderBy('createdAt', 'desc')
    .execute()
}

// ─── Pending email changes (without token hash) ───────────────────────────────

export async function getGdprPendingEmailChanges(memberId: string) {
  return (
    camelDb
      .selectFrom('member.pendingEmailChanges')
      .select(['id', 'memberId', 'newEmail', 'createdAt', 'expiresAt', 'usedAt'])
      // token_hash intentionally excluded – it is a security credential
      .where('memberId', '=', memberId)
      .orderBy('createdAt', 'desc')
      .execute()
  )
}

// ─── Incident / occurrence reports ────────────────────────────────────────────

export async function getGdprIncidentReports(memberId: string) {
  const rows = await camelDb
    .selectFrom('flight.occurrences as o')
    .selectAll('o')
    .select((eb) =>
      jsonArrayFrom(
        // includes attachments hidden by an SMS processor: this is the member's own
        // subject-access export, not the SMS-facing view, so nothing is withheld
        eb
          .selectFrom('flight.occurrenceAttachments as att')
          .selectAll('att')
          .whereRef('att.reportId', '=', 'o.reportId'),
      ).as('attachments'),
    )
    .where((eb) =>
      eb.or([
        eb('o.createdBy', '=', memberId),
        eb.exists(
          eb
            .selectFrom('flight.occurrenceAccess as a')
            .select(sql`1`.as('one'))
            .whereRef('a.reportId', '=', 'o.reportId')
            .where('a.memberId', '=', memberId),
        ),
      ]),
    )
    .distinctOn('o.reportId')
    .orderBy('o.reportId')
    .execute()

  // The nested attachments come out of Postgres snake_case (see camelCaseNestedRows),
  // so without this the member's data export mixes camelCase fields with snake_case
  // ones inside `attachments`.
  return rows.map((row) => ({
    ...row,
    attachments: camelCaseNestedRows(row.attachments),
  }))
}

// ─── Profile audit trail ──────────────────────────────────────────────────────

export async function getGdprProfileAuditTrail(memberId: string) {
  return camelDb
    .selectFrom('member.registerAudit')
    .selectAll()
    .where('memberId', '=', memberId)
    .orderBy('changedAt', 'desc')
    .execute()
}

// ─── Flight-log audit trail (for flights the member was crew on) ──────────────

export async function getGdprFlightLogAuditTrail(memberId: string) {
  return camelDb
    .selectFrom('flight.logsAudit as la')
    .selectAll('la')
    .innerJoin('flight.logs as fl', 'la.flightId', 'fl.flightId')
    .where((eb) =>
      eb.or([
        eb('fl.billableMemberId', '=', memberId),
        eb('fl.picMemberId', '=', memberId),
        eb('fl.crew2MemberId', '=', memberId),
        eb('fl.crew3MemberId', '=', memberId),
        eb('fl.crew4MemberId', '=', memberId),
      ]),
    )
    .orderBy('la.changedAt', 'desc')
    .execute()
}
