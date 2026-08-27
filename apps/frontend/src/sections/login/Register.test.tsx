import { screen, waitFor, within } from '@testing-library/react'
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
 * Three steps: an intro/disclaimer page with no fields, the basic-details
 * page, and the flight-experience/declarations page. Note the two layers of
 * validation on the latter two: every text field carries the native
 * `required` attribute, so the browser blocks submission before
 * `handleNextStep` runs at all. The hand-rolled checks below it (membership
 * type, date of birth, the step-three questions) are only reachable once
 * every native constraint is satisfied — which is what these tests set up.
 */
const joiningFees = (overrides: Partial<Record<string, unknown>> = {}) =>
  server.use(
    http.get(apiUrl('auth/joining-fees'), () =>
      HttpResponse.json({
        fullMemberFee: 50,
        reducedMemberFee: 25,
        fullMemberAnnualFee: 100,
        juniorMemberAnnualFee: 40,
        supportingMemberAnnualFee: 60,
        membershipFeeDiscountApplied: false,
        ...overrides,
      }),
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

const renderRegister = (joiningFeesOverrides?: Partial<Record<string, unknown>>) => {
  signInAs(null)
  joiningFees(joiningFeesOverrides)
  return renderWithProviders(<Register />)
}

type User = ReturnType<typeof renderWithProviders>['user']

/** Leaves the intro page (step one) and lands on the basic-details page (step two). */
const start = (user: User) => user.click(screen.getByRole('button', { name: 'Get Started' }))

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
  it('starts on the first of three steps, showing only the application notice', async () => {
    renderRegister()

    expect(await screen.findByText('Step 1 of 3: About This Application')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Email/ })).toBeNull()
  })

  it('shows the joining fees it fetched', async () => {
    renderRegister()

    await waitFor(() => expect(screen.getAllByText(/joining fee/i).length).toBeGreaterThan(0))
  })

  it('does not show a discount note when no seasonal discount applies', async () => {
    renderRegister()

    await waitFor(() => expect(screen.getAllByText(/joining fee/i).length).toBeGreaterThan(0))
    expect(screen.queryByText(/already reduced/i)).toBeNull()
  })

  it('shows a discount note when the backend reports the seasonal discount is active', async () => {
    renderRegister({ membershipFeeDiscountApplied: true })

    expect(await screen.findByText(/already reduced/i)).toBeInTheDocument()
  })

  it('advances to step two on Get Started', async () => {
    const { user } = renderRegister()

    await screen.findByRole('button', { name: 'Get Started' })
    await start(user)

    expect(await screen.findByText('Step 2 of 3: Basic Information')).toBeInTheDocument()
  })

  it('bolds the club name in the application notice', async () => {
    renderRegister()

    const clubName = await screen.findByText('Malmin Ilmailukerho ry')
    expect(clubName.tagName).toBe('STRONG')
  })

  it('links to the club rules, opening in a new tab', async () => {
    renderRegister()

    const rulesLink = await screen.findByRole('link', { name: "club's rules" })
    expect(rulesLink).toHaveAttribute('href', 'https://mik.fi/rules/')
    expect(rulesLink).toHaveAttribute('target', '_blank')
    expect(rulesLink).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})

