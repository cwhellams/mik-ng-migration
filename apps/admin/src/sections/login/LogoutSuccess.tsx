import { Box, Button, Typography } from '@mui/material'
import { useNavigate } from 'react-router'
import { LoginLayout } from './LoginLayout'

const LogoutSuccess = () => {
  const navigate = useNavigate()

  return (
    <LoginLayout title='Signed out'>
      <Box sx={{ textAlign: 'center', mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
          You have been signed out of the admin panel.
        </Typography>
        <Button
          variant='contained'
          onClick={() => navigate('/login')}
          sx={{ borderRadius: 2, textTransform: 'none' }}
        >
          Sign in again
        </Button>
      </Box>
    </LoginLayout>
  )
}

export default LogoutSuccess
