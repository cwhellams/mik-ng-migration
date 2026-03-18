import { Typography, Box, Button } from '@mui/material'
import { Link } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { LoginLayout } from './LoginLayout'
import { keyframes } from '@mui/system'

// Precomputed quadratic deceleration curve: θ(t) ≈ ω₀·t − ½·α·t² over t ∈ [0, 1].
// Rotations are sampled every 5% of the normalized timeline (0–100%), giving ~10 full turns total.
// This keeps linear interpolation between keyframes visually close to the smooth quadratic curve,
// regardless of the actual animation duration used in the CSS animation property.
const propDecel = keyframes`
  0%   { transform: rotate(0deg); }
  5%   { transform: rotate(351deg); }
  10%  { transform: rotate(684deg); }
  15%  { transform: rotate(999deg); }
  20%  { transform: rotate(1296deg); }
  25%  { transform: rotate(1575deg); }
  30%  { transform: rotate(1836deg); }
  35%  { transform: rotate(2079deg); }
  40%  { transform: rotate(2304deg); }
  45%  { transform: rotate(2511deg); }
  50%  { transform: rotate(2700deg); }
  55%  { transform: rotate(2871deg); }
  60%  { transform: rotate(3024deg); }
  65%  { transform: rotate(3159deg); }
  70%  { transform: rotate(3276deg); }
  75%  { transform: rotate(3375deg); }
  80%  { transform: rotate(3456deg); }
  85%  { transform: rotate(3519deg); }
  90%  { transform: rotate(3564deg); }
  95%  { transform: rotate(3591deg); }
  100% { transform: rotate(3600deg); }
`

const fadeSlideIn = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`

// Primary button colour
const PRIMARY = '#002385'

/** Three-bladed propeller rendered as a pure SVG so we can spin it precisely */
const Propeller = () => (
  <Box
    component='svg'
    viewBox='0 0 100 100'
    sx={{
      width: 96,
      height: 96,
      filter: `drop-shadow(0 4px 12px rgba(0,35,133,0.30))`,
      animation: `${propDecel} 2.5s linear 0.2s both`,
      transformOrigin: '50% 50%',
      display: 'block',
      mx: 'auto',
    }}
  >
    {/* Hub */}
    <circle cx='50' cy='50' r='7' fill={PRIMARY} />

    {/* Blade 1 – pointing up */}
    <ellipse
      cx='50'
      cy='28'
      rx='7'
      ry='22'
      fill={PRIMARY}
      transform='rotate(0 50 50)'
    />
    {/* Blade 2 – 120° */}
    <ellipse
      cx='50'
      cy='28'
      rx='7'
      ry='22'
      fill={PRIMARY}
      transform='rotate(120 50 50)'
    />
    {/* Blade 3 – 240° */}
    <ellipse
      cx='50'
      cy='28'
      rx='7'
      ry='22'
      fill={PRIMARY}
      transform='rotate(240 50 50)'
    />

    {/* Spinner cap */}
    <circle cx='50' cy='50' r='5' fill='white' opacity='0.85' />
  </Box>
)

const LogoutSuccess = () => {
  const { t } = useTranslation()

  return (
    <LoginLayout title={t('logout.title')}>
      <Box sx={{ textAlign: 'center' }}>
        {/* Spinning propeller */}
        <Box sx={{ mb: 2 }}>
          <Propeller />
        </Box>

        {/* Thank you message */}
        <Typography
          variant='h5'
          fontWeight='600'
          color='text.primary'
          sx={{ mb: 2, animation: `${fadeSlideIn} 0.6s ease 3.1s both` }}
        >
          {t('logout.thankYou')}
        </Typography>

        <Typography
          variant='body1'
          color='text.secondary'
          sx={{
            mb: 4,
            lineHeight: 1.6,
            animation: `${fadeSlideIn} 0.6s ease 3.3s both`,
          }}
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
            animation: `${fadeSlideIn} 0.6s ease 3.5s both`,
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
