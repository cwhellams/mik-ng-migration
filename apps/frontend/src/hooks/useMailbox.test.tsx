import type { MailboxMessage } from '@backend/routes/mailbox/models'
import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderHookWithProviders } from '../test/renderWithProviders'
import { useMailbox, useMailboxUnreadCount } from './useMailbox'

const aMessage = (overrides: Partial<MailboxMessage> = {}) =>
  ({
    id: '1',
    subject: 'Annual membership fee',
    body: 'Your invoice is ready.',
    readAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }) as MailboxMessage

/** A mailbox that actually marks messages read, so revalidation is observable. */
const aLiveMailbox = (messages: MailboxMessage[]) => {
  const state = { messages, patches: [] as string[] }
  const unread = () => state.messages.filter((message) => !message.readAt).length

  server.use(
    http.get(apiUrl('v1/mailbox'), () => HttpResponse.json(state.messages)),
    http.get(apiUrl('v1/mailbox/unread-count'), () => HttpResponse.json({ count: unread() })),
    http.patch(apiUrl('v1/mailbox/read-all'), () => {
      state.patches.push('read-all')
      state.messages = state.messages.map((message) => ({ ...message, readAt: 'now' }))
      return HttpResponse.json({ ok: true })
    }),
    http.patch(apiUrl('v1/mailbox/:id/read'), ({ params }) => {
      state.patches.push(String(params.id))
      state.messages = state.messages.map((message) =>
        message.id === params.id ? { ...message, readAt: 'now' } : message,
      )
      return HttpResponse.json({ ok: true })
    }),
  )

  return state
}

describe('useMailboxUnreadCount', () => {
  it('reads the badge count from the API', async () => {
    server.use(http.get(apiUrl('v1/mailbox/unread-count'), () => HttpResponse.json({ count: 3 })))

    const { result } = renderHookWithProviders(() => useMailboxUnreadCount())

    await waitFor(() => expect(result.current.unreadCount).toBe(3))
  })

  it('reports zero before the count arrives, so the badge never flickers NaN', () => {
    const { result } = renderHookWithProviders(() => useMailboxUnreadCount())

    expect(result.current.unreadCount).toBe(0)
  })

  it('reports zero when the endpoint fails', async () => {
    server.use(http.get(apiUrl('v1/mailbox/unread-count'), () => problemResponse(500, 'Down')))

    const { result } = renderHookWithProviders(() => useMailboxUnreadCount())

    await waitFor(() => expect(result.current.unreadCount).toBe(0))
  })

  it('skips the request entirely while disabled', async () => {
    const state = { calls: 0 }
    server.use(
      http.get(apiUrl('v1/mailbox/unread-count'), () => {
        state.calls++
        return HttpResponse.json({ count: 3 })
      }),
    )

    const { result } = renderHookWithProviders(() => useMailboxUnreadCount({ enabled: false }))

    await waitFor(() => expect(result.current.unreadCount).toBe(0))
    expect(state.calls).toBe(0)
  })
})

describe('useMailbox', () => {
  it('returns the messages and the unread count together', async () => {
    aLiveMailbox([aMessage(), aMessage({ id: '2', readAt: 'yesterday' })])

    const { result } = renderHookWithProviders(() => useMailbox())

    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.unreadCount).toBe(1)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns an empty list rather than undefined before loading', () => {
    aLiveMailbox([aMessage()])

    const { result } = renderHookWithProviders(() => useMailbox())

    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })

  it('skips both requests while disabled', async () => {
    const state = { calls: 0 }
    server.use(
      http.get(apiUrl('v1/mailbox'), () => {
        state.calls++
        return HttpResponse.json([])
      }),
      http.get(apiUrl('v1/mailbox/unread-count'), () => {
        state.calls++
        return HttpResponse.json({ count: 0 })
      }),
    )

    const { result } = renderHookWithProviders(() => useMailbox({ enabled: false }))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(state.calls).toBe(0)
  })

  it('marks one message read and refreshes both the list and the badge', async () => {
    const state = aLiveMailbox([aMessage(), aMessage({ id: '2' })])

    const { result } = renderHookWithProviders(() => useMailbox())

    await waitFor(() => expect(result.current.unreadCount).toBe(2))

    const { error } = await result.current.markRead('1')

    expect(error).toBeUndefined()
    expect(state.patches).toEqual(['1'])
    await waitFor(() => expect(result.current.unreadCount).toBe(1))
    expect(result.current.messages.find((message) => message.id === '1')?.readAt).toBe('now')
  })

  it('marks everything read in one call', async () => {
    const state = aLiveMailbox([aMessage(), aMessage({ id: '2' })])

    const { result } = renderHookWithProviders(() => useMailbox())

    await waitFor(() => expect(result.current.unreadCount).toBe(2))

    const { error } = await result.current.markAllRead()

    expect(error).toBeUndefined()
    expect(state.patches).toEqual(['read-all'])
    await waitFor(() => expect(result.current.unreadCount).toBe(0))
  })

  it('returns the problem and does not refresh the badge when marking read fails', async () => {
    // The unread-count key is separate from the mutation's own key, so it only
    // moves when the hook explicitly refreshes it — which it skips on error.
    const state = { countFetches: 0 }
    server.use(
      http.get(apiUrl('v1/mailbox'), () => HttpResponse.json([aMessage()])),
      http.get(apiUrl('v1/mailbox/unread-count'), () => {
        state.countFetches++
        return HttpResponse.json({ count: 1 })
      }),
      http.patch(apiUrl('v1/mailbox/1/read'), () => problemResponse(404, 'Message not found')),
    )

    const { result } = renderHookWithProviders(() => useMailbox())

    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    const before = state.countFetches

    const { error } = await result.current.markRead('1')

    expect(error).toEqual({ status: 404, detail: 'Message not found' })
    expect(state.countFetches).toBe(before)
  })

  it('refreshes the badge after a successful mark-read', async () => {
    const state = { countFetches: 0 }
    server.use(
      http.get(apiUrl('v1/mailbox'), () => HttpResponse.json([aMessage()])),
      http.get(apiUrl('v1/mailbox/unread-count'), () => {
        state.countFetches++
        return HttpResponse.json({ count: 1 })
      }),
      http.patch(apiUrl('v1/mailbox/1/read'), () => HttpResponse.json({ ok: true })),
    )

    const { result } = renderHookWithProviders(() => useMailbox())

    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    const before = state.countFetches

    await result.current.markRead('1')

    expect(state.countFetches).toBeGreaterThan(before)
  })
})
