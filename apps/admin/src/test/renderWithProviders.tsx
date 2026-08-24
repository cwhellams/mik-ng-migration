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
import type { ReactElement, ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import { SWRConfig } from 'swr'
import i18n from '@mik/ui/i18n'

import { SnackbarProvider } from '../hooks/useSnackbar'
import { ThemeProvider } from '../theme/ThemeContext'

export interface ProviderOptions {
  /** URL the memory router starts at. Defaults to `/`. */
  route?: string

  /**
   * Route pattern to mount the element at, e.g. `/shop/orders/:orderId`.
   * Needed whenever the component under test reads `useParams`.
   */
  path?: string

  /** UI language. Defaults to English so tests can assert on real strings. */
  language?: 'en' | 'fi' | 'sv'

  /** Preferred timezone, as persisted by `ThemeContext`. Defaults to `utc`. */
  timezone?: 'utc' | 'local'

  /** Colour mode. Defaults to `light`. */
  themeMode?: 'light' | 'dark'
}

/**
 * Note what is *absent* compared with `apps/frontend`'s harness: there is no
 * `sudo` option. The admin app has no sudo toggle — entering it is the
 * deliberate admin-intent step — so the axis a member-app test varies over
 * simply does not exist here. Permission-gate tests vary the signed-in member's
 * permissions instead; see `./auth.ts`.
 */
const adapterLocale = (language: string) => (language === 'en' ? 'en-gb' : language)

const Providers = ({ children, options }: { children: ReactNode; options: ProviderOptions }) => {
  const { route = '/', path, language = 'en' } = options

  const routed = path ? (
    <Routes>
      <Route path={path} element={children} />
    </Routes>
  ) : (
    children
  )

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={adapterLocale(language)}>
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
        </LocalizationProvider>
      </ThemeProvider>
    </I18nextProvider>
  )
}

/** Applies the preferences `ThemeContext` reads out of localStorage on mount. */
const seedPreferences = ({ timezone = 'utc', themeMode = 'light' }: ProviderOptions) => {
  localStorage.setItem('adminTimezone', timezone)
  localStorage.setItem('adminThemeMode', themeMode)
}

/**
 * Renders a component inside every provider the admin app supplies: i18n, the
 * MUI theme, date pickers, SWR (with a per-render cache), the snackbar and a
 * router.
 *
 * ```tsx
 * const { user } = renderWithProviders(<ProductsAdmin />)
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

/** The `renderHook` counterpart, for hooks that need providers. */
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
