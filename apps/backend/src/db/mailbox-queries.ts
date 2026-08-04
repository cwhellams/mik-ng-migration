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
  recipient_id: string
  type: string
  severity: string
  title: string
  body: string | null
  created_at: Date | string
  read_at: Date | string | null
}): MailboxMessageRow => ({
  id: r.id,
  recipientId: r.recipient_id,
  type: r.type,
  severity: r.severity as MailboxSeverity,
  title: r.title,
  body: r.body,
  createdAt: new Date(r.created_at).toISOString(),
  readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
})

/** List a member's own mailbox messages, newest first. */
export async function getMessagesForMember(memberId: string): Promise<MailboxMessageRow[]> {
  const rows = await db
    .selectFrom('member.mailbox_messages')
    .select(['id', 'recipient_id', 'type', 'severity', 'title', 'body', 'created_at', 'read_at'])
    .where('recipient_id', '=', memberId)
    .where('expires_at', '>', new Date())
    .orderBy('created_at', 'desc')
    .execute()
  return rows.map(mapRow)
}

/** Count of unread messages for a member, used for the profile-menu badge. */
export async function getUnreadCountForMember(memberId: string): Promise<number> {
  const result = await db
    .selectFrom('member.mailbox_messages')
    .select((eb) => eb.fn.countAll().as('count'))
    .where('recipient_id', '=', memberId)
    .where('read_at', 'is', null)
    .where('expires_at', '>', new Date())
    .executeTakeFirstOrThrow()
  return Number(result.count)
}

/** Mark a single message read. Returns false if it doesn't exist or isn't owned by this member. */
export async function markMessageRead(messageId: string, memberId: string): Promise<boolean> {
  const result = await db
    .updateTable('member.mailbox_messages')
    .set({ read_at: new Date() })
    .where('id', '=', messageId)
    .where('recipient_id', '=', memberId)
    .where('read_at', 'is', null)
    .executeTakeFirst()
  return Number(result.numUpdatedRows) > 0
}

/** Mark every unread message read for a member. */
export async function markAllMessagesRead(memberId: string): Promise<void> {
  await db
    .updateTable('member.mailbox_messages')
    .set({ read_at: new Date() })
    .where('recipient_id', '=', memberId)
    .where('read_at', 'is', null)
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
    .insertInto('member.mailbox_messages')
    .values({
      recipient_id: input.recipientId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      body: input.body ?? null,
      dedup_key: input.dedupKey ?? null,
    })
    .onConflict((oc) => oc.columns(['recipient_id', 'dedup_key']).doNothing())
    .execute()
}

/** Delete messages past their TTL. Returns the number of rows removed. */
export async function deleteExpiredMailboxMessages(): Promise<number> {
  const result = await db
    .deleteFrom('member.mailbox_messages')
    .where('expires_at', '<', new Date())
    .executeTakeFirst()
  return Number(result.numDeletedRows)
}
