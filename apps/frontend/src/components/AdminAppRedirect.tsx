import { useEffect } from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'

/**
 * Base URL of the admin app (`apps/admin`).
 *
 * Defaults to the path the DO App Platform spec serves it from. In development
 * the admin app runs on its own Vite port, so set `VITE_ADMIN_URL=http://localhost:5174`
 * in `apps/frontend/.env.local` to follow these redirects to a local instance.
 */
const ADMIN_BASE = import.meta.env.VITE_ADMIN_URL ?? '/atc'

/**
 * Sends an old in-app `/admin/*` link to the same path in the admin app.
 *
 * The admin pages moved out of this app in #1233, but members' bookmarks and
 * links in old emails did not. The admin app deliberately kept the sub-paths
 * identical (`/admin/shop/orders` → `<admin>/shop/orders`), so this is a plain
 * prefix swap rather than a route table that would have to be kept in step.
 *
 * A full page load, not a router navigation: the destination is a separate
 * single-page app with its own bundle.
 */
const AdminAppRedirect = () => {
  const { t } = useTranslation()
  const { pathname, search, hash } = useLocation()

  useEffect(() => {
    const rest = pathname.replace(/^\/admin\/?/, '')
    window.location.replace(`${ADMIN_BASE.replace(/\/$/, '')}/${rest}${search}${hash}`)
  }, [pathname, search, hash])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 8 }}>
      <CircularProgress />
      <Typography>{t('admin.redirecting')}</Typography>
    </Box>
  )
}

export default AdminAppRedirect
