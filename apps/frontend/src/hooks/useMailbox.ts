import { MailboxMessage } from '@mik/contracts/mailbox'
import useApi from './useApi'

/**
 * Lightweight hook for just the unread count (e.g. the header profile-menu badge).
 * Pass `enabled: false` (e.g. while logged out) to skip fetching entirely.
 */
export const useMailboxUnreadCount = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const { data, mutate } = useApi<{ count: number }>(
    { url: 'v1/mailbox/unread-count', skipFetch: !enabled },
    // Refresh on focus so the unread badge stays current when switching tabs.
    { revalidateOnFocus: true },
  )

  return {
    unreadCount: data?.count ?? 0,
    mutate,
  }
}

/** Pass `enabled: false` (e.g. while logged out) to skip fetching entirely. */
export const useMailbox = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const {
    data: messages,
    isLoading,
    mutate,
    mutation,
  } = useApi<MailboxMessage[]>(
    { url: 'v1/mailbox', skipFetch: !enabled },
    // Refresh on focus so the unread badge stays current when switching tabs.
    { revalidateOnFocus: true },
  )

  const { unreadCount: unreadCountValue, mutate: mutateUnreadCount } = useMailboxUnreadCount({
    enabled,
  })

  const markRead = async (id: string) => {
    const { error } = await mutation.trigger('PATCH', undefined, `${id}/read`)
    if (!error) {
      await Promise.all([mutate(), mutateUnreadCount()])
    }
    return { error }
  }

  const markAllRead = async () => {
    const { error } = await mutation.trigger('PATCH', undefined, 'read-all')
    if (!error) {
      await Promise.all([mutate(), mutateUnreadCount()])
    }
    return { error }
  }

  return {
    messages: messages ?? [],
    unreadCount: unreadCountValue,
    isLoading,
    markRead,
    markAllRead,
  }
}
