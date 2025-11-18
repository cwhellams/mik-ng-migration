import { Tabs, Tab, Box, useTheme } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import { t } from 'i18next'
import { MenuItem } from '../config/menuItems'

export const HeaderSubMenu = ({ parent }: { parent: MenuItem }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const theme = useTheme()

  const currentTab = parent.subItems?.findIndex(
    (item) => item.path.length > 0 && location.pathname.includes(item.path)
  )

  const goTo = (path: string) => navigate(`${parent.path}/${path}`)

  // Show nothing if not under the parent path
  if (!location.pathname.startsWith(`${parent.path}`)) {
    return null
  }

  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: theme.palette.background.paper,
        left: 0,
        right: 0,
        zIndex: theme.zIndex.appBar - 1,
      }}
    >
      <Tabs
        value={currentTab === -1 ? 0 : currentTab}
        aria-label='Accounting submenu'
        centered
        textColor='primary'
        indicatorColor='primary'
      >
        {parent.subItems?.map((item) => (
          <Tab
            onClick={() => goTo(item.path)}
            key={item.path}
            label={t(item.label)}
          />
        ))}
      </Tabs>
    </Box>
  )
}
