import { Link, useLocation } from 'react-router-dom'
import { LoginLayout } from './LoginLayout'
import { Box, Typography } from '@mui/material'

export const LoginSent = () => {
  const location = useLocation()

  return (
    <LoginLayout title='Check your email'>
      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant='body2' color='text.primary'>
          Login link has been sent to {location.state.email}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant='body2' color='text.secondary'>
          Verification code: {location.state.code}
        </Typography>
      </Box>

      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant='body2' color='text.secondary'>
          Not receiving email? <Link to='/login'>Try again</Link>
        </Typography>
      </Box>
    </LoginLayout>
  )
}
