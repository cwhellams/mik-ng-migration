import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'

import i18n from '../i18n'

// Node 26 defines its own `localStorage`/`sessionStorage` globals that stay
// `undefined` unless the process is started with `--localstorage-file`, and
// they shadow jsdom's implementations. i18next's language detector reads
// localStorage on init, so without this every test here throws.
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

// `Title` calls useMediaQuery on first render; jsdom has no matchMedia at all.
// Default to "no match", so components render their desktop layout.
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

beforeAll(async () => {
  // Pin the language so tests assert on real English strings rather than on
  // whatever the browser language detector happens to pick.
  await i18n.changeLanguage('en')
})

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  // Vitest runs without global test hooks, so Testing Library's automatic
  // cleanup never engages — without this, mounted trees leak between tests and
  // queries start matching the previous test's DOM.
  cleanup()
})
