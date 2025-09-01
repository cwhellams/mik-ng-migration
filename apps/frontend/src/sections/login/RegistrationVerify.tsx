import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LoginLayout } from './LoginLayout'
import {
  Box,
  CircularProgress,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Button,
} from '@mui/material'
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
      trigger({ token }).then(({ data, error }) => {
        if (data?.accessToken) {
          localStorage.setItem('accessToken', data.accessToken)
          setIsVerified(true)
        } else {
          console.log(error)
          setVerificationError(
            t('registrationVerify.verificationFailedMessage')
          )
        }
      })
    } else {
      setVerificationError(t('registrationVerify.verificationFailedMessage'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const onboardingSteps = [
    {
      icon: 'mdi:phone',
      title: t('registrationVerify.onboardingSteps.step1.title'),
      description: t('registrationVerify.onboardingSteps.step1.description'),
    },
    {
      icon: 'mdi:currency-eur',
      title: t('registrationVerify.onboardingSteps.step2.title'),
      description: t('registrationVerify.onboardingSteps.step2.description'),
    },
    {
      icon: 'mdi:file-document-check',
      title: t('registrationVerify.onboardingSteps.step3.title'),
      description: t('registrationVerify.onboardingSteps.step3.description'),
    },
    {
      icon: 'mdi:school',
      title: t('registrationVerify.onboardingSteps.step4.title'),
      description: t('registrationVerify.onboardingSteps.step4.description'),
    },
    {
      icon: 'mdi:map-marker',
      title: t('registrationVerify.onboardingSteps.step5.title'),
      description: t('registrationVerify.onboardingSteps.step5.description'),
    },
    {
      icon: 'mdi:key',
      title: t('registrationVerify.onboardingSteps.step6.title'),
      description: t('registrationVerify.onboardingSteps.step6.description'),
    },
    {
      icon: 'mdi:airplane-check',
      title: t('registrationVerify.onboardingSteps.step7.title'),
      description: t('registrationVerify.onboardingSteps.step7.description'),
    },
  ]

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

        <Card elevation={2} sx={{ mb: 4 }}>
          <CardContent>
            <Typography
              variant='h6'
              sx={{ mb: 2, display: 'flex', alignItems: 'center' }}
            >
              <Icon icon='mdi:timeline' style={{ marginRight: 8 }} />
              {t('registrationVerify.nextStepsTitle')}
            </Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
              {t('registrationVerify.nextStepsDescription')}
            </Typography>

            <List>
              {onboardingSteps.map((step, index) => (
                <div key={index}>
                  <ListItem alignItems='flex-start'>
                    <ListItemIcon>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          backgroundColor: 'primary.main',
                          color: 'white',
                          fontSize: '0.875rem',
                          fontWeight: 'bold',
                          mr: 1,
                        }}
                      >
                        {index + 1}
                      </Box>
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: 0.5,
                          }}
                        >
                          <Icon icon={step.icon} style={{ marginRight: 8 }} />
                          <Typography variant='subtitle1' fontWeight='medium'>
                            {step.title}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography variant='body2' color='text.secondary'>
                          {step.description}
                        </Typography>
                      }
                    />
                  </ListItem>
                  {index < onboardingSteps.length - 1 && (
                    <Divider component='li' />
                  )}
                </div>
              ))}
            </List>
          </CardContent>
        </Card>

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
