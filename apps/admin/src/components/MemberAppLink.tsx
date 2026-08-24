import { Link, type LinkProps } from '@mui/material'
import type { ReactNode } from 'react'

/**
 * Base URL of the member app (`apps/frontend`).
 *
 * Defaults to `/`, which is where the DO App Platform spec serves it from — the
 * admin app sits at `/atc` on the same host. In development the two run on
 * different Vite ports, so set `VITE_MEMBER_URL=http://localhost:5173` in
 * `apps/admin/.env.local` to follow these links to a local instance.
 */
const MEMBER_BASE = import.meta.env.VITE_MEMBER_URL ?? ''

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
  <Link href={`${MEMBER_BASE.replace(/\/$/, '')}${to}`} {...props}>
    {children}
  </Link>
)
