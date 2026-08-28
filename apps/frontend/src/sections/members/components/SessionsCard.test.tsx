import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Session } from '@mik/contracts/session'

import { authScenarios, renderAs } from '../../../test/auth'
import { apiUrl, problemResponse } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { SessionsCard } from './SessionsCard'

const MEMBER_ID = 'Matti1'

const aSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'session-1',
  ipAddress: '192.0.2.1',
  userAgent: 'Mozilla/5.0',
  device: 'Chrome on Windows',
  createdAt: '2026-08-01T10:00:00.000Z',
  lastUsedAt: '2026-08-02T12:30:00.000Z',
  isCurrent: false,
  ...overrides,
})

const currentSession = aSession({ id: 'current', device: 'Firefox on Linux', isCurrent: true })
const otherSession = aSession({
  id: 'other',
  device: 'Safari on iPhone',
  ipAddress: '198.51.100.4',
})

/** Serve the list for both mount points, so a test can render either. */
const listReturns = (sessions: Session[]) => {
  server.use(
    http.get(apiUrl('v1/members/me/sessions'), () => HttpResponse.json({ sessions })),
    http.get(apiUrl(`v1/members/${MEMBER_ID}/sessions`), () => HttpResponse.json({ sessions })),
  )
}

const terminateButtons = () => screen.getAllByRole('button', { name: 'Terminate session' })

