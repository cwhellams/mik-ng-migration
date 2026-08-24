import {
  render,
  renderHook,
  type RenderHookResult,
  type RenderOptions as RtlRenderOptions,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import type { ReactElement, ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'

import i18n from '../i18n'

export interface ProviderOptions {
  /** UI language. Defaults to English so tests can assert on real strings. */
  language?: 'en' | 'fi' | 'sv'
}

/**
 * Deliberately MUI's *default* theme rather than either app's.
 *
 * Everything in this package is generic by definition — if a component only
 * renders correctly under `apps/frontend`'s palette, it is app-specific and
 * does not belong here. Testing against the stock theme is what keeps that
 * true, and it is why this harness is a fraction of the size of the two apps'.
 */
const theme = createTheme()

const Providers = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </I18nextProvider>
)

/** Renders a component inside i18n and a stock MUI theme. */
export const renderWithProviders = (
  ui: ReactElement,
  options: ProviderOptions & Omit<RtlRenderOptions, 'wrapper'> = {},
): RenderResult & { user: ReturnType<typeof userEvent.setup> } => {
  i18n.changeLanguage(options.language ?? 'en')

  // Set up before rendering, as user-event's docs require.
  const user = userEvent.setup()

  const result = render(ui, { ...options, wrapper: Providers })

  return { ...result, user }
}

/** The `renderHook` counterpart, for hooks that need i18n or the theme. */
export const renderHookWithProviders = <Result, Props>(
  hook: (props: Props) => Result,
  options: ProviderOptions & { initialProps?: Props } = {},
): RenderHookResult<Result, Props> => {
  i18n.changeLanguage(options.language ?? 'en')

  return renderHook(hook, { initialProps: options.initialProps, wrapper: Providers })
}
