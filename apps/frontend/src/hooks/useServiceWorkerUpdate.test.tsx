import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useServiceWorkerUpdate } from './useServiceWorkerUpdate'

/**
 * jsdom ships no service worker, so the container is faked with a plain
 * EventTarget — enough to fire the `controllerchange` the hook listens for.
 */
let controller: EventTarget

const installServiceWorker = () => {
  controller = new EventTarget()
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: controller,
  })
}

const removeServiceWorker = () => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
}

beforeEach(installServiceWorker)
afterEach(() => {
  removeServiceWorker()
  vi.restoreAllMocks()
})

describe('useServiceWorkerUpdate', () => {
  it('reports no update on mount', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate())

    expect(result.current.isUpdateAvailable).toBe(false)
  })

  it('announces an update when the service worker takes control', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate())

    act(() => {
      controller.dispatchEvent(new Event('controllerchange'))
    })

    expect(result.current.isUpdateAvailable).toBe(true)
  })

  it('lets the user dismiss the prompt', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate())

    act(() => {
      controller.dispatchEvent(new Event('controllerchange'))
    })
    act(() => result.current.dismissUpdate())

    expect(result.current.isUpdateAvailable).toBe(false)
  })

  it('re-announces if the worker changes again after a dismissal', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate())

    act(() => {
      controller.dispatchEvent(new Event('controllerchange'))
    })
    act(() => result.current.dismissUpdate())
    act(() => {
      controller.dispatchEvent(new Event('controllerchange'))
    })

    expect(result.current.isUpdateAvailable).toBe(true)
  })

  it('reloads the page to pick up the new assets', () => {
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      reload,
    } as unknown as Location)

    const { result } = renderHook(() => useServiceWorkerUpdate())
    act(() => result.current.refreshApp())

    expect(reload).toHaveBeenCalledOnce()
  })

  it('does nothing at all in a browser without service workers', () => {
    removeServiceWorker()

    const { result } = renderHook(() => useServiceWorkerUpdate())

    expect(result.current.isUpdateAvailable).toBe(false)
  })

  it('keeps listening after unmount — the listener is never removed', () => {
    // Current behaviour: the effect registers a listener with no cleanup, so a
    // component that mounts this repeatedly accumulates listeners on the
    // service worker container.
    const add = vi.spyOn(controller, 'addEventListener')

    const first = renderHook(() => useServiceWorkerUpdate())
    first.unmount()
    renderHook(() => useServiceWorkerUpdate())

    expect(add).toHaveBeenCalledTimes(2)
  })
})
