import { Box } from '@mui/material'
import { Outlet } from 'react-router'

const AuthLayout = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        width: '100vw',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Outlet />
    </Box>
  )
}

export default AuthLayout
