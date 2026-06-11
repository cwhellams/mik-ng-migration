import { useState, useEffect } from 'react'
import {
  AppBar,
  Toolbar,
  Box,
  Button,
  Container,
  useScrollTrigger,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  useMediaQuery,
  ListItemIcon,
  Typography,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Link, useLocation } from 'react-router-dom'
import MikLogo from '../assets/mik-blue.svg'
import MikLogoWhite from '../assets/mik-white.svg'
import { useTranslation } from 'react-i18next'
import User from './User'
import { Icon } from '@iconify/react'
import { menuItems } from '../config/menuItems'
import { useSwipeable } from 'react-swipeable'
import ThemeToggle from './ThemeToggle'
import AdminToggle from './AdminToggle'
import { useRoles } from '../hooks/useRoles'
import { useThemeMode } from '../theme/ThemeContext'
import { HeaderSubMenu } from './HeaderSubMenu'
import ClockDisplay from './ClockDisplay'
import { MIKPermissions } from '@backend/routes/members/models'
import { useMyDtoSyllabus } from '../sections/dto/useMyDtoSyllabus'

interface HeaderProps {
  window?: () => Window
}

const hostName =
  import.meta.env.VITE_API_TARGET?.replace('https://', '').replace('.mik.fi', '') ?? 'local'

const Header = (props: HeaderProps) => {
  const { window } = props
  const theme = useTheme()
  const { sudo } = useThemeMode()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { t } = useTranslation()
  const location = useLocation()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { hasAccess } = useRoles()

  // Only fetch the active DTO syllabus when the user is acting as a plain
  // DTO_USER (student).  Instructors always see the DTO nav; admins only see
  // it when sudo mode is on — when sudo is off they are treated as students
  // and the syllabus check applies.
  const hasElevatedDtoRole =
    hasAccess(MIKPermissions.DTO_INSTRUCTOR) || (sudo && hasAccess(MIKPermissions.DTO_ADMIN))
  const { activeSyllabus } = useMyDtoSyllabus(
    // Skip the fetch when the user already has elevated access (always sees nav)
    // or when they have neither DTO_USER nor elevated access (nav never shows).
    hasElevatedDtoRole || !hasAccess(MIKPermissions.DTO_USER),
  )

  // Check if the page has been scrolled
  const scrollTrigger = useScrollTrigger({
    disableHysteresis: true,
    threshold: 0,
    target: window ? window() : undefined,
  })

  // Hide on scroll down, show on scroll up
  const scrollDirectionTrigger = useScrollTrigger({
    target: window ? window() : undefined,
    threshold: 100, // Add some threshold so it doesn't trigger on small scrolls
  })

  useEffect(() => {
    setIsScrolled(scrollTrigger)
  }, [scrollTrigger])

  useEffect(() => {
    setIsVisible(!scrollDirectionTrigger)
  }, [scrollDirectionTrigger])

  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
  }

  const swipeHandlers = useSwipeable({
    onSwipedRight: () => setDrawerOpen(true),
    onSwipedLeft: () => setDrawerOpen(false),
    trackMouse: false,
  })

  const authorizedMenuItems = menuItems.filter((item) => {
    if (item.adminModeOnly === true && !sudo) {
      return false
    }
    // requiresActiveDtoSyllabus: hide for students (DTO_USER only) without an
    // active syllabus assignment.  Instructors always bypass this gate; admins
    // only bypass it when sudo mode is on (so admins with sudo off still need
    // an active syllabus to see the DTO nav, just like regular members).
    if (item.requiresActiveDtoSyllabus) {
      if (!hasElevatedDtoRole && !activeSyllabus) {
        return false
      }
    }
    return hasAccess(...(item.requiredRoles ?? []))
  })

  const Logo = () => (
    <>
      <img
        src={theme.palette.mode === 'dark' ? MikLogoWhite : MikLogo}
        alt='MIK Logo'
        style={{
          height: 40,
          width: 'auto',
          filter: hostName !== 'intra' ? 'invert(24%) sepia(68%) saturate(5000%)' : undefined,
        }}
      />
      {hostName !== 'intra' && (
        <Typography variant='subtitle2' color='error'>
          {hostName}
        </Typography>
      )}
    </>
  )

  const drawerContent = (
    <Box sx={{ width: 250 }} role='presentation' onClick={closeDrawer}>
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        component={Link}
        to='/'
      >
        <Logo />
      </Box>
      <Divider />
      <List>
        {authorizedMenuItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              component={Link}
              to={item.path}
              selected={location.pathname === item.path}
              sx={{
                '&.Mui-selected': {
                  backgroundColor: 'rgba(0, 35, 133, 0.08)',
                },
              }}
            >
              {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
              <ListItemText primary={t(item.label)} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  )

  return (
    <AppBar
      position='sticky'
      elevation={isScrolled ? 2 : 0}
      sx={{
        backgroundColor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(8px)',
        transition: 'transform 0.3s, backdrop-filter 0.3s, box-shadow 0.3s',
        borderBottom: isScrolled ? 'none' : `1px solid ${theme.palette.divider}`,
        width: '100%',
        left: 0,
        right: 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(-100%)',
      }}
    >
      <Toolbar sx={{ height: 70 }}>
        <Container maxWidth='lg' sx={{ display: 'flex', width: '100%', alignItems: 'center' }}>
          {/* Burger Menu for Mobile */}
          {isMobile && (
            <IconButton
              edge='start'
              color='inherit'
              size='large'
              aria-label='menu'
              onClick={toggleDrawer}
              sx={{
                mr: 1,
                color: theme.palette.text.primary,
                '&:focus': {
                  outline: 'none', // Remove outline on focus
                },
              }}
            >
              <Icon icon='mdi:menu' width={24} height={24} />
            </IconButton>
          )}

          {/* Logo with link to home */}
          {!isMobile && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                mr: 4,
              }}
              component={Link}
              to='/'
            >
              <Logo />
            </Box>
          )}

          {/* Navigation Links - Only on Desktop */}
          {!isMobile && (
            <Box sx={{ flexGrow: 1, display: 'flex', gap: 2 }}>
              {authorizedMenuItems.map((item) => (
                <Button
                  key={item.path}
                  component={Link}
                  to={item.path}
                  color='inherit'
                  sx={{
                    color: theme.palette.text.primary,
                    fontWeight: location.pathname.startsWith(item.path) ? 'bold' : 'normal',
                  }}
                >
                  {t(item.label)}
                </Button>
              ))}
            </Box>
          )}

          {/* Mobile Logo - Center */}
          {isMobile && (
            <Box
              sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}
              component={Link}
              to='/'
            >
              <Logo />
            </Box>
          )}

          {/* User Avatar and Theme Toggle - Always Visible */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ClockDisplay />
            <AdminToggle />
            <ThemeToggle />
            <User />
          </Box>
        </Container>
      </Toolbar>

      {authorizedMenuItems
        .filter((item) => item.subItems && item.subItems.length > 0)
        .map((item) => (
          <HeaderSubMenu key={item.path} parent={item} />
        ))}

      {/* Mobile Drawer */}
      <Drawer
        anchor='left'
        open={drawerOpen}
        onClose={closeDrawer}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile
        }}
        slotProps={{
          paper: {
            sx: {
              boxShadow: 3,
            },
          },
        }}
      >
        <Box {...swipeHandlers} sx={{ width: '100%' }}>
          {drawerContent}
        </Box>
      </Drawer>
    </AppBar>
  )
}

export default Header
