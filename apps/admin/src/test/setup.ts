import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import i18n from '@mik/ui/i18n'
import { server } from './msw/server'

// App.tsx maps the default 'en' UI language to the 'en-gb' dayjs locale for
// MUI X date pickers and imports 'dayjs/locale/en-gb' to register it. Tests
// render through renderWithProviders instead of App, so without this import
// any test that mounts a date picker at the default English language hits
// dayjs's fallback-to-English "locale has not been found" console warning.
import 'dayjs/locale/en-gb'

// Importing useApi for its side effect: it registers the app's axios instance
// with @mik/ui, which the shared dtoApi/examApi modules issue requests through.
// A test that renders one of those pages without this would throw before MSW
// ever saw a request.
import '@mik/ui/hooks/useApi'

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

beforeAll(async () => {
  // `error` rather than `warn`: an unhandled request is a missing handler, and
  // silently answering it with a network error is far harder to debug than a
  // loud failure. Add the handler in the test, or in src/test/msw/handlers.ts
  // if the whole suite needs it.
  server.listen({ onUnhandledRequest: 'error' })

  // Pin the language so tests assert on real English strings rather than on
  // whatever the browser language detector happens to pick.
  await i18n.changeLanguage('en')
})

afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
  sessionStorage.clear()
  cleanup()
})

afterAll(() => server.close())
