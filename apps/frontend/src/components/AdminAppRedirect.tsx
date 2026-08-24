import { useEffect } from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { adminUrlFor } from '@mik/ui/utils/deploymentEnv'

/**
 * Base URL of the admin app (`apps/admin`).
 *
 * The admin app is a genuine subdomain, not a path on this one — `twr.mik.fi`
 * in production, `beta-twr.mik.fi` in beta — derived from `VITE_API_TARGET`
 * via `adminUrlFor` so there is nothing new to configure per environment (see
 * that function's doc for why). In development the two apps are separate Vite
 * servers with no `VITE_API_TARGET` set, so this falls back to the admin app's
 * own port — `pnpm dev` at the repo root starts both. Override with
 * `VITE_ADMIN_URL` if you run the admin app somewhere else.
 */
export const adminBase = (): string =>
  import.meta.env.VITE_ADMIN_URL ??
  adminUrlFor(import.meta.env.VITE_API_TARGET) ??
  'http://localhost:5174'

/**
 * Sends an old in-app admin link to the same path in the admin app.
 *
 * The admin pages moved out of this app in #1233, but members' bookmarks and
 * links in old emails did not. The admin app deliberately kept every path
 * identical — `/admin/shop/orders` → `<admin>/shop/orders`, `/accounting/items`
 * → `<admin>/accounting/items` — so this needs no route table of its own: it
 * forwards whatever it was mounted at.
 *
 * The three `/club/members/{roles,trash,changelog}` screens are the exception,
 * since the admin app has no `/club` prefix. `ADMIN_PATH` handles them.
 *
 * A full page load, not a router navigation: the destination is a separate
 * single-page app with its own bundle.
 */
const AdminAppRedirect = () => {
  const { t } = useTranslation()
  const { pathname, search, hash } = useLocation()

  useEffect(() => {
    // /admin/* loses its prefix (the admin app has no /admin); /accounting/*
    // keeps its own, which is identical over there; /club/members/x becomes
    // /members/x.
    const target = pathname.replace(/^\/admin\/?/, '/').replace(/^\/club\/members\//, '/members/')

    window.location.replace(
      `${adminBase().replace(/\/$/, '')}${target === '/' ? '/' : target}${search}${hash}`,
    )
  }, [pathname, search, hash])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 8 }}>
      <CircularProgress />
      <Typography>{t('admin.redirecting')}</Typography>
    </Box>
  )
}

export default AdminAppRedirect
