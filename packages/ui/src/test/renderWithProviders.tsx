import {
  render,
  renderHook,
  type RenderHookResult,
  type RenderOptions as RtlRenderOptions,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import { SWRConfig } from 'swr'

import i18n from '../i18n'
import { ApiConfigProvider } from '../hooks/apiConfig'
import { SnackbarProvider } from '../hooks/useSnackbar'
import { TimezoneProvider } from '../hooks/useTimezone'
import type { TimezonePreference } from '../utils/timezoneFormatters'

export interface ProviderOptions {
  /** UI language. Defaults to English so tests can assert on real strings. */
  language?: 'en' | 'fi' | 'sv'

  /** URL the memory router starts at. Defaults to `/`. */
  route?: string

  /**
   * Route pattern to mount the element at, e.g. `/club/members/:memberId`.
   * Needed whenever the component under test reads `useParams`.
   */
  path?: string

  /**
   * Whether `useApi` sends requests in admin context. Defaults to false —
   * `apps/frontend`'s sudo-off state, and the stricter of the two.
   *
   * This is a plain boolean rather than the live toggle the member app wraps it
   * in: what belongs to this package is that `useApi` reads its context, not
   * where either app keeps the state feeding it.
   */
  sudo?: boolean

  /**
   * Starting timezone preference. Defaults to `utc`, as both apps do — aviation
   * records are kept in Z and that is what a page shows until someone asks
   * otherwise.
   *
   * Held in state rather than pinned, so a test can drive `setTimezone` and see
   * the formatters follow.
   */
  timezone?: TimezonePreference
}

/**
 * Deliberately MUI's *default* theme rather than either app's.
 *
 * Everything in this package is generic by definition — if a component only
 * renders correctly under `apps/frontend`'s palette, it is app-specific and
 * does not belong here. Testing against the stock theme is what keeps that
 * true.
 *
 * What this harness deliberately lacks, compared with either app's: a server
 * clock and a date-picker localisation provider. Nothing shared needs them, and
 * a component that did would be reaching for app scaffolding. The snackbar is
 * here because `useSnackbar` itself is shared — a component that toasts is not
 * reaching for either app, it is using this package.
 */
const theme = createTheme()

const Providers = ({ children, options }: { children: ReactNode; options: ProviderOptions }) => {
  const { route = '/', path, sudo = false, timezone: initialTimezone = 'utc' } = options

  const apiConfig = useMemo(() => ({ sudo }), [sudo])

  const [timezone, setTimezone] = useState<TimezonePreference>(initialTimezone)
  const timezoneSetting = useMemo(() => ({ timezone, setTimezone }), [timezone])

  const routed = path ? (
    <Routes>
      <Route path={path} element={children} />
    </Routes>
  ) : (
    children
  )

  return (
    <ApiConfigProvider value={apiConfig}>
      <TimezoneProvider value={timezoneSetting}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider theme={theme}>
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
              <MemoryRouter initialEntries={[route]}>
                <SnackbarProvider>{routed}</SnackbarProvider>
              </MemoryRouter>
            </SWRConfig>
          </ThemeProvider>
        </I18nextProvider>
      </TimezoneProvider>
    </ApiConfigProvider>
  )
}

/** Renders a component inside i18n, a stock MUI theme, SWR and a router. */
export const renderWithProviders = (
  ui: ReactElement,
  options: ProviderOptions & Omit<RtlRenderOptions, 'wrapper'> = {},
): RenderResult & { user: ReturnType<typeof userEvent.setup> } => {
  i18n.changeLanguage(options.language ?? 'en')

  // Set up before rendering, as user-event's docs require.
  const user = userEvent.setup()

  const result = render(ui, {
    ...options,
    wrapper: ({ children }) => <Providers options={options}>{children}</Providers>,
  })

  return { ...result, user }
}

/** The `renderHook` counterpart, for hooks that need providers. */
export const renderHookWithProviders = <Result, Props>(
  hook: (props: Props) => Result,
  options: ProviderOptions & { initialProps?: Props } = {},
): RenderHookResult<Result, Props> => {
  i18n.changeLanguage(options.language ?? 'en')

  return renderHook(hook, {
    initialProps: options.initialProps,
    wrapper: ({ children }) => <Providers options={options}>{children}</Providers>,
  })
}
