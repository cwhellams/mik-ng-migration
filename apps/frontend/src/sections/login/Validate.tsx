import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LoginLayout } from './LoginLayout'
import { Box, CircularProgress, Typography } from '@mui/material'
import { useAuth } from '../../hooks/useAuth'

export const LoginValidate = () => {
  const [searchParams] = useSearchParams()
  const [userName, setUsername] = useState('')
  const [codeError, setCodeError] = useState('')

  const navigate = useNavigate()

  const token = searchParams.get('token')

  const { isMutating, trigger } = useAuth('login/validate')

  useEffect(() => {
    if (token) {
      trigger({ token })
        .then((response) => {
          if (response.data.accessToken) {
            sessionStorage.setItem('accessToken', response.data.accessToken)
            setUsername(response.data.user?.email ?? '')
            setTimeout(() => navigate('/members'), 1000)
          }
        })
        .catch((error) => {
          console.log(error)
          setCodeError('Login failed, try again')
        })
    } else {
      setCodeError('Login failed, try again')
    }
  }, [navigate, trigger, token])

  return (
    <LoginLayout title='Login'>
      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant='body2' color='text.primary'>
          {isMutating && <CircularProgress size={24} color='inherit' />}
        </Typography>
      </Box>

      {userName && (
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Typography variant='body2' color='text.secondary'>
            Hello {userName}
          </Typography>
        </Box>
      )}

      {codeError && (
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Typography variant='body2' color='text.secondary'>
            Login failed <Link to='/login'>Try again</Link>
          </Typography>
        </Box>
      )}
    </LoginLayout>
  )
}
