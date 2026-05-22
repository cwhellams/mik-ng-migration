import { Box, Container } from '@mui/material'
import { Outlet } from 'react-router-dom'
import { NotificationBanner } from '../components/NotificationBanner'

const AuthLayout = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        width: '100vw',
        minHeight: '100vh',
      }}
    >
      <NotificationBanner />
      <Container
        maxWidth='md'
        sx={{
          my: 4,
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <Outlet />
      </Container>
    </Box>
  )
}

export default AuthLayout
