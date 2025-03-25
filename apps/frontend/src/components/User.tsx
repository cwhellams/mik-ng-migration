import {
  Box,
  Button,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
} from '@mui/material'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Member } from '@backend/routes/members/models'
import useApi from '../hooks/useApi'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useAuth } from '../hooks/useAuth'

const User = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const { data, isLoading, mutate } = useApi<Member | null>({
    url: 'v1/members/me',
    allowUnauthenticated: true,
  })

  const logout = useAuth('logout')

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleLogout = () => {
    // clear refresh and access tokens
    logout.trigger().then(() => {
      localStorage.removeItem('accessToken')

      // invalidate caches
      mutate()
    })

    handleClose()
    navigate('/')
  }

  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language)
    handleClose()
  }

  // Function to get initials from name
  const getInitials = (firstName: string, lastName?: string) => {
    const firstInitial = firstName ? firstName.charAt(0) : ''
    const lastInitial = lastName ? lastName.charAt(0) : ''
    return `${firstInitial}${lastInitial}`.toUpperCase()
  }

  if (isLoading) {
    return <></>
  }

  return (
    <Box>
      {data ? (
        <>
          <Avatar
            sx={{
              bgcolor: 'primary.main',
              cursor: 'pointer',
              width: 40,
              height: 40,
            }}
            onClick={handleClick}
          >
            {getInitials(data.firstName, data.lastName)}
          </Avatar>
          <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={handleClose}
            onClick={handleClose}
            PaperProps={{
              elevation: 3,
              sx: {
                minWidth: 200,
                mt: 1,
                '& .MuiMenuItem-root': {
                  px: 2,
                  py: 1,
                },
              },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="subtitle1" fontWeight="bold">
                {data.firstName} {data.lastName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {data.email}
              </Typography>
            </Box>
            <Divider />
            <MenuItem component={Link} to="/MyProfile">
              <ListItemIcon>
                <Icon icon="mdi:account" fontSize={20} />
              </ListItemIcon>
              {t('header.profile')}
            </MenuItem>
            <Divider />
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {t('header.language')}
              </Typography>
            </Box>
            <MenuItem onClick={() => changeLanguage('en')}>
              <ListItemIcon>
                <Icon icon="circle-flags:uk" fontSize={20} />
              </ListItemIcon>
              English
              {i18n.language === 'en' && (
                <Icon icon="mdi:check" fontSize={20} style={{ marginLeft: 'auto' }} />
              )}
            </MenuItem>
            <MenuItem onClick={() => changeLanguage('fi')}>
              <ListItemIcon>
                <Icon icon="circle-flags:fi" fontSize={20} />
              </ListItemIcon>
              Suomi
              {i18n.language === 'fi' && (
                <Icon icon="mdi:check" fontSize={20} style={{ marginLeft: 'auto' }} />
              )}
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <Icon icon="mdi:logout" fontSize={20} color="#f44336" />
              </ListItemIcon>
              <Typography color="error.main">{t('header.logout')}</Typography>
            </MenuItem>
          </Menu>
        </>
      ) : (
        <Button
          component={Link}
          to='/login'
          variant='contained'
          color='primary'
          sx={{
            borderRadius: 2,
          }}
        >
          {t('header.login')}
        </Button>
      )}
    </Box>
  )
}

export default User
