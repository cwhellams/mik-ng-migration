import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LoginLayout } from './LoginLayout'
import { Box, CircularProgress, Typography } from '@mui/material'
import { useAuth } from '../../hooks/useAuth'
import { VerifyRequest, VerifyResponse } from '@backend/routes/auth/schema'
import { validateInternalPath } from '@backend/util/sanitizers'

const LoginValidate = () => {
  const [searchParams] = useSearchParams()
  const [codeError, setCodeError] = useState('')
  // Prevent React StrictMode's double-invoke from consuming the one-time-use token twice
  const triggered = useRef(false)

  const navigate = useNavigate()

  const { isMutating, trigger } = useAuth<VerifyRequest, VerifyResponse>('login/validate')

  useEffect(() => {
    if (triggered.current) return
    const token = searchParams.get('token')
    const target = searchParams.get('target')
    if (token) {
      triggered.current = true
      trigger({ token }).then(({ error }) => {
        if (error) {
          console.log(error)
          setCodeError('Login failed, try again')
        } else {
          // Validate target to prevent open redirect attacks
          const safePath = validateInternalPath(target)
          navigate(safePath)
        }
      })
    } else {
      setCodeError('Login failed, try again')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

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
