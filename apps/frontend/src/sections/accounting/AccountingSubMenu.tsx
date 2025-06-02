import React from 'react'
import { Tabs, Tab, Box, useTheme } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'

const navItems = [
  { label: 'Dashboard', path: 'dashboard' },
  { label: 'Invoicing', path: 'invoicing' },
  { label: 'Items', path: 'items' },
]

export default function AccountingSubMenu() {
  const location = useLocation()
  const navigate = useNavigate()
  const theme = useTheme()

  const currentTab = navItems.findIndex((item) =>
    location.pathname.includes(item.path)
  )

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    navigate(`/accounting/${navItems[newValue].path}`)
  }

  // Show nothing if not under /accounting
  if (!location.pathname.startsWith('/accounting')) {
    return null
  }

  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: theme.palette.background.paper,
        position: 'fixed',
        top: 70, // matches your AppBar Toolbar height
        left: 0,
        right: 0,
        zIndex: theme.zIndex.appBar - 1,
      }}
    >
      <Tabs
        value={currentTab === -1 ? 0 : currentTab}
        onChange={handleChange}
        aria-label='Accounting submenu'
        centered
        textColor='primary'
        indicatorColor='primary'
      >
        {navItems.map((item) => (
          <Tab key={item.path} label={item.label} />
        ))}
      </Tabs>
    </Box>
  )
}
