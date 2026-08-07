import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useScrollOnRender } from './useScrollOnRender'

afterEach(() => vi.restoreAllMocks())

const anAnchor = () => {
  const anchor = document.createElement('a')
  anchor.scrollIntoView = vi.fn()
  return anchor
}

describe('useScrollOnRender', () => {
  it('scrolls the node into the centre of the viewport', () => {
    const { result } = renderHook(() => useScrollOnRender())
    const anchor = anAnchor()

    result.current(anchor)

    expect(anchor.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' })
  })

  it('scrolls only once, so re-renders do not yank the page back', () => {
    const { result } = renderHook(() => useScrollOnRender())
    const anchor = anAnchor()

    result.current(anchor)
    result.current(anchor)
    result.current(anAnchor())

    expect(anchor.scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('ignores the detach call React makes with a null node', () => {
    const { result } = renderHook(() => useScrollOnRender())

    expect(() => result.current(null as unknown as HTMLAnchorElement)).not.toThrow()
  })

  it('still scrolls the first real node after a null detach', () => {
    const { result } = renderHook(() => useScrollOnRender())
    const anchor = anAnchor()

    result.current(null as unknown as HTMLAnchorElement)
    result.current(anchor)

    expect(anchor.scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('keeps a stable callback identity so React does not re-attach the ref', () => {
    const { result, rerender } = renderHook(() => useScrollOnRender())
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })
})
