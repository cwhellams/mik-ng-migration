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

interface HeaderProps {
  window?: () => Window
}

const Header = (props: HeaderProps) => {
  const { window } = props
  const theme = useTheme()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { t } = useTranslation()
  const location = useLocation()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

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

  const drawerContent = (
    <Box sx={{ width: 250 }} role='presentation' onClick={closeDrawer}>
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={theme.palette.mode === 'dark' ? MikLogoWhite : MikLogo}
          alt='MIK Logo'
          style={{
            height: 40,
            width: 'auto',
          }}
        />
      </Box>
      <Divider />
      <List>
        {menuItems.map((item) => (
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
              <ListItemText primary={t(item.translationKey)} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  )

  return (
    <AppBar
      position='fixed'
      elevation={isScrolled ? 2 : 0}
      sx={{
        backgroundColor: (theme) =>
          theme.palette.mode === 'dark'
            ? 'rgba(30, 30, 30, 0.85)'
            : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(8px)',
        transition: 'transform 0.3s, backdrop-filter 0.3s, box-shadow 0.3s',
        borderBottom: isScrolled
          ? 'none'
          : `1px solid ${theme.palette.divider}`,
        width: '100%',
        left: 0,
        right: 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(-100%)',
      }}
    >
      <Toolbar sx={{ height: 70 }}>
        <Container
          maxWidth='lg'
          sx={{ display: 'flex', width: '100%', alignItems: 'center' }}
        >
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
              <img
                src={theme.palette.mode === 'dark' ? MikLogoWhite : MikLogo}
                alt='MIK Logo'
                style={{
                  height: 40,
                  width: 'auto',
                }}
              />
            </Box>
          )}

          {/* Navigation Links - Only on Desktop */}
          {!isMobile && (
            <Box sx={{ flexGrow: 1, display: 'flex', gap: 2 }}>
              {menuItems.map((item) => (
                <Button
                  key={item.path}
                  component={Link}
                  to={item.path}
                  color='inherit'
                  sx={{
                    color: theme.palette.text.primary,
                    fontWeight:
                      location.pathname === item.path ? 'bold' : 'normal',
                  }}
                >
                  {t(item.translationKey)}
                </Button>
              ))}
            </Box>
          )}

          {/* Mobile Logo - Center */}
          {isMobile && (
            <Box
              sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}
            >
              <img
                src={theme.palette.mode === 'dark' ? MikLogoWhite : MikLogo}
                alt='MIK Logo'
                style={{
                  height: 40,
                  width: 'auto',
                }}
              />
            </Box>
          )}

          {/* User Avatar and Theme Toggle - Always Visible */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ThemeToggle />
            <User />
          </Box>
        </Container>
      </Toolbar>

      {/* Mobile Drawer */}
      <Drawer
        anchor='left'
        open={drawerOpen}
        onClose={closeDrawer}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile
        }}
        PaperProps={{
          sx: {
            boxShadow: 3,
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
