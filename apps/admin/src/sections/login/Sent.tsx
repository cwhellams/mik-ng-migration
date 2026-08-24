import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { LoginLayout } from './LoginLayout'
import { Box, Typography, TextField, Button, CircularProgress, Alert } from '@mui/material'
import { useAuth } from '../../hooks/useAuth'
import { VerifyCodeRequest, VerifyResponse } from '@mik/contracts/auth'
import { validateInternalPath } from '@mik/contracts/sanitizers'

const LoginSent = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const email: string = location.state?.email ?? ''
  const target: string | undefined = location.state?.target

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

  const { isMutating, trigger } = useAuth<VerifyCodeRequest, VerifyResponse>('login/verify-code')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCodeError('')

    if (code.length !== 5) {
      setCodeError('Please enter the 5-digit code')
      return
    }

    const { error } = await trigger({ email, code })

    if (error) {
      setCodeError(error?.detail ?? error?.title ?? 'Invalid code')
    } else {
      navigate(validateInternalPath(target ?? null))
    }
  }

  return (
    <LoginLayout title='Check your email'>
      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant='body2'>Login link sent to {email}</Typography>
      </Box>
      <Box
        component='form'
        onSubmit={handleSubmit}
        sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <Typography variant='body2' sx={{ color: 'text.secondary', textAlign: 'center' }}>
          Enter the 5-digit code from the email, or click the link directly.
        </Typography>

        <TextField
          label='Verification code'
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
          fullWidth
          autoFocus
          error={!!codeError}
          slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 5 } }}
        />

        {codeError && <Alert severity='error'>{codeError}</Alert>}

        <Button
          type='submit'
          variant='contained'
          color='primary'
          fullWidth
          size='large'
          disabled={isMutating || code.length !== 5}
          sx={{ py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 'bold' }}
        >
          {isMutating ? <CircularProgress size={24} color='inherit' /> : 'Verify code'}
        </Button>
      </Box>
      <Box sx={{ textAlign: 'center', mt: 3 }}>
        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
          Didn&apos;t receive the email? <Link to='/login'>Try again</Link>
        </Typography>
      </Box>
    </LoginLayout>
  )
}

export default LoginSent
