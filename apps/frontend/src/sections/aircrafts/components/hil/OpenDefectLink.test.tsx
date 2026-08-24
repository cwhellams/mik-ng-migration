import type { HilLinkedDefect } from '@mik/contracts/aircraft-hil'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../../test/renderWithProviders'
import { OpenDefectLink } from './OpenDefectLink'

/**
 * The link reported in issue #1255: a defect description reading `U/S` was
 * printed `U&#x2F;S`, because it goes through a translation string and i18next
 * escaped the interpolated value. Both this app's fly-page links render through
 * here, so both are covered by these assertions.
 */
const aDefect = (description: string): HilLinkedDefect => ({
  defectId: 'a1b2c3d4-0000-4000-8000-000000000001',
  ajlbSeqNo: 12,
  flightId: null,
  description,
  status: 'ACTIVE',
  flightMins: 4200,
})

const renderLink = (description: string, context: 'list' | 'banner' = 'list') => {
  const onClick = vi.fn()
  const rendered = renderWithProviders(
    <OpenDefectLink defect={aDefect(description)} onClick={onClick} context={context} />,
  )
  return { ...rendered, onClick }
}

describe('OpenDefectLink', () => {
  it('prints a slash in the description verbatim, not as &#x2F; (issue #1255)', async () => {
    renderLink('Nav light U/S')

    // The exact string from the bug report. getByRole matches on the accessible
    // name, which is the rendered text — so an escaped entity fails here.
    expect(
      await screen.findByRole('button', { name: 'Open journey log book 12 — Nav light U/S' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['an apostrophe', "Pilot's seat loose", '&#39;'],
    ['a slash', 'Nav light U/S', '&#x2F;'],
    ['an ampersand', 'Seat & belt frayed', '&amp;'],
    ['angle brackets', 'Check <tyre pressure>', '&lt;'],
    ['a double quote', 'Reads "0" on climb', '&quot;'],
  ])('renders %s without emitting %s', async (_label, description, entity) => {
    renderLink(description)

    const link = await screen.findByRole('button')
    expect(link).toHaveTextContent(description, { normalizeWhitespace: false })
    expect(link.textContent).not.toContain(entity)
  })

  it('keeps a long description reachable as the tooltip while clamping the label', async () => {
    // A description may be up to 2000 characters; on the phone the fly page is
    // used from, an unclamped one pushes the rest of the card off screen. The
    // clamp itself is CSS (an ellipsis needs layout, which jsdom does not do),
    // so what is assertable here is that truncating did not lose the text: the
    // full description stays available on hover.
    const long = `Left main tyre worn beyond limits, ${'and '.repeat(200)}needs replacing`
    renderLink(long)

    const link = await screen.findByRole('button')
    expect(link).toHaveAttribute('title', expect.stringContaining(long))
    // The label is its own element, which is what the clamp is applied to.
    expect(link.querySelector('span')).not.toBeNull()
  })

  it('renders the same label inside the grounding banner', async () => {
    // The banner is a filled Alert, so the link inherits its colour and sits
    // flush; the label itself must not differ.
    renderLink('Nav light U/S', 'banner')

    expect(
      await screen.findByRole('button', { name: 'Open journey log book 12 — Nav light U/S' }),
    ).toBeInTheDocument()
  })

  it('opens the defect when clicked', async () => {
    const { user, onClick } = renderLink('Nav light U/S')

    await user.click(await screen.findByRole('button'))

    expect(onClick).toHaveBeenCalledOnce()
  })
})
