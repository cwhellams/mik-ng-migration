import {
  Typography,
  Box,
  TextField,
  Button,
  Paper,
  CircularProgress,
  Divider,
  Fade,
} from '@mui/material'
import { useState } from 'react'
import MikLogo from '../../assets/mik-blue.svg'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useOTP } from '../../hooks/useOTP'

const Validate = () => {
  const [searchParams] = useSearchParams()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const email = searchParams.get('email')

  const navigate = useNavigate()

  const { isMutating, trigger } = useOTP('verify')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCodeError('')

    if (!email || !code) {
      return navigate('/login')
    }

    trigger({ email: email, otp: code })
      .then((response) => {
        localStorage.setItem('accessToken', response.data.accessToken ?? '')
        navigate('/dashboard')
      })
      .catch((error) => {
        console.log('Error:', error)
        setCodeError(error.response.data.message)
      })
  }

  return (
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
            <Typography
              variant='h4'
              fontWeight='bold'
              color='primary'
              sx={{ mb: 1 }}
            >
              Intranet
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              One time verification code has been sent to{' '}
              {searchParams.get('email')}
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label='6-digit code'
              variant='outlined'
              margin='normal'
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              error={!!codeError}
              helperText={codeError}
              placeholder='123-456'
              sx={{
                '& .MuiOutlinedInput-root': {
                  '&:hover fieldset': {
                    borderColor: 'primary.main',
                  },
                },
              }}
            />

            <Button
              type='submit'
              variant='contained'
              color='primary'
              fullWidth
              size='large'
              disabled={isMutating}
              sx={{
                mt: 3,
                mb: 2,
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
              {isMutating ? (
                <CircularProgress size={24} color='inherit' />
              ) : (
                'Verify'
              )}
            </Button>

            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Typography variant='body2' color='text.secondary'>
                <Link to='/login' style={{ fontWeight: 'bold' }}>
                  Back to login
                </Link>
              </Typography>
            </Box>
          </form>
        </Paper>
      </Fade>
    </Box>
  )
}

export default Validate
