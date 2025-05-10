import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'

// Import the SVG logo instead of PNG
import MikLogo from '../assets/mik-blue.svg'

interface SplashScreenProps {
  loading?: boolean
}

const SplashScreen = ({ loading = true }: SplashScreenProps) => {
  const theme = useTheme()

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: theme.palette.background.default,
        gap: 4,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1300,
        transition: 'opacity 0.5s ease-out',
        opacity: loading ? 1 : 0,
        pointerEvents: loading ? 'auto' : 'none',
      }}
    >
      {/* Logo with animation */}
      <Box
        sx={{
          width: 200,
          height: 200,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          mb: 2,
          animation: loading ? 'fadeIn 1.2s ease-in-out' : 'none',
          '@keyframes fadeIn': {
            '0%': {
              opacity: 0,
              transform: 'scale(0.9)',
            },
            '100%': {
              opacity: 1,
              transform: 'scale(1)',
            },
          },
        }}
      >
        <img
          src={MikLogo}
          alt='MIK Logo'
          style={{
            width: '100%',
            filter: 'drop-shadow(0 0 8px rgba(100, 108, 255, 0.3))',
          }}
        />
      </Box>
    </Box>
  )
}

export default SplashScreen
