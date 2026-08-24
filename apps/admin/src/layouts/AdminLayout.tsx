import { useState } from 'react'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Tooltip,
  Avatar,
  Menu,
  MenuItem,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { Outlet, useNavigate, useLocation, Link } from 'react-router'
import { ListSubheader } from '@mui/material'
import { useMe } from '../hooks/useMe'
import { useAuth } from '../hooks/useAuth'
import { useRoles } from '../hooks/useRoles'
import { navGroups } from '../config/navItems'

const DRAWER_WIDTH = 240

const AdminLayout = () => {
  const { me } = useMe()
  const { hasAccess } = useRoles()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const { trigger: triggerLogout } = useAuth('logout')

  // Drop the items this admin may not reach, then the groups that emptied as a
  // result — a heading over nothing reads as a broken page.
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAccess(...item.permissions)),
    }))
    .filter((group) => group.items.length > 0)

  const handleLogout = async () => {
    setAnchorEl(null)
    await triggerLogout()
    navigate('/login')
  }

  const initials = me
    ? `${me.firstName?.charAt(0) ?? ''}${me.lastName?.charAt(0) ?? ''}`.toUpperCase()
    : '?'

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Persistent sidebar */}
      <Drawer
        variant='permanent'
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
          },
        }}
      >
        {/* Sidebar header */}
        <Toolbar
          sx={{
            px: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Box
            component={Link}
            to='/dashboard'
            sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none' }}
          >
            <Box
              component='img'
              src='/mik-white.svg'
              alt='MIK Logo'
              sx={{ width: 32, height: 32 }}
            />
            <Box>
              <Typography
                variant='subtitle2'
                sx={{ color: 'primary.contrastText', fontWeight: 700, lineHeight: 1.2 }}
              >
                MIK ATC
              </Typography>
              <Typography
                variant='caption'
                sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem' }}
              >
                Admin
              </Typography>
            </Box>
          </Box>
        </Toolbar>

        {/* Navigation items */}
        <List sx={{ pt: 1, flex: 1, overflowY: 'auto' }}>
          {visibleGroups.map((group) => (
            <Box key={group.label ?? 'top'} component='li' sx={{ listStyle: 'none' }}>
              {group.label && (
                <ListSubheader
                  disableSticky
                  sx={{
                    bgcolor: 'transparent',
                    color: 'rgba(255,255,255,0.55)',
                    fontSize: '0.7rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    lineHeight: 2.4,
                  }}
                >
                  {t(group.label)}
                </ListSubheader>
              )}
              <List disablePadding>
                {group.items.map((item) => {
                  // Exact match, not `startsWith`: /shop would otherwise light up
                  // for every /shop/* page and the sidebar would show two
                  // selected items at once.
                  const isActive = location.pathname === item.path
                  return (
                    <ListItem key={item.path} disablePadding>
                      <ListItemButton
                        component={Link}
                        to={item.path}
                        selected={isActive}
                        sx={{
                          mx: 1,
                          borderRadius: 1,
                          bgcolor: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                          '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.15)' },
                          '&.Mui-selected:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
                        }}
                      >
                        <ListItemIcon sx={{ color: 'primary.contrastText', minWidth: 36 }}>
                          <Icon icon={item.icon} width={20} />
                        </ListItemIcon>
                        <ListItemText
                          primary={t(item.label)}
                          slotProps={{ primary: { sx: { fontSize: '0.875rem' } } }}
                          sx={{ color: 'primary.contrastText' }}
                        />
                      </ListItemButton>
                    </ListItem>
                  )
                })}
              </List>
            </Box>
          ))}
        </List>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

        {/* User info at bottom */}
        <Box sx={{ p: 2 }}>
          <Tooltip title={me?.email ?? ''} placement='right'>
            <IconButton
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{ p: 0, width: '100%', borderRadius: 1 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  width: '100%',
                  p: 0.5,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                <Avatar
                  sx={{ width: 32, height: 32, bgcolor: 'secondary.main', fontSize: '0.8rem' }}
                >
                  {initials}
                </Avatar>
                <Box sx={{ textAlign: 'left', overflow: 'hidden', flex: 1 }}>
                  <Typography
                    variant='body2'
                    sx={{ color: 'primary.contrastText', fontWeight: 600, lineHeight: 1.2 }}
                    noWrap
                  >
                    {me?.firstName} {me?.lastName}
                  </Typography>
                  <Typography
                    variant='caption'
                    sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}
                    noWrap
                  >
                    {me?.email}
                  </Typography>
                </Box>
                <Icon icon='mdi:chevron-up' color='rgba(255,255,255,0.6)' width={16} />
              </Box>
            </IconButton>
          </Tooltip>
        </Box>
      </Drawer>

      {/* User menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MenuItem onClick={handleLogout}>
          <Icon icon='mdi:logout' style={{ marginRight: 8 }} />
          Sign out
        </MenuItem>
      </Menu>

      {/* Main content area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top app bar */}
        <AppBar
          position='static'
          elevation={0}
          sx={{
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Toolbar>
            <Typography variant='h6' sx={{ color: 'text.primary', fontWeight: 600 }}>
              MIK Admin
            </Typography>
          </Toolbar>
        </AppBar>

        {/* Page content */}
        <Box
          component='main'
          sx={{
            flex: 1,
            overflow: 'auto',
            bgcolor: 'background.default',
            p: 3,
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}

export default AdminLayout
