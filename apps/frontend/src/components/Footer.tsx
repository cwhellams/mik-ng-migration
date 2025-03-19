import { Box, Container, Typography, Link, Divider, Stack } from '@mui/material'
import { useTranslation } from 'react-i18next'
import MikLogo from '../assets/mik-blue.svg'

const Footer = () => {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()

  return (
    <Box
      component="footer"
      mt={6}
      px={5}
      sx={{
        py: 4,
        backgroundColor: 'rgba(245, 245, 245, 0.8)',
        borderTop: '1px solid',
        borderColor: 'divider',
        width: '100vw',
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'center', md: 'flex-start' },
            mb: 3,
          }}
        >
          {/* Logo and club info */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: { xs: 'center', md: 'flex-start' },
              mb: { xs: 3, md: 0 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <img
                src={MikLogo}
                alt="MIK Logo"
                style={{ height: 30, width: 'auto', marginRight: '8px' }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              Malmin Ilmailukerho ry
            </Typography>
          </Box>

          {/* Quick links */}
          <Stack spacing={1} sx={{ textAlign: { xs: 'center', md: 'left' } }}>
            <Typography variant="subtitle2" color="text.primary" gutterBottom>
              {t('footer.quickLinks')}
            </Typography>
            <Link href="https://www.mik.fi" target="_blank" color="inherit" underline="hover">
              {t('footer.website')}
            </Link>
            <Link href="#" color="inherit" underline="hover">
              {t('footer.contact')}
            </Link>
            <Link href="#" color="inherit" underline="hover">
              {t('footer.privacy')}
            </Link>
          </Stack>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Copyright */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            © {currentYear} Malmin Ilmailukerho ry.
          </Typography>
        </Box>
      </Container>
    </Box>
  )
}

export default Footer 