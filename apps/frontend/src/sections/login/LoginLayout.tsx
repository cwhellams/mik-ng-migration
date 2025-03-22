import { Typography, Box, Paper, Divider, Fade } from '@mui/material'
import MikLogo from '../../assets/mik-blue.svg'
import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export const LoginLayout = ({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      width: '100%',
      padding: 2,
    }}
  >
    <Fade in={true} timeout={800}>
      <Paper
        elevation={8}
        sx={{
          p: 4,
          maxWidth: 450,
          width: '100%',
          mx: 'auto',
          borderRadius: 2,
          transition: 'all 0.3s ease-in-out',
          '&:hover': {
            boxShadow:
              '0 14px 28px rgba(0,0,0,0.25), 0 10px 10px rgba(0,0,0,0.22)',
          },
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Link to='/'>
            <img
              src={MikLogo}
              alt='MIK Logo'
              style={{
                width: 80,
                height: 'auto',
                marginBottom: '8px',
                filter: 'drop-shadow(0 0 8px rgba(100, 108, 255, 0.3))',
              }}
            />
          </Link>
          <Typography
            variant='h4'
            fontWeight='bold'
            color='primary'
            sx={{ mb: 1 }}
          >
            Intranet
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            {title}
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        {children}
      </Paper>
    </Fade>
  </Box>
)
