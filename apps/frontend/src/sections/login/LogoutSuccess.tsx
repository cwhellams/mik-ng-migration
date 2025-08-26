import { Typography, Box, Button } from '@mui/material'
import { Link } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { LoginLayout } from './LoginLayout'

const LogoutSuccess = () => {
  const { t } = useTranslation()

  return (
    <LoginLayout title={t('logout.title')}>
      <Box sx={{ textAlign: 'center' }}>
        {/* Success Icon */}
        <Box sx={{ mb: 3 }}>
          <Icon
            icon='mdi:check-circle'
            color='#4caf50'
            style={{
              fontSize: '4rem',
              filter: 'drop-shadow(0 0 8px rgba(76, 175, 80, 0.3))',
            }}
          />
        </Box>

        {/* Thank you message */}
        <Typography
          variant='h5'
          fontWeight='600'
          color='text.primary'
          sx={{ mb: 2 }}
        >
          {t('logout.thankYou')}
        </Typography>

        <Typography
          variant='body1'
          color='text.secondary'
          sx={{ mb: 4, lineHeight: 1.6 }}
        >
          {t('logout.message')}
        </Typography>

        {/* Login Again Button */}
        <Button
          component={Link}
          to='/login'
          variant='contained'
          color='primary'
          size='large'
          fullWidth
          startIcon={<Icon icon='mdi:login' />}
          sx={{
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
          {t('logout.loginAgain')}
        </Button>

        {/* Additional info */}
        <Box sx={{ textAlign: 'center', mt: 3 }}>
          <Typography variant='body2' color='text.secondary'>
            {t('logout.needHelp')}{' '}
            <Link
              to='/register'
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              {t('logout.contact')}
            </Link>
          </Typography>
        </Box>
      </Box>
    </LoginLayout>
  )
}

export default LogoutSuccess
