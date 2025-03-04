import { useState, useEffect } from 'react'
import { 
  AppBar, 
  Toolbar, 
  Box, 
  Button, 
  Container,
  useScrollTrigger
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Link, useLocation } from 'react-router-dom'
import MikLogo from '../assets/mik-blue.svg'
import { useTranslation } from 'react-i18next'

interface HeaderProps {
  window?: () => Window
}

const Header = (props: HeaderProps) => {
  const { window } = props
  const theme = useTheme()
  const [isScrolled, setIsScrolled] = useState(false)
  const { t } = useTranslation()
  const location = useLocation()
  
  // Check if the page has been scrolled
  const trigger = useScrollTrigger({
    disableHysteresis: true,
    threshold: 0,
    target: window ? window() : undefined
  })
  
  useEffect(() => {
    setIsScrolled(trigger)
  }, [trigger])

  return (
    <AppBar 
      position="fixed" 
      elevation={isScrolled ? 2 : 0}
      sx={{
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(8px)',
        transition: 'backdrop-filter 0.3s, box-shadow 0.3s',
        borderBottom: isScrolled ? 'none' : `1px solid ${theme.palette.divider}`,
        width: '100%',
        left: 0,
        right: 0,
      }}
    >
      <Toolbar sx={{ height: 70 }}>
        <Container maxWidth="lg" sx={{ display: 'flex', width: '100%' }}>
          {/* Logo with link to home */}
          <Box 
            sx={{ 
              display: 'flex', 
              alignItems: 'center',
              mr: 4
            }}
            component={Link}
            to="/"
          >
            <img 
              src={MikLogo} 
              alt="MIK Logo" 
              style={{ 
                height: 40,
                width: 'auto'
              }} 
            />
          </Box>
          
          {/* Navigation Links */}
          <Box sx={{ flexGrow: 1, display: 'flex', gap: 2 }}>
            <Button 
              component={Link} 
              to="/" 
              color="inherit" 
              sx={{ 
                color: theme.palette.text.primary,
                fontWeight: location.pathname === '/' ? 'bold' : 'normal'
              }}
            >
              {t('header.dashboard')}
            </Button>
            <Button 
              component={Link} 
              to="/schedule" 
              color="inherit" 
              sx={{ 
                color: theme.palette.text.primary,
                fontWeight: location.pathname === '/schedule' ? 'bold' : 'normal'
              }}
            >
              {t('header.schedule')}
            </Button>
            <Button 
              component={Link} 
              to="/aircraft" 
              color="inherit" 
              sx={{ 
                color: theme.palette.text.primary,
                fontWeight: location.pathname === '/aircraft' ? 'bold' : 'normal'
              }}
            >
              {t('header.aircraft')}
            </Button>
            <Button 
              component={Link} 
              to="/members" 
              color="inherit" 
              sx={{ 
                color: theme.palette.text.primary,
                fontWeight: location.pathname === '/members' ? 'bold' : 'normal'
              }}
            >
              {t('header.members')}
            </Button>
          </Box>
          
          {/* Right side - Login button */}
          <Box>
            <Button 
              component={Link}
              to="/login"
              variant="contained" 
              color="primary"
              sx={{ 
                borderRadius: 2,
              }}
            >
              {t('header.login')}
            </Button>
          </Box>
        </Container>
      </Toolbar>
    </AppBar>
  )
}

export default Header