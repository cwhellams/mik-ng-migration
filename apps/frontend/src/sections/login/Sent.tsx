import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LoginLayout } from './LoginLayout'
import { Box, Typography, TextField, Button, CircularProgress, Alert } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { VerifyCodeRequest, VerifyResponse } from '@backend/routes/auth/schema'

import { validateInternalPath } from '@backend/util/sanitizers'

const LoginSent = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const email: string = location.state?.email ?? ''
  const target: string | undefined = location.state?.target

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

  // Call the server-side verify-code endpoint; the JWT is never held client-side
  const { isMutating, trigger } = useAuth<VerifyCodeRequest, VerifyResponse>('login/verify-code')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCodeError('')

    if (code.length !== 5) {
      setCodeError(t('login.invalidCode'))
      return
    }

    const { error } = await trigger({ email, code })

    if (error) {
      setCodeError(error?.detail ?? error?.title ?? t('login.invalidCode'))
    } else {
      navigate(validateInternalPath(target ?? null))
    }
  }

  return (
    <LoginLayout title={t('login.checkYouEmail')}>
      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography
          variant='body2'
          sx={{
            color: 'text.primary',
          }}
        >
          {t('login.linkSentTo', { email })}
        </Typography>
      </Box>
      <Box
        component='form'
        onSubmit={handleSubmit}
        sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <Typography
          variant='body2'
          sx={{
            color: 'text.secondary',
            textAlign: 'center',
          }}
        >
          {t('login.enterCodePrompt')}
        </Typography>

        <TextField
          label={t('login.verificationCode')}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
          fullWidth
          autoFocus
          error={!!codeError}
          slotProps={{
            htmlInput: { inputMode: 'numeric', maxLength: 5 },
          }}
        />

        {codeError && <Alert severity='error'>{codeError}</Alert>}

        <Button
          type='submit'
          variant='contained'
          color='primary'
          fullWidth
          size='large'
          disabled={isMutating || code.length !== 5}
          sx={{
            py: 1.5,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 'bold',
          }}
        >
          {isMutating ? <CircularProgress size={24} color='inherit' /> : t('login.submitCode')}
        </Button>
      </Box>
      <Box sx={{ textAlign: 'center', mt: 3 }}>
        <Typography
          variant='body2'
          sx={{
            color: 'text.secondary',
          }}
        >
          {t('login.emailNotReceived')} <Link to='/login'>{t('login.tryAgain')}</Link>
        </Typography>
      </Box>
    </LoginLayout>
  )
}

export default LoginSent
