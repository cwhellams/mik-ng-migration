import {
  Typography,
  Box,
  TextField,
  Button,
  InputAdornment,
} from '@mui/material'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LoginLayout } from './LoginLayout'
import { LoginRequest, LoginResponse } from '@backend/routes/auth/schema'
import { useTranslation } from 'react-i18next'
import { MIKLang } from '@backend/routes/members/models'
import LanguageSelector from '../../components/LanguageSelector'
import { validateInternalPath } from '@backend/util/sanitizers'
import { TurnstileWidget } from '../../components/TurnstileWidget'

const Login = () => {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  const { t, i18n } = useTranslation()

  // Initialize language based on current i18n language
  const [selectedLanguage, setSelectedLanguage] = useState<MIKLang>(
    i18n.language as MIKLang
  )

  const navigate = useNavigate()
  const location = useLocation()

  const { isMutating, trigger } = useAuth<LoginRequest, LoginResponse>('login')

  // Update i18n language when language selector changes
  const handleLanguageChange = (language: MIKLang) => {
    setSelectedLanguage(language)
    i18n.changeLanguage(language)
  }

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return regex.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError('')

    if (!validateEmail(email)) {
      setEmailError(t('login.validEmailRequired'))
      return
    }

    // Validate target to prevent open redirect attacks
    const safeTarget = validateInternalPath(location.state?.target)

    const { data, error } = await trigger({
      email: email,
      target: safeTarget,
      turnstileToken: turnstileToken ?? undefined,
    })

    if (!data?.code || error) {
      console.log('Error:', error)
      return setEmailError(error?.detail ?? error?.title ?? 'Error')
    }

    navigate('/login/sent', {
      state: { email, target: safeTarget },
    })
  }

  return (
    <LoginLayout title={t('login.title')}>
      {/* Language Selector */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <LanguageSelector
          selectedLanguage={selectedLanguage}
          onLanguageChange={handleLanguageChange}
          showLabel={true}
        />
      </Box>

      <form onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label={t('member.email')}
          variant='outlined'
          margin='normal'
          value={email}
          type='email'
          onChange={(e) => setEmail(e.target.value)}
          required
          error={!!emailError}
          helperText={emailError}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position='start'>
                  <Icon icon='mdi:email' color='#646cff' />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              '&:hover fieldset': {
                borderColor: 'primary.main',
              },
            },
          }}
        />

        <TurnstileWidget
          onSuccess={(token) => setTurnstileToken(token)}
          onError={() => setTurnstileToken(null)}
          disabled={isMutating}
        />

        <Button
          type='submit'
          variant='contained'
          color='primary'
          fullWidth
          size='large'
          loadingPosition='start'
          loading={isMutating}
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
          {t('login.submitButton')}
        </Button>

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Typography variant='body2' color='text.secondary'>
            {t('login.withoutAccount')}{' '}
            <Link to='/register' color='primary'>
              {t('login.join')}
            </Link>
          </Typography>
        </Box>
      </form>
    </LoginLayout>
  )
}

export default Login
