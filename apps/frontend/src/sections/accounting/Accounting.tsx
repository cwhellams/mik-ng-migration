import { Outlet } from 'react-router-dom'
import { Box, Toolbar } from '@mui/material'
import AccountingSubMenu from './AccountingSubMenu'


export default function AccountingLayout() {
  return (
    <>
      {/* Add Toolbar to offset fixed AppBar */}
      <Toolbar />
      {/* Accounting submenu below AppBar */}
      <AccountingSubMenu />

      {/* Main content with padding to avoid being hidden behind fixed submenu */}
      <Box sx={{ pt: '112px', px: 3 }}>
        {/* 70px Toolbar + 42px submenu height approx */}
        <Outlet />
      </Box>
    </>
  )
}
