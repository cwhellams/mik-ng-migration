import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { server } from './msw/server'

// Stub Iconify to avoid network requests in tests.
vi.mock('@iconify/react', async () => await import('./mocks/iconify'))
vi.mock('@iconify/react/dist/iconify.js', async () => await import('./mocks/iconify'))

// jsdom gaps

const createMemoryStorage = (): Storage => {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => Array.from(items.keys())[index] ?? null,
    removeItem: (key: string) => void items.delete(key),
    setItem: (key: string, value: string) => void items.set(key, String(value)),
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (!globalThis[name]) {
    Object.defineProperty(globalThis, name, {
      value: createMemoryStorage(),
      writable: true,
      configurable: true,
    })
  }
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
    addListener: () => {},
    removeListener: () => {},
  }),
})

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub

class IntersectionObserverStub {
  readonly root = null
  readonly rootMargin = ''
  readonly scrollMargin = ''
  readonly thresholds: readonly number[] = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
window.IntersectionObserver = IntersectionObserverStub

URL.createObjectURL ??= () => 'blob:mik-test'
URL.revokeObjectURL ??= () => {}

Element.prototype.scrollIntoView ??= () => {}
window.scrollTo = () => {}

// Lifecycle

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
  sessionStorage.clear()
  cleanup()
})

afterAll(() => server.close())
