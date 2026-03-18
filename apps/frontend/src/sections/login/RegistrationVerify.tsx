import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LoginLayout } from './LoginLayout'
import { Box, CircularProgress, Typography, Button } from '@mui/material'
import { Icon } from '@iconify/react'
import { useAuth } from '../../hooks/useAuth'
import { VerifyRequest, VerifyResponse } from '@backend/routes/auth/schema'
import { useTranslation } from 'react-i18next'

const RegistrationVerify = () => {
  const [searchParams] = useSearchParams()
  const [verificationError, setVerificationError] = useState('')
  const [isVerified, setIsVerified] = useState(false)

  const navigate = useNavigate()
  const { t } = useTranslation()

  const { isMutating, trigger } = useAuth<VerifyRequest, VerifyResponse>(
    'register/verify'
  )

  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      trigger({ token }).then(({ error }) => {
        if (error) {
          console.log(error)
          setVerificationError(
            t('registrationVerify.verificationFailedMessage')
          )
        } else {
          setIsVerified(true)
        }
      })
    } else {
      setVerificationError(t('registrationVerify.verificationFailedMessage'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (isMutating) {
    return (
      <LoginLayout title={t('registrationVerify.title')}>
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <CircularProgress size={48} color='primary' />
          <Typography variant='body1' sx={{ mt: 2 }}>
            {t('registrationVerify.verifyingEmail')}
          </Typography>
        </Box>
      </LoginLayout>
    )
  }

  if (verificationError) {
    return (
      <LoginLayout title={t('registrationVerify.emailVerification')}>
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Icon
            icon='mdi:alert-circle'
            width={64}
            height={64}
            color='#f44336'
          />
          <Typography variant='h6' sx={{ mt: 2, mb: 2 }}>
            {t('registrationVerify.verificationFailed')}
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
            {verificationError}
          </Typography>
          <Button
            variant='outlined'
            onClick={() => navigate('/register')}
            sx={{ mr: 2 }}
          >
            {t('registrationVerify.registerAgain')}
          </Button>
          <Button variant='contained' onClick={() => navigate('/login')}>
            {t('registrationVerify.login')}
          </Button>
        </Box>
      </LoginLayout>
    )
  }

  if (isVerified) {
    return (
      <LoginLayout title={t('registrationVerify.welcomeTitle')}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Icon
            icon='mdi:check-circle'
            width={64}
            height={64}
            color='#4caf50'
          />
          <Typography variant='h5' sx={{ mt: 2, mb: 2, color: '#4caf50' }}>
            {t('registrationVerify.emailVerifiedSuccess')}
          </Typography>
          <Typography variant='body1' sx={{ mb: 4 }}>
            {t('registrationVerify.thankYouMessage')}
          </Typography>
        </Box>

        <Box sx={{ textAlign: 'center' }}>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            {t('registrationVerify.dashboardAccessMessage')}
          </Typography>
          <Button
            variant='contained'
            size='large'
            onClick={() => navigate('/')}
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 'bold',
            }}
          >
            {t('registrationVerify.goToDashboard')}
          </Button>
        </Box>
      </LoginLayout>
    )
  }

  return null
}

export default RegistrationVerify
