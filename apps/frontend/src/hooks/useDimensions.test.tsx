import { act, renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDimensions } from './useDimensions'

/** jsdom reports every element as 0×0, so the layout box has to be faked. */
const anElementSized = (width: number, height: number) => {
  const element = document.createElement('div')
  Object.defineProperties(element, {
    offsetWidth: { configurable: true, value: width },
    offsetHeight: { configurable: true, value: height },
  })
  return element
}

afterEach(() => vi.restoreAllMocks())

describe('useDimensions', () => {
  it('reports zeroes when the ref is not attached to anything', () => {
    const ref = createRef<HTMLElement>()

    const { result } = renderHook(() => useDimensions(ref))

    expect(result.current).toEqual({ width: 0, height: 0 })
  })

  it('measures the element on mount', () => {
    const ref = { current: anElementSized(640, 480) }

    const { result } = renderHook(() => useDimensions(ref))

    expect(result.current).toEqual({ width: 640, height: 480 })
  })

  it('re-measures when the window resizes', () => {
    const element = anElementSized(640, 480)
    const ref = { current: element }

    const { result } = renderHook(() => useDimensions(ref))

    Object.defineProperties(element, {
      offsetWidth: { configurable: true, value: 320 },
      offsetHeight: { configurable: true, value: 240 },
    })
    act(() => window.dispatchEvent(new Event('resize')))

    expect(result.current).toEqual({ width: 320, height: 240 })
  })

  it('reports zeroes when the element disappears before a resize', () => {
    const ref: { current: HTMLElement | null } = { current: anElementSized(640, 480) }

    const { result } = renderHook(() => useDimensions(ref))

    ref.current = null
    act(() => window.dispatchEvent(new Event('resize')))

    expect(result.current).toEqual({ width: 0, height: 0 })
  })

  it('detaches its resize listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const ref = { current: anElementSized(640, 480) }

    const { unmount } = renderHook(() => useDimensions(ref))
    unmount()

    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('stops measuring once unmounted', () => {
    const element = anElementSized(640, 480)
    const ref = { current: element }

    const { result, unmount } = renderHook(() => useDimensions(ref))
    unmount()

    Object.defineProperty(element, 'offsetWidth', { configurable: true, value: 1 })
    act(() => window.dispatchEvent(new Event('resize')))

    expect(result.current.width).toBe(640)
  })
})
