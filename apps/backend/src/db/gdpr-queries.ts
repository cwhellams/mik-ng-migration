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

import { db } from './connection.ts'
import { sql } from 'kysely'

// ─── Flight logs (all crew roles) ────────────────────────────────────────────

export async function getGdprFlightLogs(memberId: string) {
  return db
    .selectFrom('flight.logs')
    .selectAll()
    .where((eb) =>
      eb.or([
        eb('billable_member_id', '=', memberId),
        eb('pic_member_id', '=', memberId),
        eb('crew2_member_id', '=', memberId),
        eb('crew3_member_id', '=', memberId),
        eb('crew4_member_id', '=', memberId),
      ]),
    )
    .orderBy('off_block_time_epoch', 'desc')
    .execute()
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function getGdprBookings(memberId: string) {
  return db
    .selectFrom('schedule.bookings')
    .selectAll()
    .where('member_id', '=', memberId)
    .orderBy('start_time_epoch', 'desc')
    .execute()
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function getGdprInvoices(memberId: string) {
  return db
    .selectFrom('accts.invoice')
    .selectAll()
    .where('member_id', '=', memberId)
    .orderBy('sent_at', 'desc')
    .execute()
}

// ─── Annual fees ──────────────────────────────────────────────────────────────

export async function getGdprAnnualFees(memberId: string) {
  return db
    .selectFrom('member.annual_fees')
    .selectAll()
    .where('member_id', '=', memberId)
    .orderBy('year', 'desc')
    .execute()
}

// ─── Shop orders (with items) ─────────────────────────────────────────────────

export async function getGdprShopOrders(memberId: string) {
  const orders = await db
    .selectFrom('shop.orders')
    .selectAll()
    .where('member_id', '=', memberId)
    .orderBy('created_at', 'desc')
    .execute()

  if (orders.length === 0) return []

  const orderIds = orders.map((o) => o.order_id)
  const items = await db
    .selectFrom('shop.order_items')
    .selectAll()
    .where('order_id', 'in', orderIds)
    .execute()

  const itemsByOrderId = new Map<string, typeof items>()
  for (const item of items) {
    const list = itemsByOrderId.get(item.order_id) ?? []
    list.push(item)
    itemsByOrderId.set(item.order_id, list)
  }

  return orders.map((o) => ({
    ...o,
    items: itemsByOrderId.get(o.order_id) ?? [],
  }))
}

// ─── Prepaid packages (with usage log) ───────────────────────────────────────

export async function getGdprPrepaidPackages(memberId: string) {
  const packages = await db
    .selectFrom('prepaid.member_packages')
    .selectAll()
    .where('member_id', '=', memberId)
    .orderBy('created_at', 'desc')
    .execute()

  if (packages.length === 0) return []

  const packageIds = packages.map((p) => p.member_package_id)
  const usageLogs = await db
    .selectFrom('prepaid.usage_log')
    .selectAll()
    .where('member_package_id', 'in', packageIds)
    .orderBy('applied_at', 'desc')
    .execute()

  const usageByPackageId = new Map<number, typeof usageLogs>()
  for (const log of usageLogs) {
    const list = usageByPackageId.get(log.member_package_id) ?? []
    list.push(log)
    usageByPackageId.set(log.member_package_id, list)
  }

  return packages.map((p) => ({
    ...p,
    usageLog: usageByPackageId.get(p.member_package_id) ?? [],
  }))
}

// ─── Training / DTO ───────────────────────────────────────────────────────────

export async function getGdprTraining(memberId: string) {
  const [syllabi, hilQueue] = await Promise.all([
    db
      .selectFrom('dto.member_syllabus')
      .selectAll()
      .where('member_id', '=', memberId)
      .orderBy('assigned_at', 'desc')
      .execute(),
    db
      .selectFrom('dto.hil_queue')
      .selectAll()
      .where('member_id', '=', memberId)
      .orderBy('opened_at', 'desc')
      .execute(),
  ])
  return { syllabi, hilQueue }
}

// ─── Exam attempts ────────────────────────────────────────────────────────────

export async function getGdprExamAttempts(memberId: string) {
  return db
    .selectFrom('exam.attempts')
    .selectAll()
    .where('member_id', '=', memberId)
    .orderBy('created_at', 'desc')
    .execute()
}

// ─── Authentication / login events ───────────────────────────────────────────

export async function getGdprLoginEvents(memberId: string) {
  return db
    .selectFrom('member.login_events')
    .selectAll()
    .where('member_id', '=', memberId)
    .orderBy('created_at', 'desc')
    .execute()
}

// ─── Passkeys (without raw public key bytes) ──────────────────────────────────

export async function getGdprPasskeys(memberId: string) {
  return db
    .selectFrom('member.passkeys')
    .select([
      'id',
      'member_id',
      'credential_id',
      'counter',
      'transports',
      'device_type',
      'backed_up',
      'name',
      'last_used_at',
      'created_at',
      // public_key intentionally excluded – it is a raw cryptographic key,
      // not personal data, and would produce unreadable binary in JSON output.
    ])
    .where('member_id', '=', memberId)
    .orderBy('created_at', 'desc')
    .execute()
}

// ─── Push subscriptions (without raw auth/p256dh key material) ───────────────

export async function getGdprPushSubscriptions(memberId: string) {
  return db
    .selectFrom('member.push_subscriptions')
    .select(['id', 'member_id', 'endpoint', 'user_agent', 'created_at'])
    .where('member_id', '=', memberId)
    .orderBy('created_at', 'desc')
    .execute()
}

// ─── Pending email changes (without token hash) ───────────────────────────────

export async function getGdprPendingEmailChanges(memberId: string) {
  return (
    db
      .selectFrom('member.pending_email_changes')
      .select(['id', 'member_id', 'new_email', 'created_at', 'expires_at', 'used_at'])
      // token_hash intentionally excluded – it is a security credential
      .where('member_id', '=', memberId)
      .orderBy('created_at', 'desc')
      .execute()
  )
}

// ─── Incident / occurrence reports ────────────────────────────────────────────

export async function getGdprIncidentReports(memberId: string) {
  return db
    .selectFrom('flight.occurrences as o')
    .selectAll('o')
    .where((eb) =>
      eb.or([
        eb('o.created_by', '=', memberId),
        eb.exists(
          eb
            .selectFrom('flight.occurrence_access as a')
            .select(sql`1`.as('one'))
            .whereRef('a.report_id', '=', 'o.report_id')
            .where('a.member_id', '=', memberId),
        ),
      ]),
    )
    .distinctOn('o.report_id')
    .orderBy('o.report_id')
    .execute()
}

// ─── Profile audit trail ──────────────────────────────────────────────────────

export async function getGdprProfileAuditTrail(memberId: string) {
  return db
    .selectFrom('member.register_audit')
    .selectAll()
    .where('member_id', '=', memberId)
    .orderBy('changed_at', 'desc')
    .execute()
}

// ─── Flight-log audit trail (for flights the member was crew on) ──────────────

export async function getGdprFlightLogAuditTrail(memberId: string) {
  return db
    .selectFrom('flight.logs_audit as la')
    .selectAll('la')
    .innerJoin('flight.logs as fl', 'la.flight_id', 'fl.flight_id')
    .where((eb) =>
      eb.or([
        eb('fl.billable_member_id', '=', memberId),
        eb('fl.pic_member_id', '=', memberId),
        eb('fl.crew2_member_id', '=', memberId),
        eb('fl.crew3_member_id', '=', memberId),
        eb('fl.crew4_member_id', '=', memberId),
      ]),
    )
    .orderBy('la.changed_at', 'desc')
    .execute()
}
