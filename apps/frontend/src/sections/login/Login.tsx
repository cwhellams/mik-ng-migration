import {
  Typography,
  Box,
  TextField,
  Button,
  InputAdornment,
  CircularProgress,
} from '@mui/material'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LoginLayout } from './LoginLayout'

const Login = () => {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')

  const navigate = useNavigate()

  const { isMutating, trigger } = useAuth('login')

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

    trigger({ destination: email })
      .then((response) => {
        navigate('/login/sent', { state: { email, code: response.data.code } })
      })
      .catch((error) => {
        console.log('Error:', error)
        setEmailError(error.response.data.message)
      })
  }

  return (
    <LoginLayout title='Enter your email to receive login link'>
      <form onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label='Email'
          variant='outlined'
          margin='normal'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          error={!!emailError}
          helperText={emailError}
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <Icon icon='mdi:email' color='#646cff' />
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
          type='submit'
          variant='contained'
          color='primary'
          fullWidth
          size='large'
          disabled={isMutating}
          sx={{
            mt: 3,
            mb: 2,
            py: 1.5,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 'bold',
            fontSize: '1rem',
            boxShadow:
              '0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08)',
            transition: 'all 0.2s',
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow:
                '0 7px 14px rgba(50, 50, 93, 0.1), 0 3px 6px rgba(0, 0, 0, 0.08)',
            },
          }}
        >
          {isMutating ? (
            <CircularProgress size={24} color='inherit' />
          ) : (
            'Login With Email'
          )}
        </Button>

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Typography variant='body2' color='text.secondary'>
            Don't have an account?{' '}
            <Typography
              component='span'
              variant='body2'
              color='primary'
              sx={{
                cursor: 'pointer',
                fontWeight: 'bold',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              Sign up
            </Typography>
          </Typography>
        </Box>
      </form>
    </LoginLayout>
  )
}

export default Login
