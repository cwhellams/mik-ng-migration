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

  it('removes its listener on unmount, so remounts do not accumulate them', () => {
    const add = vi.spyOn(controller, 'addEventListener')
    const remove = vi.spyOn(controller, 'removeEventListener')

    const first = renderHook(() => useServiceWorkerUpdate())
    first.unmount()
    renderHook(() => useServiceWorkerUpdate())

    expect(add).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('controllerchange', add.mock.calls[0][1])
  })

  it('leaves nothing behind on an unmounted hook', () => {
    const { result, unmount } = renderHook(() => useServiceWorkerUpdate())
    unmount()

    // Would warn about setting state on an unmounted hook if the listener
    // survived; the state simply stays where it was.
    act(() => {
      controller.dispatchEvent(new Event('controllerchange'))
    })

    expect(result.current.isUpdateAvailable).toBe(false)
  })
})
