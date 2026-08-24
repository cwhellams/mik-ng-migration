import { Typography, Box, TextField, Button, CircularProgress, Alert } from '@mui/material'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../hooks/useAuth'
import { LoginLayout } from './LoginLayout'
import { LoginRequest, LoginResponse } from '@mik/contracts/auth'
import { validateInternalPath } from '@mik/contracts/sanitizers'

const Login = () => {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')

  const navigate = useNavigate()
  const location = useLocation()

  const { isMutating, trigger } = useAuth<LoginRequest, LoginResponse>('login')

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError('')

    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address')
      return
    }

    const safeTarget = validateInternalPath(location.state?.target ?? null)
    const { error } = await trigger({ email })

    if (error) {
      setEmailError(error?.detail ?? error?.title ?? 'Failed to send login link')
    } else {
      navigate('/login/sent', { state: { email, target: safeTarget } })
    }
  }

  return (
    <LoginLayout title='Sign in to continue'>
      <Box
        component='form'
        onSubmit={handleSubmit}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <TextField
          label='Email address'
          type='email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          autoFocus
          autoComplete='email'
          error={!!emailError}
        />

        {emailError && <Alert severity='error'>{emailError}</Alert>}

        <Button
          type='submit'
          variant='contained'
          color='primary'
          fullWidth
          size='large'
          disabled={isMutating || !email}
          sx={{ py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 'bold' }}
        >
          {isMutating ? <CircularProgress size={24} color='inherit' /> : 'Send login link'}
        </Button>
      </Box>

      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant='caption' sx={{ color: 'text.secondary' }}>
          Admin access only. Contact the system administrator if you need access.
        </Typography>
      </Box>
    </LoginLayout>
  )
}

export default Login
