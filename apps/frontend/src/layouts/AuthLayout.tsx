import { Box, Container } from '@mui/material'
import { Outlet } from 'react-router-dom'

const AuthLayout = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        width: '100vw',
        minHeight: '100vh',
      }}
    >
      <Container 
        maxWidth="md" 
        sx={{ 
          my: 4,
          display: 'flex',
          justifyContent: 'center',
          width: '100%'
        }}
      >
        <Outlet />
      </Container>
    </Box>
  )
}

export default AuthLayout 