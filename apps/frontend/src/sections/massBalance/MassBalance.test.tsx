import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import MassBalance from './MassBalance'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'

/**
 * #382: on a phone the disclaimer, the weight summary and the two reference
 * blocks pushed the first input field below the fold. They now start folded
 * under the `sm` breakpoint and unchanged above it, so the interesting
 * assertions are all about which sections are open at which width.
 */

/**
 * matchMedia that answers width queries against a viewport, rather than the
 * harness default of "nothing matches" — `breakpoints.up('sm')` and
 * `breakpoints.down('sm')` are both false under that, which is a width that
 * does not exist. Anything that is not a width query keeps the default.
 */
const stubViewport = (width: number) => {
  window.matchMedia = ((query: string) => {
    const min = /\(min-width:\s*([\d.]+)px\)/.exec(query)
    const max = /\(max-width:\s*([\d.]+)px\)/.exec(query)
    const isWidthQuery = min !== null || max !== null

    return {
      matches:
        isWidthQuery &&
        (min === null || width >= Number(min[1])) &&
        (max === null || width <= Number(max[1])),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      addListener: () => {},
      removeListener: () => {},
    }
  }) as typeof window.matchMedia
}

// The page loads its aircraft data from /public at runtime. Serving the real
// file keeps the test honest about what the page actually renders, and there is
// no second copy of the specs to drift.
const aircraftSpecs = (registration: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), `public/specs/${registration}.json`), 'utf-8'))

/** Every section heading that folds, with the accessible name of its toggle. */
const COLLAPSIBLE_SECTIONS = [
  /Disclaimer/,
  /Weight Summary/,
  /Aircraft Specifications/,
  /Conversion Factors/,
]

describe('MassBalance responsive section collapsing', () => {
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
    localStorage.clear()
    server.use(
      http.get('*/specs/:file', ({ params }) =>
        HttpResponse.json(aircraftSpecs(String(params.file).replace(/\.json$/, ''))),
      ),
    )
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('leaves every section expanded on desktop', async () => {
    stubViewport(1280)

    renderWithProviders(<MassBalance />)

    // The weight summary only exists once the specs have loaded and the first
    // calculation has run, so wait on it before asserting on the rest.
    expect(await screen.findByRole('button', { name: /Weight Summary/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    for (const name of COLLAPSIBLE_SECTIONS) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'true')
    }
    expect(screen.getByText(/It is the responsibility of the Pilot in Command/)).toBeVisible()
  })

  it('starts every section collapsed on a phone, with the inputs still rendered', async () => {
    stubViewport(375)

    renderWithProviders(<MassBalance />)

    expect(await screen.findByRole('button', { name: /Weight Summary/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    for (const name of COLLAPSIBLE_SECTIONS) {
      // The heading row is what stays on screen — the disclaimer is still
      // announced, it is only its body text that is a tap away.
      expect(screen.getByRole('button', { name })).toBeVisible()
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false')
    }
    expect(screen.getByText(/It is the responsibility of the Pilot in Command/)).not.toBeVisible()

    // The point of the exercise: the loading inputs are on the page.
    expect(screen.getAllByLabelText('Weight').length).toBeGreaterThan(0)
  })

  it('keeps a section the user opened on a phone open while weights change', async () => {
    stubViewport(375)

    const { user } = renderWithProviders(<MassBalance />)

    const summary = await screen.findByRole('button', { name: /Weight Summary/ })
    await user.click(summary)
    expect(summary).toHaveAttribute('aria-expanded', 'true')

    // First 'Weight' field is the pilot's, at the top of the Loading column.
    const pilotWeight = screen.getAllByLabelText('Weight')[0]
    await user.clear(pilotWeight)
    await user.type(pilotWeight, '95')

    expect(summary).toHaveAttribute('aria-expanded', 'true')
  })
})
