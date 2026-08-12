import { Typography, Box, TextField, Button, InputAdornment, Divider } from '@mui/material'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../hooks/useAuth'
import { LoginLayout } from './LoginLayout'
import { LoginRequest, LoginResponse } from '@mik/contracts/auth'
import { useTranslation } from 'react-i18next'
import { MIKLang } from '@mik/contracts/members'
import LanguageSelector from '../../components/LanguageSelector'
import { validateInternalPath } from '@mik/contracts/sanitizers'
import { TurnstileWidget } from '../../components/TurnstileWidget'
import {
  loginWithPasskey,
  loginWithPasskeyDiscoverable,
  passkeySupported,
} from '../../utils/passkey'

const Login = () => {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  const { t, i18n } = useTranslation()

  // Initialize language based on current i18n language
  const [selectedLanguage, setSelectedLanguage] = useState<MIKLang>(i18n.language as MIKLang)

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

  // Try passkey first; fall back to magic-link email if the user has none.
  // When `allowEmailFallback` is true (email-submit button), a passkey
  // cancellation is treated the same as "no passkeys" so the user is not
  // blocked from using the email flow.
  const tryPasskeyLogin = async (allowEmailFallback: boolean): Promise<boolean> => {
    if (!passkeySupported()) return false
    setPasskeyLoading(true)
    try {
      const safeTarget = validateInternalPath(location.state?.target)
      const result = await loginWithPasskey(email)
      if (result.ok) {
        navigate(safeTarget)
        return true
      }
      if (result.reason === 'no-passkeys') {
        // Silently fall back to the email magic-link flow.
        return false
      }
      if (result.reason === 'cancelled') {
        // User dismissed the prompt. If triggered by the email-submit button
        // fall through to the email flow; if triggered by the passkey button
        // stay on the page so they can retry.
        return !allowEmailFallback
      }
      if (result.reason === 'options-failed') {
        // If triggered from the email button, silently fall through to email.
        if (allowEmailFallback) return false
        setEmailError(t('login.passkey.startFailed'))
        return true
      }
      // Generic failure — also fall through to email when allowed.
      if (allowEmailFallback) return false
      setEmailError(t(result.message ?? 'login.passkey.failed'))
      return true
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handlePasskeyLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError('')
    // If the user has typed an email, validate it and use the email-scoped flow
    // (pre-filters credentials to that account). If the email field is empty,
    // use the discoverable flow so the browser shows all stored passkeys for
    // this RP — no email required.
    if (email) {
      if (!validateEmail(email)) {
        setEmailError(t('login.validEmailRequired'))
        return
      }
      await tryPasskeyLogin(false)
    } else {
      setPasskeyLoading(true)
      try {
        const safeTarget = validateInternalPath(location.state?.target)
        const result = await loginWithPasskeyDiscoverable()
        if (result.ok) {
          navigate(safeTarget)
        } else if (result.reason !== 'cancelled') {
          setEmailError(t(result.message ?? 'login.passkey.failed'))
        }
      } finally {
        setPasskeyLoading(false)
      }
    }
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

    // First attempt passkey login. If the user has no passkey or cancels the
    // prompt we silently fall through to the email magic-link flow.
    if (await tryPasskeyLogin(true)) return

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
            boxShadow: '0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08)',
            transition: 'all 0.2s',
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow: '0 7px 14px rgba(50, 50, 93, 0.1), 0 3px 6px rgba(0, 0, 0, 0.08)',
            },
          }}
        >
          {t('login.submitButton')}
        </Button>

        {passkeySupported() && (
          <Box sx={{ display: 'flex', alignItems: 'center', my: 2 }}>
            <Divider sx={{ flex: 1 }} />
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
                mx: 2,
              }}
            >
              {t('login.or')}
            </Typography>
            <Divider sx={{ flex: 1 }} />
          </Box>
        )}

        {passkeySupported() && (
          <Button
            type='button'
            variant='outlined'
            color='primary'
            fullWidth
            size='large'
            onClick={handlePasskeyLogin}
            loading={passkeyLoading}
            startIcon={<Icon icon='mdi:fingerprint' />}
            sx={{
              mt: 0,
              mb: 2,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 'bold',
              fontSize: '1rem',
            }}
          >
            {t('login.passkey.signIn')}
          </Button>
        )}

        <TurnstileWidget
          onSuccess={(token) => setTurnstileToken(token)}
          onError={() => setTurnstileToken(null)}
          disabled={isMutating}
        />

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
            }}
          >
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
