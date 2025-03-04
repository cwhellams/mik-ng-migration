import { Typography, Box, TextField, Button, Paper, InputAdornment, CircularProgress, Divider, Fade } from '@mui/material'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import MikLogo from '../../assets/mik-blue.svg'

const Login = () => {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [emailError, setEmailError] = useState('')
  
  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return regex.test(email)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError('')
    
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address')
      return
    }
    
    setIsLoading(true)
    console.log('Login request with email:', email)
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      // Implement actual login logic here
    }, 1500)
  }

  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      width: '100%',
      padding: 2,
    }}>
      <Fade in={true} timeout={800}>
        <Paper 
          elevation={8} 
          sx={{ 
            p: 4, 
            maxWidth: 450, 
            width: '100%', 
            mx: 'auto',
            borderRadius: 2,
            transition: 'all 0.3s ease-in-out',
            '&:hover': {
              boxShadow: '0 14px 28px rgba(0,0,0,0.25), 0 10px 10px rgba(0,0,0,0.22)',
            }
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <img 
              src={MikLogo} 
              alt="MIK Logo" 
              style={{ 
                width: 80,
                height: 'auto',
                marginBottom: '8px',
                filter: 'drop-shadow(0 0 8px rgba(100, 108, 255, 0.3))'
              }} 
            />
            <Typography 
              variant="h4" 
              fontWeight="bold" 
              color="primary"
              sx={{ mb: 1 }}
            >
              Intranet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Enter your email to receive a one-time password
            </Typography>
          </Box>
          
          <Divider sx={{ my: 2 }} />
          
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              variant="outlined"
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              error={!!emailError}
              helperText={emailError}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Icon icon="mdi:email" color="#646cff" />
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '&:hover fieldset': {
                    borderColor: 'primary.main',
                  },
                },
              }}
            />
            
            <Button 
              type="submit" 
              variant="contained" 
              color="primary" 
              fullWidth 
              size="large"
              disabled={isLoading}
              sx={{ 
                mt: 3,
                mb: 2,
                py: 1.5,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 'bold',
                fontSize: '1rem',
                boxShadow: '0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08)',
                transition: 'all 0.2s',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: '0 7px 14px rgba(50, 50, 93, 0.1), 0 3px 6px rgba(0, 0, 0, 0.08)',
                }
              }}
            >
              {isLoading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Request OTP'
              )}
            </Button>
            
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Don't have an account?{' '}
                <Typography 
                  component="span" 
                  variant="body2" 
                  color="primary" 
                  sx={{ 
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    '&:hover': { textDecoration: 'underline' }
                  }}
                >
                  Sign up
                </Typography>
              </Typography>
            </Box>
          </form>
        </Paper>
      </Fade>
    </Box>
  )
}

export default Login