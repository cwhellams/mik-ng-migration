import { Box, Typography, Button } from '@mui/material'
import { useNavigate } from 'react-router'

const NotFound = () => {
  const navigate = useNavigate()

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 2,
        textAlign: 'center',
      }}
    >
      <Typography variant='h1' sx={{ fontSize: '6rem', fontWeight: 700, color: 'text.disabled' }}>
        404
      </Typography>
      <Typography variant='h5' sx={{ fontWeight: 600 }}>
        Page not found
      </Typography>
      <Typography variant='body1' color='text.secondary'>
        The page you are looking for does not exist.
      </Typography>
      <Button
        variant='contained'
        onClick={() => navigate('/dashboard')}
        sx={{ mt: 2, borderRadius: 2, textTransform: 'none' }}
      >
        Back to dashboard
      </Button>
    </Box>
  )
}

export default NotFound
