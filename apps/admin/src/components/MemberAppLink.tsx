import { Link, type LinkProps } from '@mui/material'
import type { ReactNode } from 'react'
import { memberUrlFor } from '@mik/ui/utils/deploymentEnv'

/**
 * Base URL of the member app (`apps/frontend`).
 *
 * This app and the member app are separate subdomains — `intra.mik.fi` in
 * production, `beta.mik.fi` in beta — derived from `VITE_API_TARGET` via
 * `memberUrlFor`, the mirror of `adminUrlFor` on the other side. In
 * development they are separate Vite servers with no `VITE_API_TARGET` set,
 * so this falls back to the member app's own port. Override with
 * `VITE_MEMBER_URL` if you run the member app somewhere else.
 */
export const memberBase = (): string =>
  import.meta.env.VITE_MEMBER_URL ??
  memberUrlFor(import.meta.env.VITE_API_TARGET) ??
  'http://localhost:5173'

/**
 * A link from the admin app into a page that deliberately stayed in the member
 * app — the mirror of `AdminAppRedirect` over there.
 *
 * The flight logbook is the case this exists for. Validating a flight happens
 * on a phone at the aircraft, so #1233 kept it in the member app; but the
 * admin dashboard still lists flights awaiting validation, and clicking one has
 * to cross the app boundary. A plain `<Link to>` would resolve against this
 * app's router and 404.
 *
 * Renders a real anchor, not a router navigation: the destination is a separate
 * single-page app with its own bundle.
 */
export const MemberAppLink = ({
  to,
  children,
  ...props
}: { to: string; children: ReactNode } & Omit<LinkProps, 'href'>) => (
  <Link href={`${memberBase().replace(/\/$/, '')}${to}`} {...props}>
    {children}
  </Link>
)
