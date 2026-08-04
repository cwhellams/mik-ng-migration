import { MailboxMessage } from '@backend/routes/mailbox/models'
import useApi from './useApi'

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

  const { data: unreadCountData, mutate: mutateUnreadCount } = useApi<{ count: number }>(
    { url: 'v1/mailbox/unread-count', skipFetch: !enabled },
    { revalidateOnFocus: true },
  )

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
    unreadCount: unreadCountData?.count ?? 0,
    isLoading,
    markRead,
    markAllRead,
  }
}
