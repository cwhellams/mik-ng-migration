import { Link, useLocation } from 'react-router-dom'
import { LoginLayout } from './LoginLayout'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

const LoginSent = () => {
  const location = useLocation()
  const { t } = useTranslation()

  return (
    <LoginLayout title={t('login.checkYouEmail')}>
      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant='body2' color='text.primary'>
          {t('login.linkSentTo', { email: location.state?.email })}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant='body2' color='text.secondary'>
          {t('login.verificationCode')}: {location.state.code}
        </Typography>
      </Box>

      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant='body2' color='text.secondary'>
          {t('login.emailNotReceived')}{' '}
          <Link to='/login'>{t('login.tryAgain')}</Link>
        </Typography>
      </Box>
    </LoginLayout>
  )
}

export default LoginSent
