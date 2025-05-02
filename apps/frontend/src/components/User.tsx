import {
  Box,
  Button,
  Typography,

  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
} from '@mui/material'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {  useState } from 'react'
import { Icon } from '@iconify/react'
import { useAuth } from '../hooks/useAuth'
import { useMe } from '../hooks/useMe'
import UserAvatar from '../sections/members/components/UserAvatar'

const User = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const { me, isLoading, mutate } = useMe()

  const logout = useAuth('logout')

    
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleLogout = async () => {
    // clear refresh and access tokens
    const { error } = await logout.trigger()
    if (error) {
      console.log(error)
      return
    }

    localStorage.removeItem('accessToken')

    // invalidate cache
    mutate(undefined)

    handleClose()
    navigate('/')
  }

  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language)
    handleClose()
  }
  
  if (isLoading) {
    return <></>
  }

  return (
    <Box>
      {me ? (
        <>
          <UserAvatar
            email={me.email} 
          firstName={me.firstName}
          lastName={me.lastName}
          onClick={handleClick}
          />
          
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
              <Typography variant='subtitle1' fontWeight='bold'>
                {me.firstName} {me.lastName}
              </Typography>
              <Typography variant='body2' color='text.secondary'>
                {me.email}
              </Typography>
            </Box>
            <Divider />
            <MenuItem component={Link} to='/members/me'>
              <ListItemIcon>
                <Icon icon='mdi:account' fontSize={20} />
              </ListItemIcon>
              {t('header.profile')}
            </MenuItem>
            <Divider />
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant='body2' color='text.secondary'>
                {t('header.language')}
              </Typography>
            </Box>
            <MenuItem onClick={() => changeLanguage('en')}>
              <ListItemIcon>
                <Icon icon='circle-flags:uk' fontSize={20} />
              </ListItemIcon>
              English
              {i18n.language === 'en' && (
                <Icon
                  icon='mdi:check'
                  fontSize={20}
                  style={{ marginLeft: 'auto' }}
                />
              )}
            </MenuItem>
            <MenuItem onClick={() => changeLanguage('fi')}>
              <ListItemIcon>
                <Icon icon='circle-flags:fi' fontSize={20} />
              </ListItemIcon>
              Suomi
              {i18n.language === 'fi' && (
                <Icon
                  icon='mdi:check'
                  fontSize={20}
                  style={{ marginLeft: 'auto' }}
                />
              )}
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <Icon icon='mdi:logout' fontSize={20} color='#f44336' />
              </ListItemIcon>
              <Typography color='error.main'>{t('header.logout')}</Typography>
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
