import { Tabs, Tab, Box, useTheme, useMediaQuery } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import { t } from 'i18next'
import { MenuItem } from '../config/menuItems'
import { useRoles } from '../hooks/useRoles'
import { useThemeMode } from '../theme/ThemeContext'
import { MIKPermissions } from '@backend/routes/members/models'

export const HeaderSubMenu = ({ parent }: { parent: MenuItem }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const theme = useTheme()
  const { hasAccess } = useRoles()
  const { sudo } = useThemeMode()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))

  const resolvePath = (path: string) =>
    path.startsWith('/') ? path : `${parent.path}/${path}`

  const subItems = parent.subItems?.filter((i) => {
    if (i.adminModeOnly === true && !sudo) {
      return false
    }
    // requiresDtoElevatedAccess: requires dto.instructor OR (sudo + dto.admin).
    // Pure admins with sudo off must not see instructor/admin-only DTO sub-items.
    if (i.requiresDtoElevatedAccess) {
      const hasInstructor = hasAccess(MIKPermissions.DTO_INSTRUCTOR)
      const hasAdminSudo = sudo && hasAccess(MIKPermissions.DTO_ADMIN)
      if (!hasInstructor && !hasAdminSudo) {
        return false
      }
    }
    return hasAccess(...(i.requiredRoles ?? []))
  })

  if (!subItems || subItems.length == 0) {
    return null
  }

  const isUnderParent = location.pathname.startsWith(parent.path)
  const isUnderAbsoluteSubItem = subItems.some(
    (item) =>
      item.path.startsWith('/') && location.pathname.startsWith(item.path)
  )

  // Show nothing if not under the parent path or one of its absolute sub-items
  if (!isUnderParent && !isUnderAbsoluteSubItem) {
    return null
  }

  const currentTab = subItems.findIndex((item) => {
    if (item.path === '') {
      // Index tab: exact match on parent path to avoid matching every nested route
      const normalizedParent = parent.path.endsWith('/')
        ? parent.path
        : parent.path + '/'
      return (
        location.pathname === parent.path ||
        location.pathname === normalizedParent
      )
    }
    const resolved = resolvePath(item.path)
    return resolved.length > 0 && location.pathname.startsWith(resolved)
  })

  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: theme.palette.background.paper,
        left: 0,
        right: 0,
        zIndex: theme.zIndex.appBar - 1,

        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: '1400px',
        }}
      >
        <Tabs
          value={currentTab === -1 ? 0 : currentTab}
          aria-label='Submenu'
          textColor='primary'
          indicatorColor='primary'
          variant={isDesktop ? 'standard' : 'scrollable'}
          centered={isDesktop}
          scrollButtons='auto'
          sx={{
            width: '100%',
            color: 'black',
            '& .MuiTabs-scrollButtons': {
              color: theme.palette.text.primary,
            },
          }}
        >
          {subItems.map((item) => (
            <Tab
              onClick={() => navigate(resolvePath(item.path))}
              key={item.path}
              label={t(item.label)}
            />
          ))}
        </Tabs>
      </Box>
    </Box>
  )
}
