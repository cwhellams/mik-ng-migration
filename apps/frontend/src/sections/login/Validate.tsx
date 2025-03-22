import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LoginLayout } from './LoginLayout'
import { Box, CircularProgress, Typography } from '@mui/material'
import { useAuth } from '../../hooks/useAuth'
import { VerifyRequest, VerifyResponse } from '@backend/routes/auth/schema'

const LoginValidate = () => {
  const [searchParams] = useSearchParams()
  const [codeError, setCodeError] = useState('')

  const navigate = useNavigate()

  const { isMutating, trigger } = useAuth<VerifyRequest, VerifyResponse>(
    'login/validate'
  )

  useEffect(() => {
    const token = searchParams.get('token')
    const target = searchParams.get('target')
    if (token) {
      trigger({ token })
        .then((response) => {
          if (response.data.accessToken) {
            localStorage.setItem('accessToken', response.data.accessToken)
            navigate(target ?? '/')
          }
        })
        .catch((error) => {
          console.log(error)
          setCodeError('Login failed, try again')
        })
    } else {
      setCodeError('Login failed, try again')
    }
  }, [navigate, trigger, searchParams])

  return (
    <LoginLayout title='Login'>
      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant='body2' color='text.primary'>
          {isMutating && <CircularProgress size={24} color='inherit' />}
        </Typography>
      </Box>

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

export default LoginValidate
