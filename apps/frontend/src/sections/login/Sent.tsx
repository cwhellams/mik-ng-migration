import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LoginLayout } from './LoginLayout'
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { VerifyRequest, VerifyResponse } from '@backend/routes/auth/schema'
import { saveToken } from '../../hooks/useApi'
import { validateInternalPath } from '@backend/util/sanitizers'

const LoginSent = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const email: string = location.state?.email ?? ''
  const expectedCode: number | undefined = location.state?.code
  const magicToken: string | undefined = location.state?.token
  const target: string | undefined = location.state?.target

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

  const { isMutating, trigger } = useAuth<VerifyRequest, VerifyResponse>('login/validate')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCodeError('')

    const parsed = parseInt(code, 10)

    if (isNaN(parsed) || parsed !== expectedCode || !magicToken) {
      setCodeError(t('login.invalidCode'))
      return
    }

    const { data, error } = await trigger({ token: magicToken })

    if (data?.accessToken) {
      saveToken(data.accessToken)
      navigate(validateInternalPath(target ?? null))
    } else {
      setCodeError(error?.detail ?? error?.title ?? t('login.invalidCode'))
    }
  }

  return (
    <LoginLayout title={t('login.checkYouEmail')}>
      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant='body2' color='text.primary'>
          {t('login.linkSentTo', { email })}
        </Typography>
      </Box>

      <Box
        component='form'
        onSubmit={handleSubmit}
        sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <Typography variant='body2' color='text.secondary' textAlign='center'>
          {t('login.enterCodePrompt')}
        </Typography>

        <TextField
          label={t('login.verificationCode')}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
          inputProps={{ inputMode: 'numeric', maxLength: 5 }}
          fullWidth
          autoFocus
          error={!!codeError}
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
          {isMutating ? (
            <CircularProgress size={24} color='inherit' />
          ) : (
            t('login.submitCode')
          )}
        </Button>
      </Box>

      <Box sx={{ textAlign: 'center', mt: 3 }}>
        <Typography variant='body2' color='text.secondary'>
          {t('login.emailNotReceived')}{' '}
          <Link to='/login'>{t('login.tryAgain')}</Link>
        </Typography>
      </Box>
    </LoginLayout>
  )
}

export default LoginSent
