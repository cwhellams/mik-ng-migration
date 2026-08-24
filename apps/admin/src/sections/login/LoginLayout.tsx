import { Typography, Box, Paper, Divider, Fade } from '@mui/material'
import { ReactNode } from 'react'
import { Link } from 'react-router'

export const LoginLayout = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      width: '100%',
      padding: 2,
      bgcolor: 'background.default',
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
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Link to='/'>
            <Box
              component='img'
              src='/mik-blue.svg'
              alt='MIK Logo'
              sx={{ width: 80, height: 'auto', mb: 1 }}
            />
          </Link>
          <Typography variant='h4' color='primary' sx={{ fontWeight: 'bold', mb: 1 }}>
            MIK Admin
          </Typography>
          <Typography variant='body2' sx={{ color: 'text.secondary' }}>
            {title}
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        {children}
      </Paper>
    </Fade>
  </Box>
)
