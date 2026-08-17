import {
  Badge,
  Box,
  Button,
  IconButton,
  Typography,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
} from '@mui/material'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useAuth } from '../hooks/useAuth'
import { useMe } from '../hooks/useMe'
import { useMailboxUnreadCount } from '../hooks/useMailbox'
import UserAvatar from '../sections/members/components/UserAvatar'
import useApi from '../hooks/useApi'
import { Member, MIKLang } from '@mik/contracts/members'
import { useTimezone } from '../hooks/useTimezone'
import { getOffsetLabelInTz } from '../utils/date'
import { endpoints } from '../api/endpoints'

const User = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const { me, isLoading, mutate } = useMe()
  const { unreadCount } = useMailboxUnreadCount({ enabled: !!me })

  const { timezone, setTimezone } = useTimezone()

  const logout = useAuth('logout')

  const { mutation } = useApi<Pick<Member, 'lang'>>({
    url: endpoints.members.myLang,
    skipFetch: true,
  })

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleLogout = async () => {
    const { error } = await logout.trigger()
    if (error) {
      console.log(error)
      return
    }

    // Invalidate the cached user so the header immediately shows the Login button
    mutate(undefined)

    handleClose()
    navigate('/logout')
  }

  const changeLanguage = async (lang: MIKLang) => {
    i18n.changeLanguage(lang)
    await mutation.trigger('PATCH', { lang })
    handleClose()
  }

  if (isLoading) {
    return <></>
  }

  return (
    <Box>
      {me ? (
        <>
          <IconButton onClick={handleClick} aria-label={t('header.openAccountMenu')} sx={{ p: 0 }}>
            <UserAvatar email={me.email} firstName={me.firstName} lastName={me.lastName} />
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={handleClose}
            onClick={handleClose}
            slotProps={{
              paper: {
                elevation: 3,
                sx: {
                  minWidth: 200,
                  mt: 1,
                  '& .MuiMenuItem-root': {
                    px: 2,
                    py: 1,
                  },
                },
              },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography
                variant='subtitle1'
                sx={{
                  fontWeight: 'bold',
                }}
              >
                {me.firstName} {me.lastName}
              </Typography>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {me.email}
              </Typography>
            </Box>
            <Divider />
            <MenuItem component={Link} to='/club/members/me'>
              <ListItemIcon>
                <Icon icon='mdi:account' fontSize={20} />
              </ListItemIcon>
              {t('header.profile')}
            </MenuItem>
            <MenuItem component={Link} to='/mailbox'>
              <ListItemIcon>
                <Badge badgeContent={unreadCount || undefined} color='primary'>
                  <Icon icon='mdi:email-outline' fontSize={20} />
                </Badge>
              </ListItemIcon>
              {t('header.mailbox')}
            </MenuItem>
            <MenuItem component={Link} to='/expenses'>
              <ListItemIcon>
                <Icon icon='mdi:currency-eur' fontSize={20} />
              </ListItemIcon>
              {t('header.myExpenses')}
            </MenuItem>
            <MenuItem component={Link} to='/shop/flight-packages'>
              <ListItemIcon>
                <Icon icon='mdi:airplane' fontSize={20} />
              </ListItemIcon>
              {t('header.myFlightPackages')}
            </MenuItem>
            <Divider />
            <Box sx={{ px: 2, py: 1 }}>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('header.language')}
              </Typography>
            </Box>
            <MenuItem onClick={() => changeLanguage(MIKLang.EN)}>
              <ListItemIcon>
                <Icon icon='circle-flags:uk' fontSize={20} />
              </ListItemIcon>
              English
              {i18n.language === MIKLang.EN && (
                <Icon icon='mdi:check' fontSize={20} style={{ marginLeft: 'auto' }} />
              )}
            </MenuItem>
            <MenuItem onClick={() => changeLanguage(MIKLang.FI)}>
              <ListItemIcon>
                <Icon icon='circle-flags:fi' fontSize={20} />
              </ListItemIcon>
              Suomi
              {i18n.language === MIKLang.FI && (
                <Icon icon='mdi:check' fontSize={20} style={{ marginLeft: 'auto' }} />
              )}
            </MenuItem>
            <MenuItem onClick={() => changeLanguage(MIKLang.SV)}>
              <ListItemIcon>
                <Icon icon='circle-flags:se' fontSize={20} />
              </ListItemIcon>
              Svenska
              {i18n.language === MIKLang.SV && (
                <Icon icon='mdi:check' fontSize={20} style={{ marginLeft: 'auto' }} />
              )}
            </MenuItem>
            <Divider />

            <Box sx={{ px: 2, py: 1 }}>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('flightLog.timeZone')}
              </Typography>
            </Box>
            <MenuItem onClick={() => setTimezone('utc')}>
              <ListItemIcon>
                <Icon icon='mdi:earth' fontSize={25} />
              </ListItemIcon>
              {t('flightLog.utcTime')}
              {timezone === 'utc' && (
                <Icon icon='mdi:check' fontSize={20} style={{ marginLeft: 'auto' }} />
              )}
            </MenuItem>
            <MenuItem onClick={() => setTimezone('local')}>
              <ListItemIcon>
                <Icon icon='mdi:map-marker' fontSize={25} />
              </ListItemIcon>
              {t('flightLog.localTime')} {getOffsetLabelInTz(undefined, 'local')}
              {timezone === 'local' && (
                <Icon icon='mdi:check' fontSize={20} style={{ marginLeft: 'auto' }} />
              )}
            </MenuItem>

            <Box sx={{ px: 2, py: 1 }}>
              <Typography
                variant='caption'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('header.timezoneInfo')}
              </Typography>
            </Box>

            <Divider />

            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <Icon icon='mdi:logout' fontSize={20} color='#f44336' />
              </ListItemIcon>
              <Typography
                sx={{
                  color: 'error.main',
                }}
              >
                {t('header.logout')}
              </Typography>
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
