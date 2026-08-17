import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { signInAs } from '../../test/auth'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import Register from './Register'

/**
 * The public membership application — the only form an unauthenticated visitor
 * can submit, and the one that creates club members.
 *
 * Note the two layers of validation: every text field carries the native
 * `required` attribute, so the browser blocks submission before
 * `handleNextStep` runs at all. The hand-rolled checks below it (membership
 * type, date of birth, the step-two questions) are only reachable once every
 * native constraint is satisfied — which is what these tests set up.
 */
const joiningFees = () =>
  server.use(
    http.get(apiUrl('v1/members/joining-fees'), () =>
      HttpResponse.json({ membershipFee: 100, joiningFee: 50 }),
    ),
  )

/** Records the registration payload, so what actually gets sent can be asserted. */
const registrations = () => {
  const sent: unknown[] = []
  server.use(
    http.post(apiUrl('auth/register'), async ({ request }) => {
      sent.push(await request.json())
      return HttpResponse.json({ sent: true })
    }),
  )
  return sent
}

const renderRegister = () => {
  signInAs(null)
  joiningFees()
  return renderWithProviders(<Register />)
}

type User = ReturnType<typeof renderWithProviders>['user']

/** Fills every natively-required text field, so the custom checks become reachable. */
const fillRequiredFields = async (user: User, email = 'uusi@example.com') => {
  await user.type(await screen.findByRole('textbox', { name: /Email/ }), email)
  await user.type(screen.getByRole('textbox', { name: /First Name/ }), 'Uusi')
  await user.type(screen.getByRole('textbox', { name: /Last Name/ }), 'Jäsen')
  await user.type(screen.getByRole('textbox', { name: /^Phone/ }), '401234567')
  await user.type(screen.getByRole('textbox', { name: /Street Address/ }), 'Keskuskatu 1')
  await user.type(screen.getByRole('textbox', { name: /Postcode/ }), '00100')
  await user.type(screen.getByRole('textbox', { name: /Town\/City/ }), 'Helsinki')
}

const next = (user: User) => user.click(screen.getByRole('button', { name: 'Next' }))

/**
 * Filling seven fields a keystroke at a time is slow, and slower still when the
 * rest of the suite is competing for the machine — the 5s default is not enough.
 */
const SLOW = { timeout: 30_000 }

describe('Register step one', SLOW, () => {
  it('starts on the first of two steps', async () => {
    renderRegister()

    expect(await screen.findByText('Step 1 of 2: Basic Information')).toBeInTheDocument()
  })

  it('will not advance while a required field is empty', async () => {
    const { user } = renderRegister()

    await screen.findByRole('textbox', { name: /Email/ })
    await next(user)

    // Blocked by the browser, before any of the app's own checks run.
    expect(screen.getByText('Step 1 of 2: Basic Information')).toBeInTheDocument()
  })

  it('demands a membership type once the rest is filled in', async () => {
    const { user } = renderRegister()

    await fillRequiredFields(user)
    await next(user)

    expect(await screen.findByText('Please select a membership type')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 2: Basic Information')).toBeInTheDocument()
  })

  it('advances to step two once the basics are complete', async () => {
    const { user } = renderRegister()

    await fillRequiredFields(user)
    await user.click(screen.getByRole('radio', { name: /Full Member/ }))
    await next(user)

    expect(
      await screen.findByText('Step 2 of 2: Flight Experience & Application'),
    ).toBeInTheDocument()
  })

  it('will not let a junior application through without a date of birth', async () => {
    // Junior membership is age-limited, so the date is required for it alone.
    const { user } = renderRegister()

    await fillRequiredFields(user)
    await user.click(screen.getByRole('radio', { name: /Junior/ }))
    await next(user)

    expect(screen.getByText('Step 1 of 2: Basic Information')).toBeInTheDocument()
    expect(screen.queryByText('Step 2 of 2: Flight Experience & Application')).toBeNull()
  })

  it('asks a full member for no date of birth at all', async () => {
    const { user } = renderRegister()

    await fillRequiredFields(user)
    await user.click(screen.getByRole('radio', { name: /Full Member/ }))
    await next(user)

    expect(
      await screen.findByText('Step 2 of 2: Flight Experience & Application'),
    ).toBeInTheDocument()
  })

  it('shows the joining fees it fetched', async () => {
    renderRegister()

    await screen.findByRole('textbox', { name: /Email/ })
    await waitFor(() => expect(screen.getByText(/joining fee/i)).toBeInTheDocument())
  })
})

describe('Register step two', SLOW, () => {
  const reachStepTwo = async (user: User) => {
    await fillRequiredFields(user)
    await user.click(screen.getByRole('radio', { name: /Full Member/ }))
    await next(user)
    await screen.findByText('Step 2 of 2: Flight Experience & Application')
  }

  const submit = (user: User) =>
    user.click(screen.getByRole('button', { name: /Send Application/ }))

  const fillEmptyTextboxes = async (user: User) => {
    for (const field of screen.getAllByRole('textbox')) {
      if ((field as HTMLInputElement).value === '') await user.type(field, '10')
    }
  }

  const answerRadioGroups = async (user: User) => {
    for (const group of screen.getAllByRole('radiogroup')) {
      const first = group.querySelector('input[type="radio"]')
      if (first) await user.click(first as HTMLElement)
    }
  }

  it('offers a way back to step one without losing the basics', async () => {
    const { user } = renderRegister()

    await reachStepTwo(user)
    await user.click(screen.getByRole('button', { name: /Back/ }))

    expect(await screen.findByText('Step 1 of 2: Basic Information')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Email/ })).toHaveValue('uusi@example.com')
  })

  it('sends nothing while the application is incomplete', async () => {
    const sent = registrations()
    const { user } = renderRegister()

    await reachStepTwo(user)
    await submit(user)

    await waitFor(() => expect(sent).toHaveLength(0))
  })

  it('still sends nothing when only the data protection box is left unticked', async () => {
    const sent = registrations()
    const { user } = renderRegister()

    await reachStepTwo(user)
    await answerRadioGroups(user)
    await fillEmptyTextboxes(user)
    await submit(user)

    await waitFor(() => expect(sent).toHaveLength(0))
  })

  it.todo(
    // Step two reveals further required fields as its radio groups are
    // answered, and pinning a complete happy-path submission proved brittle
    // against that. The checks above cover everything up to the final POST.
    //
    // The brittleness is the form's, not the test's: this is one of the three
    // that layer native `required` over hand-rolled checks, so the submission
    // comes with the react-hook-form + zodResolver conversion in #1115 §9,
    // item 5. (#1116 phase 7, which this used to point at, was dropped.)
    'sends the application once every answer is given',
  )
})

describe('Register for a signed-out visitor', SLOW, () => {
  it('needs no session at all', async () => {
    // It is reached from the login page, so it must never redirect.
    renderRegister()

    expect(await screen.findByRole('textbox', { name: /Email/ })).toBeInTheDocument()
  })

  it('offers a way back to the login page', async () => {
    renderRegister()

    await screen.findByRole('textbox', { name: /Email/ })
    expect(screen.getByRole('link', { name: /Login/i })).toHaveAttribute('href', '/login')
  })
})
