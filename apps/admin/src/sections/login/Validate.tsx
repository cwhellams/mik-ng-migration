import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { LoginLayout } from './LoginLayout'
import { Box, CircularProgress, Typography } from '@mui/material'
import { useAuth } from '../../hooks/useAuth'
import { VerifyRequest, VerifyResponse } from '@mik/contracts/auth'
import { validateInternalPath } from '@mik/contracts/sanitizers'

const LoginValidate = () => {
  const [searchParams] = useSearchParams()
  const [codeError, setCodeError] = useState('')
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
          setCodeError('Login failed, please try again')
        } else {
          const safePath = validateInternalPath(target)
          navigate(safePath)
        }
      })
    } else {
      setCodeError('Login failed, please try again')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return (
    <LoginLayout title='Signing in…'>
      <Box sx={{ textAlign: 'center', mt: 2 }}>{isMutating && <CircularProgress size={24} />}</Box>
      {codeError && (
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Typography variant='body2' sx={{ color: 'error.main' }}>
            {codeError}
          </Typography>
          <Link to='/login'>Back to sign in</Link>
        </Box>
      )}
    </LoginLayout>
  )
}

export default LoginValidate
