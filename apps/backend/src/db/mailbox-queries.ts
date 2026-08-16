import { noExtraKeys } from './rowToContract.ts'
import { db } from './connection.ts'

export type MailboxSeverity = 'info' | 'warning' | 'error' | 'success'

export type MailboxMessageRow = {
  id: string
  recipientId: string
  type: string
  severity: MailboxSeverity
  title: string
  body: string | null
  createdAt: string
  readAt: string | null
}

const mapRow = (r: {
  id: string
  recipientId: string
  type: string
  severity: string
  title: string
  body: string | null
  createdAt: Date | string
  readAt: Date | string | null
}): MailboxMessageRow =>
  noExtraKeys({
    ...r,
    severity: r.severity as MailboxSeverity,
    createdAt: new Date(r.createdAt).toISOString(),
    readAt: r.readAt ? new Date(r.readAt).toISOString() : null,
  })

export const DEFAULT_MAILBOX_LIST_LIMIT = 200

/** List a member's own mailbox messages, newest first. */
export async function getMessagesForMember(
  memberId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<MailboxMessageRow[]> {
  const { limit = DEFAULT_MAILBOX_LIST_LIMIT, offset = 0 } = options
  const rows = await db
    .selectFrom('member.mailboxMessages')
    .select(['id', 'recipientId', 'type', 'severity', 'title', 'body', 'createdAt', 'readAt'])
    .where('recipientId', '=', memberId)
    .where('expiresAt', '>', new Date())
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .offset(offset)
    .execute()
  return rows.map(mapRow)
}

/** Count of unread messages for a member, used for the profile-menu badge. */
export async function getUnreadCountForMember(memberId: string): Promise<number> {
  const result = await db
    .selectFrom('member.mailboxMessages')
    .select((eb) => eb.fn.countAll().as('count'))
    .where('recipientId', '=', memberId)
    .where('readAt', 'is', null)
    .where('expiresAt', '>', new Date())
    .executeTakeFirstOrThrow()
  return Number(result.count)
}

/**
 * Mark a single message read. Idempotent: marking an already-read message still
 * returns true. Returns false only if the message doesn't exist or isn't owned
 * by this member.
 */
export async function markMessageRead(messageId: string, memberId: string): Promise<boolean> {
  const result = await db
    .updateTable('member.mailboxMessages')
    .set({ readAt: new Date() })
    .where('id', '=', messageId)
    .where('recipientId', '=', memberId)
    .where('readAt', 'is', null)
    .executeTakeFirst()
  if (Number(result.numUpdatedRows) > 0) {
    return true
  }

  const existing = await db
    .selectFrom('member.mailboxMessages')
    .select('id')
    .where('id', '=', messageId)
    .where('recipientId', '=', memberId)
    .executeTakeFirst()
  return existing !== undefined
}

/** Mark every unread message read for a member. */
export async function markAllMessagesRead(memberId: string): Promise<void> {
  await db
    .updateTable('member.mailboxMessages')
    .set({ readAt: new Date() })
    .where('recipientId', '=', memberId)
    .where('readAt', 'is', null)
    .execute()
}

export type CreateMailboxMessageInput = {
  recipientId: string
  type: string
  severity: MailboxSeverity
  title: string
  body?: string | null
  /** Prevents duplicate messages for the same event (e.g. one per member per month). */
  dedupKey?: string | null
}

/**
 * Store a system-generated message for a member. This is purely a store-and-display
 * mechanism — callers are responsible for deciding when a notification is warranted
 * and for sending it through any other channel (email, WhatsApp, etc.) themselves.
 *
 * Idempotent when `dedupKey` is given: inserting the same key again is a no-op.
 */
export async function createMailboxMessage(input: CreateMailboxMessageInput): Promise<void> {
  await db
    .insertInto('member.mailboxMessages')
    .values({
      recipientId: input.recipientId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      body: input.body ?? null,
      dedupKey: input.dedupKey ?? null,
    })
    .onConflict((oc) => oc.columns(['recipientId', 'dedupKey']).doNothing())
    .execute()
}

/** Delete messages past their TTL. Returns the number of rows removed. */
export async function deleteExpiredMailboxMessages(): Promise<number> {
  const result = await db
    .deleteFrom('member.mailboxMessages')
    .where('expiresAt', '<', new Date())
    .executeTakeFirst()
  return Number(result.numDeletedRows)
}
