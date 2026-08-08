import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { signInAs } from '../test/auth'
import { aMember } from '../test/fixtures'
import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import User from './User'

const Landing = () => <span>at {useLocation().pathname}</span>

const renderUser = (options: Parameters<typeof renderWithProviders>[1] = {}) =>
  renderWithProviders(
    <>
      <User />
      <Routes>
        <Route path='*' element={<Landing />} />
      </Routes>
    </>,
    options,
  )

/**
 * Opens the account menu by clicking the accessible button trigger.
 */
const openMenu = async (user: ReturnType<typeof renderUser>['user']) => {
  await user.click(await screen.findByRole('button', { name: /Open account menu/i }))
  return screen.findByRole('menu')
}

describe('User when signed out', () => {
  it('offers a login link', async () => {
    signInAs(null)

    renderUser()

    expect(await screen.findByRole('link', { name: /Login/ })).toHaveAttribute('href', '/login')
  })

  it('offers no profile menu', async () => {
    signInAs(null)

    renderUser()

    await screen.findByRole('link', { name: /Login/ })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('User when signed in', () => {
  it('shows the member name and email in the menu', async () => {
    signInAs(aMember())

    const { user } = renderUser()
    await openMenu(user)

    expect(screen.getByText('Matti Virtanen')).toBeInTheDocument()
    expect(screen.getByText('chris.whellams@gmail.com')).toBeInTheDocument()
  })

  it('links to the profile, mailbox, expenses and flight packages', async () => {
    signInAs(aMember())

    const { user } = renderUser()
    await openMenu(user)

    expect(screen.getByRole('menuitem', { name: /My profile/ })).toHaveAttribute(
      'href',
      '/club/members/me',
    )
    expect(screen.getByRole('menuitem', { name: /Mailbox/ })).toHaveAttribute('href', '/mailbox')
    expect(screen.getByRole('menuitem', { name: /My Expenses/ })).toHaveAttribute(
      'href',
      '/expenses',
    )
    expect(screen.getByRole('menuitem', { name: /My flight packages/ })).toHaveAttribute(
      'href',
      '/shop/flight-packages',
    )
  })

  it('badges the mailbox with the unread count', async () => {
    signInAs(aMember())
    server.use(http.get(apiUrl('v1/mailbox/unread-count'), () => HttpResponse.json({ count: 4 })))

    const { user } = renderUser()
    await openMenu(user)

    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument())
  })

  it('leaves the mailbox unbadged when nothing is unread', async () => {
    signInAs(aMember())
    server.use(http.get(apiUrl('v1/mailbox/unread-count'), () => HttpResponse.json({ count: 0 })))

    const { user } = renderUser()
    await openMenu(user)

    expect(screen.queryByText('0')).toBeNull()
  })
})

describe('User preferences', () => {
  it('saves the language the member picks', async () => {
    signInAs(aMember())
    const patched: unknown[] = []
    server.use(
      http.patch(apiUrl('v1/members/me/lang'), async ({ request }) => {
        patched.push(await request.json())
        return HttpResponse.json({ lang: 'fi' })
      }),
    )

    const { user } = renderUser()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /Suomi/ }))

    await waitFor(() => expect(patched).toEqual([{ lang: 'fi' }]))
  })

  it('switches the displayed timezone', async () => {
    signInAs(aMember())

    const { user } = renderUser({ timezone: 'utc' })
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /Local/ }))

    expect(localStorage.getItem('timezone')).toBe('local')
  })
})

describe('User logout', () => {
  it('signs out and lands on the logout page', async () => {
    signInAs(aMember())
    const state = { logouts: 0 }
    server.use(
      http.post(apiUrl('auth/logout'), () => {
        state.logouts++
        return HttpResponse.json({ ok: true })
      }),
    )

    const { user } = renderUser()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /Logout/ }))

    await waitFor(() => expect(state.logouts).toBe(1))
    expect(await screen.findByText('at /logout')).toBeInTheDocument()
  })

  it('stays put when the logout call fails', async () => {
    signInAs(aMember())
    vi.spyOn(console, 'log').mockImplementation(() => {})
    server.use(http.post(apiUrl('auth/logout'), () => problemResponse(500, 'Down')))

    const { user } = renderUser({ route: '/club' })
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /Logout/ }))

    await waitFor(() => expect(screen.getByText('at /club')).toBeInTheDocument())
  })
})

describe('User accessibility', () => {
  it('can open its menu from the keyboard', async () => {
    signInAs(aMember())

    const { user } = renderUser()

    const trigger = await screen.findByRole('button', { name: /Open account menu/i })
    expect(trigger.tagName).toBe('BUTTON')

    await user.tab()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })
})