describe('Register step two', SLOW, () => {
  const reachStepTwo = async (user: User) => {
    await screen.findByRole('button', { name: 'Get Started' })
    await start(user)
    await screen.findByText('Step 2 of 3: Basic Information')
  }

  it('will not advance while a required field is empty', async () => {
    const { user } = renderRegister()

    await reachStepTwo(user)
    await next(user)

    // Blocked by the browser, before any of the app's own checks run.
    expect(screen.getByText('Step 2 of 3: Basic Information')).toBeInTheDocument()
  })

  it('demands a membership type once the rest is filled in', async () => {
    const { user } = renderRegister()

    await reachStepTwo(user)
    await fillRequiredFields(user)
    await next(user)

    expect(await screen.findByText('Please select a membership type')).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 3: Basic Information')).toBeInTheDocument()
  })

  it('advances to step three once the basics are complete', async () => {
    const { user } = renderRegister()

    await reachStepTwo(user)
    await fillRequiredFields(user)
    await user.click(screen.getByRole('radio', { name: /Full Member/ }))
    await next(user)

    expect(
      await screen.findByText('Step 3 of 3: Flight Experience & Application'),
    ).toBeInTheDocument()
  })

  it('will not let a junior application through without a date of birth', async () => {
    // Junior membership is age-limited, so the date is required for it alone.
    const { user } = renderRegister()

    await reachStepTwo(user)
    await fillRequiredFields(user)
    await user.click(screen.getByRole('radio', { name: /Junior/ }))
    await next(user)

    expect(screen.getByText('Step 2 of 3: Basic Information')).toBeInTheDocument()
    expect(screen.queryByText('Step 3 of 3: Flight Experience & Application')).toBeNull()
  })

  it('asks a full member for no date of birth at all', async () => {
    const { user } = renderRegister()

    await reachStepTwo(user)
    await fillRequiredFields(user)
    await user.click(screen.getByRole('radio', { name: /Full Member/ }))
    await next(user)

    expect(
      await screen.findByText('Step 3 of 3: Flight Experience & Application'),
    ).toBeInTheDocument()
  })

  it('offers a way back to step one', async () => {
    const { user } = renderRegister()

    await reachStepTwo(user)
    await user.click(screen.getByRole('button', { name: /Back/ }))

    expect(await screen.findByText('Step 1 of 3: About This Application')).toBeInTheDocument()
  })

  it('places date of birth directly after last name', async () => {
    const { user } = renderRegister()

    await reachStepTwo(user)

    const lastName = screen.getByRole('textbox', { name: /Last Name/ })
    const dateOfBirth = screen.getByRole('group', { name: /Date of Birth/i })
    const phone = screen.getByRole('textbox', { name: /^Phone/ })

    // DOCUMENT_POSITION_FOLLOWING (4) means the argument comes after the node.
    expect(lastName.compareDocumentPosition(dateOfBirth) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(dateOfBirth.compareDocumentPosition(phone) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})

describe('Register step three', SLOW, () => {
  const reachStepThree = async (user: User) => {
    await screen.findByRole('button', { name: 'Get Started' })
    await start(user)
    await screen.findByText('Step 2 of 3: Basic Information')
    await fillRequiredFields(user)
    await user.click(screen.getByRole('radio', { name: /Full Member/ }))
    await next(user)
    await screen.findByText('Step 3 of 3: Flight Experience & Application')
  }

  const submit = (user: User) =>
    user.click(screen.getByRole('button', { name: /Send membership application/i }))

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

  it('labels total flight hours as approximate', async () => {
    const { user } = renderRegister()

    await reachStepThree(user)

    expect(
      screen.getByRole('spinbutton', { name: /Total Flight Hours \(approx\.\)/ }),
    ).toBeInTheDocument()
  })

  it('labels the cover letter "About you" with guidance as placeholder text', async () => {
    const { user } = renderRegister()

    await reachStepThree(user)

    const aboutYou = screen.getByRole('textbox', { name: 'About you' })
    expect(aboutYou).toBeInTheDocument()
    expect(aboutYou).toHaveAttribute(
      'placeholder',
      'Tell us a bit about yourself and your background, previous flight experience, why do you wish to join the club etc',
    )
  })

  it('offers Yes/No/Maybe buttons for volunteering, with guidance on what it means', async () => {
    const { user } = renderRegister()

    await reachStepThree(user)

    expect(
      screen.getByText('Are you able to help with club activities e.g. cleaning of aircraft'),
    ).toBeInTheDocument()

    const yesButton = screen.getByRole('button', { name: 'Yes' })
    await user.click(yesButton)
    expect(yesButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('reveals a text field only once "member of other clubs" is answered yes', async () => {
    const { user } = renderRegister()

    await reachStepThree(user)

    expect(screen.queryByPlaceholderText('Enter name or names of other clubs')).toBeNull()

    const otherClubsGroup = screen.getByRole('radiogroup', {
      name: 'Are you currently a member of any other aviation clubs in Finland?',
    })
    await user.click(within(otherClubsGroup).getByRole('radio', { name: 'Yes' }))

    expect(screen.getByPlaceholderText('Enter name or names of other clubs')).toBeInTheDocument()
  })

  it('shows the fees for the selected membership type in the fees acknowledgement, bolding the invoiced amounts', async () => {
    const { user } = renderRegister()

    await reachStepThree(user)

    expect(
      screen.getByText(/I understand this is an application for full membership/i),
    ).toBeInTheDocument()

    const boldAmounts = screen.getByText(
      'I will be invoiced a joining fee of €50 and an annual membership fee of €100',
    )
    expect(boldAmounts.tagName).toBe('STRONG')
  })

  it('uses short titles with the long guidance as placeholder text for the declaration detail boxes', async () => {
    const { user } = renderRegister()

    await reachStepThree(user)

    const accidentGroup = screen.getByRole('radiogroup', {
      name: /reportable aviation accident or serious incident/,
    })
    await user.click(within(accidentGroup).getByRole('radio', { name: 'Yes' }))

    const accidentDetails = screen.getByRole('textbox', { name: 'Accident details' })
    expect(accidentDetails).toHaveAttribute(
      'placeholder',
      'Please provide a brief description of the event(s), the role you played, and the final outcome or conclusion of any investigation',
    )

    const criminalGroup = screen.getByRole('radiogroup', {
      name: /unspent criminal convictions/,
    })
    await user.click(within(criminalGroup).getByRole('radio', { name: 'Yes' }))

    const criminalDetails = screen.getByRole('textbox', { name: 'Conviction details' })
    expect(criminalDetails).toHaveAttribute(
      'placeholder',
      'Please provide details, including the nature of the offense and date of conviction. Note: Under Finnish law, you are generally not required to disclose spent convictions.',
    )
  })

  it('includes r.y. when naming the club in the data protection declaration', async () => {
    const { user } = renderRegister()

    await reachStepThree(user)

    expect(screen.getByText(/Malmin Ilmailukerho r\.y\. \(MIK\)/)).toBeInTheDocument()
  })

  it('offers a rules-acceptance checkbox linking to the rules page in a new tab', async () => {
    const { user } = renderRegister()

    await reachStepThree(user)

    const rulesLink = screen.getByRole('link', { name: 'https://mik.fi/rules/' })
    expect(rulesLink).toHaveAttribute('href', 'https://mik.fi/rules/')
    expect(rulesLink).toHaveAttribute('target', '_blank')
    expect(rulesLink).toHaveAttribute('rel', expect.stringContaining('noopener'))

    expect(
      screen.getByRole('checkbox', { name: /I accept the Malmin Ilmailukerho r\.y\. rules/ }),
    ).toBeInTheDocument()
  })

  it('blocks submission until the club rules are accepted', async () => {
    const sent = registrations()
    const { user } = renderRegister()

    await reachStepThree(user)
    await answerRadioGroups(user)
    await fillEmptyTextboxes(user)
    await user.click(screen.getByRole('checkbox', { name: /information provided is true/ }))
    await user.click(screen.getByRole('checkbox', { name: /I understand this is an application/ }))
    await user.click(screen.getByRole('button', { name: 'Yes' }))
    await submit(user)

    await waitFor(() => expect(sent).toHaveLength(0))
    expect(
      screen.getByText('You must accept the club rules to submit your application'),
    ).toBeInTheDocument()
  })

  it('offers a way back to step two without losing the basics', async () => {
    const { user } = renderRegister()

    await reachStepThree(user)
    await user.click(screen.getByRole('button', { name: /Back/ }))

    expect(await screen.findByText('Step 2 of 3: Basic Information')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Email/ })).toHaveValue('uusi@example.com')
  })

  it('sends nothing while the application is incomplete', async () => {
    const sent = registrations()
    const { user } = renderRegister()

    await reachStepThree(user)
    await submit(user)

    await waitFor(() => expect(sent).toHaveLength(0))
  })

  it('still sends nothing when only the data protection box is left unticked', async () => {
    const sent = registrations()
    const { user } = renderRegister()

    await reachStepThree(user)
    await answerRadioGroups(user)
    await fillEmptyTextboxes(user)
    await submit(user)

    await waitFor(() => expect(sent).toHaveLength(0))
  })

  it('reaches the submitted confirmation page once every answer is given, showing the memberId as a reference', async () => {
    const sent: unknown[] = []
    server.use(
      http.post(apiUrl('auth/register'), async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json({ code: 54321, memberId: 'NEWMEM1' })
      }),
    )
    const { user } = renderRegister()

    await reachStepThree(user)
    await answerRadioGroups(user)
    await fillEmptyTextboxes(user)
    await user.click(screen.getByRole('button', { name: 'Yes' }))
    await user.click(screen.getByRole('checkbox', { name: /information provided is true/ }))
    await user.click(screen.getByRole('checkbox', { name: /I understand this is an application/ }))
    await user.click(screen.getByRole('checkbox', { name: /I accept the Malmin Ilmailukerho/ }))
    await submit(user)

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(await screen.findByText('Application submitted')).toBeInTheDocument()
    expect(screen.getByText('NEWMEM1')).toBeInTheDocument()

    // Registration is confirmed by clicking the link in the email — there is no
    // code-entry step (that mechanism belongs to the login flow, not registration).
    expect(screen.queryByRole('textbox', { name: /code/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to login' })).toBeInTheDocument()
  })
})

describe('Register for a signed-out visitor', SLOW, () => {
  it('needs no session at all', async () => {
    // It is reached from the login page, so it must never redirect.
    renderRegister()

    expect(await screen.findByRole('button', { name: 'Get Started' })).toBeInTheDocument()
  })

  it('offers a way back to the login page from the intro step', async () => {
    renderRegister()

    await screen.findByRole('button', { name: 'Get Started' })
    expect(screen.getByRole('link', { name: /Login/i })).toHaveAttribute('href', '/login')
  })
})
