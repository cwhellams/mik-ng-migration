import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { ContactCategory } from '@mik/contracts/contact'
import { signInAs } from '../../test/auth'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import Contact from './Contact'

const renderContact = () => {
  signInAs(null)
  return renderWithProviders(<Contact />)
}

describe('Contact', () => {
  it('renders for a signed-out visitor', async () => {
    renderContact()

    expect(await screen.findByRole('heading', { name: 'Intranet' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Your name/i })).toBeInTheDocument()
  })

  it('shows category radio buttons', async () => {
    renderContact()

    expect(
      await screen.findByRole('radio', { name: /Training and instruction/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Membership and applications/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Other enquiries/i })).toBeInTheDocument()
  })

  it('submitting without category shows error', async () => {
    const { user } = renderContact()

    await user.type(await screen.findByRole('textbox', { name: /Your name/i }), 'Alex Pilot')
    await user.type(
      screen.getByRole('textbox', { name: /Your email address/i }),
      'alex@example.com',
    )
    await user.type(screen.getByRole('textbox', { name: /Message/i }), 'Hello there')
    await user.click(screen.getByRole('button', { name: /Send message/i }))

    expect(await screen.findByText('Please select a department')).toBeInTheDocument()
  })

  it('valid submission POSTs to auth/contact endpoint', async () => {
    const sent: unknown[] = []
    server.use(
      http.post(apiUrl('auth/contact'), async ({ request }) => {
        sent.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { user } = renderContact()

    await user.type(await screen.findByRole('textbox', { name: /Your name/i }), 'Alex Pilot')
    await user.type(
      screen.getByRole('textbox', { name: /Your email address/i }),
      'alex@example.com',
    )
    await user.click(screen.getByRole('radio', { name: /Training and instruction/i }))
    await user.type(screen.getByRole('textbox', { name: /Message/i }), 'Hello there')
    await user.click(screen.getByRole('button', { name: /Send message/i }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual({
      name: 'Alex Pilot',
      email: 'alex@example.com',
      category: ContactCategory.TRAINING,
      message: 'Hello there',
      lang: 'en',
    })
  })

  it('successful response shows confirmation', async () => {
    server.use(http.post(apiUrl('auth/contact'), () => new HttpResponse(null, { status: 204 })))

    const { user } = renderContact()

    await user.type(await screen.findByRole('textbox', { name: /Your name/i }), 'Alex Pilot')
    await user.type(
      screen.getByRole('textbox', { name: /Your email address/i }),
      'alex@example.com',
    )
    await user.click(screen.getByRole('radio', { name: /Other enquiries/i }))
    await user.type(screen.getByRole('textbox', { name: /Message/i }), 'Hello there')
    await user.click(screen.getByRole('button', { name: /Send message/i }))

    expect(await screen.findByText('Message sent')).toBeInTheDocument()
    expect(
      screen.getByText('Thank you for your message. We will get back to you as soon as possible.'),
    ).toBeInTheDocument()
  })
})