describe('SessionsCard', () => {
  beforeEach(() => {
    listReturns([currentSession, otherSession])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists each session with its device, address and times', async () => {
    renderAs(authScenarios.user, <SessionsCard memberId='me' isAdmin={false} />)

    const row = (await screen.findByText('Safari on iPhone')).closest('li')!

    // Scoped to the one row: both fixtures share their timestamps, so an
    // unscoped query would match twice and say nothing about which row is which.
    expect(within(row).getByText(/198\.51\.100\.4/)).toBeInTheDocument()
    // Rendered through useTimezone, whose default in the harness is UTC.
    expect(within(row).getByText(/Signed in 01\.08\.2026 10:00/)).toBeInTheDocument()
    expect(within(row).getByText(/Last active 02\.08\.2026 12:30/)).toBeInTheDocument()
  })

  it('marks the current session and refuses to let it be terminated here', async () => {
    renderAs(authScenarios.user, <SessionsCard memberId='me' isAdmin={false} />)

    const currentRow = (await screen.findByText('Firefox on Linux')).closest('li')!
    expect(within(currentRow).getByText('This device')).toBeInTheDocument()
    expect(within(currentRow).getByRole('button', { name: 'Terminate session' })).toBeDisabled()

    const otherRow = screen.getByText('Safari on iPhone').closest('li')!
    expect(within(otherRow).getByRole('button', { name: 'Terminate session' })).toBeEnabled()
  })

  it('always states that terminating is not immediate', async () => {
    // The 15-minute caveat was an explicit requirement, not a footnote: without
    // it a member terminates a session, watches it keep working, and concludes
    // the button is broken.
    renderAs(authScenarios.user, <SessionsCard memberId='me' isAdmin={false} />)

    expect(await screen.findByText(/up to 15 minutes/)).toBeInTheDocument()
  })

  it('terminates a session after confirmation and reloads the list', async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const deleted: string[] = []
    server.use(
      http.delete(apiUrl('v1/members/me/sessions/:sessionId'), ({ params }) => {
        deleted.push(params.sessionId as string)
        return HttpResponse.json({ ok: true })
      }),
    )

    const { user } = renderAs(authScenarios.user, <SessionsCard memberId='me' isAdmin={false} />)
    await screen.findByText('Safari on iPhone')

    const otherRow = screen.getByText('Safari on iPhone').closest('li')!
    await user.click(within(otherRow).getByRole('button', { name: 'Terminate session' }))

    await waitFor(() => expect(deleted).toEqual(['other']))
    expect(globalThis.confirm).toHaveBeenCalledWith(expect.stringContaining('up to 15 minutes'))
  })

  it('does nothing when the terminate confirmation is dismissed', async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const deleted: string[] = []
    server.use(
      http.delete(apiUrl('v1/members/me/sessions/:sessionId'), ({ params }) => {
        deleted.push(params.sessionId as string)
        return HttpResponse.json({ ok: true })
      }),
    )

    const { user } = renderAs(authScenarios.user, <SessionsCard memberId='me' isAdmin={false} />)
    await screen.findByText('Safari on iPhone')

    const otherRow = screen.getByText('Safari on iPhone').closest('li')!
    await user.click(within(otherRow).getByRole('button', { name: 'Terminate session' }))

    expect(deleted).toEqual([])
  })

  it('surfaces the backend problem when terminating fails', async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    server.use(
      http.delete(apiUrl('v1/members/me/sessions/:sessionId'), () =>
        problemResponse(409, 'Use logout to end the current session'),
      ),
    )

    const { user } = renderAs(authScenarios.user, <SessionsCard memberId='me' isAdmin={false} />)
    await screen.findByText('Safari on iPhone')

    const otherRow = screen.getByText('Safari on iPhone').closest('li')!
    await user.click(within(otherRow).getByRole('button', { name: 'Terminate session' }))

    expect(await screen.findByText(/Use logout to end the current session/)).toBeInTheDocument()
  })

  describe('the bulk action', () => {
    it('is hidden when the only session is the current one', async () => {
      listReturns([currentSession])

      renderAs(authScenarios.user, <SessionsCard memberId='me' isAdmin={false} />)
      await screen.findByText('Firefox on Linux')

      expect(
        screen.queryByRole('button', { name: 'Log out of all other sessions' }),
      ).not.toBeInTheDocument()
    })

    it('is hidden when there are no sessions at all', async () => {
      listReturns([])

      renderAs(authScenarios.user, <SessionsCard memberId='me' isAdmin={false} />)

      expect(await screen.findByText('No other active sessions.')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Log out of all other sessions' }),
      ).not.toBeInTheDocument()
    })

    it('revokes the others once there is more than one session', async () => {
      vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
      let called = false
      server.use(
        http.post(apiUrl('v1/members/me/sessions/revoke-others'), () => {
          called = true
          return HttpResponse.json({ ok: true, revokedCount: 1 })
        }),
      )

      const { user } = renderAs(authScenarios.user, <SessionsCard memberId='me' isAdmin={false} />)
      await screen.findByText('Safari on iPhone')

      await user.click(screen.getByRole('button', { name: 'Log out of all other sessions' }))

      await waitFor(() => expect(called).toBe(true))
      expect(globalThis.confirm).toHaveBeenCalledWith(expect.stringContaining('up to 15 minutes'))
    })

    it('does nothing when its confirmation is dismissed', async () => {
      vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
      let called = false
      server.use(
        http.post(apiUrl('v1/members/me/sessions/revoke-others'), () => {
          called = true
          return HttpResponse.json({ ok: true, revokedCount: 1 })
        }),
      )

      const { user } = renderAs(authScenarios.user, <SessionsCard memberId='me' isAdmin={false} />)
      await screen.findByText('Safari on iPhone')

      await user.click(screen.getByRole('button', { name: 'Log out of all other sessions' }))

      expect(called).toBe(false)
    })

    it('is offered for every row when an admin views another member, none being theirs', async () => {
      // None of the target's sessions is ever isCurrent for the admin, so all of
      // them are "other" and every terminate button is live.
      listReturns([aSession({ id: 'a' }), aSession({ id: 'b', device: 'Edge on Windows' })])

      renderAs(authScenarios.admin, <SessionsCard memberId={MEMBER_ID} isAdmin />)
      await screen.findByText('Edge on Windows')

      expect(screen.queryByText('This device')).not.toBeInTheDocument()
      expect(terminateButtons().every((b) => !b.hasAttribute('disabled'))).toBe(true)
      expect(
        screen.getByRole('button', { name: 'Log out of all other sessions' }),
      ).toBeInTheDocument()
    })
  })

  describe('permissions', () => {
    it.each([
      ['admin in sudo mode', authScenarios.admin],
      ['admin with sudo off', authScenarios.adminNoSudo],
      ['ordinary member', authScenarios.user],
      ['member without permissions', authScenarios.none],
    ])(
      'shows %s the empty state rather than an error when the backend refuses the list',
      async (_name, scenario) => {
        // Deliberately identical to PasskeysCard's behaviour on the same profile:
        // it has no error handling for the GET either, and two cards side by side
        // reacting differently to one 403 would be the confusing outcome.
        server.use(
          http.get(apiUrl(`v1/members/${MEMBER_ID}/sessions`), () =>
            problemResponse(403, 'Forbidden'),
          ),
        )

        renderAs(scenario, <SessionsCard memberId={MEMBER_ID} isAdmin={false} />)

        expect(await screen.findByText('No other active sessions.')).toBeInTheDocument()
        expect(
          screen.queryByRole('button', { name: 'Log out of all other sessions' }),
        ).not.toBeInTheDocument()
      },
    )

    it('lists an admin-viewed member sessions when the backend allows it', async () => {
      renderAs(authScenarios.admin, <SessionsCard memberId={MEMBER_ID} isAdmin />)

      expect(await screen.findByText('Safari on iPhone')).toBeInTheDocument()
    })
  })
})
