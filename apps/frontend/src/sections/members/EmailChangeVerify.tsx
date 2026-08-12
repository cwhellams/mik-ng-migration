import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Box, CircularProgress, Typography, Button } from '@mui/material'
import { Icon } from '@iconify/react'
import useApi from '../../hooks/useApi'
import { useTranslation } from 'react-i18next'
import { Member } from '@mik/contracts/members'
import { Title } from '../../components/Title'

const EmailChangeVerify = () => {
  const [searchParams] = useSearchParams()
  const [verificationError, setVerificationError] = useState('')
  const [isVerified, setIsVerified] = useState(false)
  const triggered = useRef(false)

  const navigate = useNavigate()
  const { t } = useTranslation()

  const { mutation } = useApi<Member>({
    url: 'v1/members/me',
    skipFetch: true,
  })

  useEffect(() => {
    if (triggered.current) return
    const token = searchParams.get('token')
    if (token) {
      triggered.current = true
      mutation.trigger('POST', { token }, 'email-change/verify').then(({ error }) => {
        if (error) {
          setVerificationError(t('emailChange.verifyFailedMessage'))
        } else {
          setIsVerified(true)
        }
      })
    } else {
      setVerificationError(t('emailChange.verifyFailedMessage'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (mutation.isMutating) {
    return (
      <Box sx={{ padding: 3, textAlign: 'center' }}>
        <Title label={t('emailChange.verifyTitle')} />
        <Box sx={{ mt: 4 }}>
          <CircularProgress size={48} color='primary' />
          <Typography variant='body1' sx={{ mt: 2 }}>
            {t('emailChange.verifyingEmail')}
          </Typography>
        </Box>
      </Box>
    )
  }

  if (verificationError) {
    return (
      <Box sx={{ padding: 3, textAlign: 'center' }}>
        <Title label={t('emailChange.verifyTitle')} />
        <Box sx={{ mt: 2 }}>
          <Icon icon='mdi:alert-circle' width={64} height={64} color='#f44336' />
          <Typography variant='h6' sx={{ mt: 2, mb: 2 }}>
            {t('emailChange.verifyFailed')}
          </Typography>
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
              mb: 3,
            }}
          >
            {verificationError}
          </Typography>
          <Button variant='contained' onClick={() => navigate('/club/members/me')}>
            {t('emailChange.goToProfile')}
          </Button>
        </Box>
      </Box>
    )
  }

  if (isVerified) {
    return (
      <Box sx={{ padding: 3, textAlign: 'center' }}>
        <Title label={t('emailChange.verifyTitle')} />
        <Box sx={{ mb: 4 }}>
          <Icon icon='mdi:check-circle' width={64} height={64} color='#4caf50' />
          <Typography variant='h5' sx={{ mt: 2, mb: 2, color: '#4caf50' }}>
            {t('emailChange.verifySuccess')}
          </Typography>
          <Typography variant='body1' sx={{ mb: 4 }}>
            {t('emailChange.verifySuccessMessage')}
          </Typography>
        </Box>

        <Box>
          <Button
            variant='contained'
            size='large'
            onClick={() => navigate('/club/members/me')}
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 'bold',
            }}
          >
            {t('emailChange.goToProfile')}
          </Button>
        </Box>
      </Box>
    )
  }

  return null
}

export default EmailChangeVerify
