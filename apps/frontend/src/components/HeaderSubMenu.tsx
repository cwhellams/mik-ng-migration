import { Tabs, Tab, Box, useTheme } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import { t } from 'i18next'
import { MenuItem } from '../config/menuItems'
import { useRoles } from '../hooks/useRoles'
import { useThemeMode } from '../theme/ThemeContext'

export const HeaderSubMenu = ({ parent }: { parent: MenuItem }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const theme = useTheme()
  const { hasAccess } = useRoles()
  const { sudo } = useThemeMode()

  const goTo = (path: string) => navigate(`${parent.path}/${path}`)

  // Show nothing if not under the parent path
  if (!location.pathname.startsWith(`${parent.path}`)) {
    return null
  }

  const subItems = parent.subItems?.filter((i) => {
    if (i.adminModeOnly === true && !sudo) {
      return false
    }
    return hasAccess(...(i.requiredRoles ?? []))
  })

  if (!subItems || subItems.length == 0) {
    return null
  }

  const currentTab = subItems.findIndex(
    (item) => item.path.length > 0 && location.pathname.includes(item.path)
  )

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
          variant='scrollable'
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
              onClick={() => goTo(item.path)}
              key={item.path}
              label={t(item.label)}
            />
          ))}
        </Tabs>
      </Box>
    </Box>
  )
}
