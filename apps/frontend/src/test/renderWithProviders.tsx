import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import {
  render,
  renderHook,
  type RenderHookResult,
  type RenderOptions as RtlRenderOptions,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, parsePath, Route, Routes } from 'react-router'
import { SWRConfig } from 'swr'
import { ApiConfigProvider } from '@mik/ui/hooks/apiConfig'
import { TimezoneProvider } from '@mik/ui/hooks/useTimezone'

import { ServerClockProvider } from '../hooks/useServerClock'
import { SnackbarProvider } from '@mik/ui/hooks/useSnackbar'
import i18n from '@mik/ui/i18n'
import { ThemeProvider, useThemeMode } from '../theme/ThemeContext'

export interface ProviderOptions {
  /** URL the memory router starts at. Defaults to `/`. */
  route?: string

  /**
   * Router state to start that entry with, as `navigate(to, { state })` would have
   * left behind — for a component that reads `useLocation().state` (e.g. the
   * occurrence form's flight-log prefill).
   */
  routeState?: unknown

  /**
   * Route pattern to mount the element at, e.g. `/club/members/:memberId`.
   * Needed whenever the component under test reads `useParams`.
   */
  path?: string

  /** Start in admin (sudo) mode. Defaults to false, matching a fresh page load. */
  sudo?: boolean

  /** UI language. Defaults to English so tests can assert on real strings. */
  language?: 'en' | 'fi' | 'sv'

  /** Preferred timezone, as persisted by `ThemeContext`. Defaults to `utc`. */
  timezone?: 'utc' | 'local'

  /** Colour mode. Defaults to `light`. */
  themeMode?: 'light' | 'dark'

  /**
   * Wrap in `ServerClockProvider`, which syncs against `GET /api/v1/time`.
   * Defaults to true (as in `App.tsx`). Turn it off for components that don't
   * read the clock and shouldn't have to wait for it to settle.
   */
  serverClock?: boolean
}

/**
 * Turns sudo mode on before rendering children.
 *
 * `ThemeContext` keeps sudo in state and exposes only `toggleSudo`, so it can't
 * be seeded through props. Children are held back for the one render it takes
 * to apply, so nothing ever renders in the wrong mode.
 */
const SudoMode = ({ on, children }: { on: boolean; children: ReactNode }) => {
  const { toggleSudo } = useThemeMode()
  const applied = useRef(false)

  // Applied exactly once: this seeds the starting mode rather than pinning it,
  // so a component under test can still toggle admin mode back off.
  useEffect(() => {
    if (on && !applied.current) {
      applied.current = true
      toggleSudo(true)
    }
  }, [on, toggleSudo])

  if (on && !applied.current) return null
  return <>{children}</>
}

/** Mirrors what `App.tsx` does: derive useApi's config from the live sudo state. */
const ApiConfigFromThemeMode = ({ children }: { children: ReactNode }) => {
  const { sudo, timezone, setTimezone } = useThemeMode()
  const apiConfig = useMemo(() => ({ sudo: sudo ?? false }), [sudo])
  const timezoneSetting = useMemo(() => ({ timezone, setTimezone }), [timezone, setTimezone])
  return (
    <ApiConfigProvider value={apiConfig}>
      <TimezoneProvider value={timezoneSetting}>{children}</TimezoneProvider>
    </ApiConfigProvider>
  )
}

/** Locale the date pickers use — `en-gb` for English, matching `App.tsx`. */
const adapterLocale = (language: string) => (language === 'en' ? 'en-gb' : language)

const Providers = ({ children, options }: { children: ReactNode; options: ProviderOptions }) => {
  const {
    route = '/',
    routeState,
    path,
    sudo = false,
    language = 'en',
    serverClock = true,
  } = options

  const routed = path ? (
    <Routes>
      <Route path={path} element={children} />
    </Routes>
  ) : (
    children
  )

  const snackable = <SnackbarProvider>{routed}</SnackbarProvider>
  const clocked = serverClock ? <ServerClockProvider>{snackable}</ServerClockProvider> : snackable

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <SudoMode on={sudo}>
          {/* Reads the live toggle rather than the `sudo` option, so a component
              that flips admin mode mid-test changes what useApi sends — which is
              what App.tsx does too. */}
          <ApiConfigFromThemeMode>
            <LocalizationProvider
              dateAdapter={AdapterDayjs}
              adapterLocale={adapterLocale(language)}
            >
              <SWRConfig
                value={{
                  // A fresh cache per render, so one test never sees another's data.
                  provider: () => new Map(),
                  dedupingInterval: 0,
                  // Error states should settle immediately instead of waiting out
                  // SWR's exponential backoff. Retry tests can override this.
                  shouldRetryOnError: false,
                }}
              >
                <MemoryRouter
                  initialEntries={[
                    routeState === undefined ? route : { ...parsePath(route), state: routeState },
                  ]}
                >
                  {clocked}
                </MemoryRouter>
              </SWRConfig>
            </LocalizationProvider>
          </ApiConfigFromThemeMode>
        </SudoMode>
      </ThemeProvider>
    </I18nextProvider>
  )
}

/** Applies the preferences `ThemeContext` reads out of localStorage on mount. */
const seedPreferences = ({ timezone = 'utc', themeMode = 'light' }: ProviderOptions) => {
  localStorage.setItem('timezone', timezone)
  localStorage.setItem('themeMode', themeMode)
}

/**
 * Renders a component inside every provider the app supplies: i18n, MUI theme,
 * date pickers, SWR (with a per-render cache), the server clock and a router.
 *
 * ```tsx
 * const { user } = renderWithProviders(<EditBookingModal booking={aBooking()} />)
 * await user.click(screen.getByRole('button', { name: 'Save' }))
 * ```
 */
export const renderWithProviders = (
  ui: ReactElement,
  options: ProviderOptions & Omit<RtlRenderOptions, 'wrapper'> = {},
): RenderResult & { user: ReturnType<typeof userEvent.setup> } => {
  seedPreferences(options)
  i18n.changeLanguage(options.language ?? 'en')

  // Set up before rendering, as user-event's docs require.
  const user = userEvent.setup()

  const result = render(ui, {
    ...options,
    wrapper: ({ children }) => <Providers options={options}>{children}</Providers>,
  })

  return { ...result, user }
}

/**
 * The `renderHook` counterpart, for testing hooks that need providers —
 * anything touching `useApi`, `useRoles`, the router or the theme.
 *
 * ```ts
 * const { result } = renderHookWithProviders(() => useRoles())
 * await waitFor(() => expect(result.current.isLoading).toBe(false))
 * ```
 */
export const renderHookWithProviders = <Result, Props>(
  hook: (props: Props) => Result,
  options: ProviderOptions & { initialProps?: Props } = {},
): RenderHookResult<Result, Props> => {
  seedPreferences(options)
  i18n.changeLanguage(options.language ?? 'en')

  return renderHook(hook, {
    initialProps: options.initialProps,
    wrapper: ({ children }) => <Providers options={options}>{children}</Providers>,
  })
}
