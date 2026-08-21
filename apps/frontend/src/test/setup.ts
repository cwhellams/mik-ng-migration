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

// --- module stubs ----------------------------------------------------------

// Iconify fetches icon data from api.iconify.design on first render, which
// would mean a network round-trip (and a late state update) in all 117 files
// that render an <Icon />. The stub keeps the icon name assertable via
// `data-icon` without any of that. Both import specifiers used in the app are
// covered.
// (The factories are inlined because `vi.mock` calls are hoisted above any
// local declaration they might otherwise reference.)
vi.mock('@iconify/react', async () => await import('./mocks/iconify'))
vi.mock('@iconify/react/dist/iconify.js', async () => await import('./mocks/iconify'))

// --- jsdom gaps ------------------------------------------------------------

// Node 26 defines its own `localStorage`/`sessionStorage` globals that stay
// `undefined` unless the process is started with `--localstorage-file`, and
// they shadow jsdom's implementations. `ThemeContext` and `wizardDraft` both
// read storage on first render, so without this every component test throws.
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

// MUI's useMediaQuery (29 files) and the responsive theme call matchMedia on
// first render; jsdom has no implementation at all. Default to "no match", so
// components render their desktop layout.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
    // Deprecated, but still called by some MUI/Nivo code paths.
    addListener: () => {},
    removeListener: () => {},
  }),
})

// Nivo charts and several MUI layout components observe their container.
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

// Every CSV/PDF/ICS export path calls createObjectURL; jsdom throws without it.
URL.createObjectURL ??= () => 'blob:mik-test'
URL.revokeObjectURL ??= () => {}

// Not implemented by jsdom, and called by the logbook and HIL sections.
Element.prototype.scrollIntoView ??= () => {}
window.scrollTo = () => {}

// react-big-calendar's drag/select layer (both calendars use it) listens for
// mousedown on `document` and calls this on every one, so without a stub any
// click anywhere in a calendar test throws an uncaught TypeError. jsdom does no
// layout, so `null` — "the point is over nothing" — is the only honest answer;
// it means drag-to-select a slot does not fire in tests, while clicking an
// existing event, which goes through a plain onClick, still does.
document.elementFromPoint ??= () => null

// --- lifecycle -------------------------------------------------------------

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
  // Vitest runs without global test hooks, so Testing Library's automatic
  // cleanup never engages — without this, mounted trees leak between tests and
  // queries start matching the previous test's DOM.
  cleanup()
})

afterAll(() => server.close())
