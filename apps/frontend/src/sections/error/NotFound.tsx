import { Box, Typography, Button } from '@mui/material'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'

const NotFound = () => {
  const { t } = useTranslation()

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        py: 8,
        px: 2,
        height: '100vh',
        width: '100%',
        position: 'fixed',
        top: 0,
        left: 0,
      }}
    >
      <Icon icon='mdi:airplane' fontSize={80} color='#1976d2' />
      <Typography variant='h1' sx={{ mt: 4, mb: 2, fontSize: { xs: '3rem', md: '4rem' } }}>
        404
      </Typography>
      <Typography
        variant='h4'
        gutterBottom
        sx={{
          color: 'text.secondary',
        }}
      >
        {t('error.pageNotFound')}
      </Typography>
      <Typography
        variant='body1'
        sx={{
          color: 'text.secondary',
          mb: 4,
          maxWidth: 500,
        }}
      >
        {t('error.pageNotFoundMessage')}
      </Typography>
      <Button
        component={Link}
        to='/'
        variant='contained'
        color='primary'
        size='large'
        startIcon={<Icon icon='mdi:home' />}
        sx={{
          borderRadius: 2,
          py: 1,
          px: 3,
        }}
      >
        {t('error.backToHome')}
      </Button>
    </Box>
  )
}

export default NotFound
