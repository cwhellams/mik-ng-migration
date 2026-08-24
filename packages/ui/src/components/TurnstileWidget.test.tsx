import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The real widget loads a script from Cloudflare, which is neither available
// nor desirable in a test — stub it and record the props it was handed.
const turnstileProps: Record<string, unknown>[] = []
vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: (props: Record<string, unknown>) => {
    turnstileProps.push(props)
    return <div data-testid='turnstile' />
  },
}))

import { TurnstileWidget } from './TurnstileWidget'

beforeEach(() => {
  turnstileProps.length = 0
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
})

afterEach(() => vi.unstubAllEnvs())

describe('TurnstileWidget', () => {
  it('renders the widget when a site key is configured', () => {
    render(<TurnstileWidget onSuccess={() => {}} />)

    expect(screen.getByTestId('turnstile')).toBeInTheDocument()
    expect(turnstileProps[0].siteKey).toBe('test-site-key')
  })

  it('renders nothing at all without a site key', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')

    const { container } = render(<TurnstileWidget onSuccess={() => {}} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('passes the success callback straight through', () => {
    const onSuccess = vi.fn()
    render(<TurnstileWidget onSuccess={onSuccess} />)

    ;(turnstileProps[0].onSuccess as (token: string) => void)('a-token')

    expect(onSuccess).toHaveBeenCalledWith('a-token')
  })

  it('reports an error to the caller', () => {
    const onError = vi.fn()
    render(<TurnstileWidget onSuccess={() => {}} onError={onError} />)

    ;(turnstileProps[0].onError as () => void)()

    expect(onError).toHaveBeenCalledOnce()
  })

  it('survives an error with no handler supplied', () => {
    render(<TurnstileWidget onSuccess={() => {}} />)

    expect(() => (turnstileProps[0].onError as () => void)()).not.toThrow()
  })

  it('dims itself and stops taking input when disabled', () => {
    render(<TurnstileWidget onSuccess={() => {}} disabled />)

    expect(turnstileProps[0].style).toMatchObject({ opacity: 0.5, pointerEvents: 'none' })
  })

  it('is fully interactive by default', () => {
    render(<TurnstileWidget onSuccess={() => {}} />)

    expect(turnstileProps[0].style).toMatchObject({ opacity: 1, pointerEvents: 'auto' })
  })
})
