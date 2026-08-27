import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ContactCategory, type ContactRequest } from '@mik/contracts/contact'
import { MIKLang } from '@mik/contracts/members'
import LanguageSelector from '../../components/LanguageSelector'
import { TurnstileWidget } from '@mik/ui/components/TurnstileWidget'
import { useAuth } from '../../hooks/useAuth'
import { LoginLayout } from './LoginLayout'

type ContactFormState = Omit<ContactRequest, 'category' | 'turnstileToken'> & {
  category?: ContactCategory
}

const Contact = () => {
  const { t, i18n } = useTranslation()
  const [selectedLanguage, setSelectedLanguage] = useState<MIKLang>(i18n.language as MIKLang)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string
    email?: string
    category?: string
    message?: string
  }>({})
  const [form, setForm] = useState<ContactFormState>({
    name: '',
    email: '',
    category: undefined,
    message: '',
    lang: selectedLanguage,
  })

  const { isMutating, trigger } = useAuth<ContactRequest, void>('contact')

  const handleLanguageChange = (language: MIKLang) => {
    setSelectedLanguage(language)
    setForm((prev) => ({ ...prev, lang: language }))
    i18n.changeLanguage(language)
  }

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')

    const nextErrors: typeof fieldErrors = {}
    if (!form.name.trim()) nextErrors.name = t('contact.nameRequired')
    if (!validateEmail(form.email)) nextErrors.email = t('contact.emailRequired')
    if (!form.category) nextErrors.category = t('contact.categoryRequired')
    if (!form.message.trim()) nextErrors.message = t('contact.messageRequired')

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || !form.category) return

    const { error } = await trigger({
      ...form,
      category: form.category,
      turnstileToken: turnstileToken ?? undefined,
    })

    if (error) {
      const message =
        error.detail ?? error.title ?? (error as unknown as { error?: string }).error ?? 'Error'
      setSubmitError(message)
      return
    }

    setSubmitted(true)
  }

  if (submitted) {
    return (
      <LoginLayout title={t('contact.successTitle')}>
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography>{t('contact.successMessage')}</Typography>
          <Typography variant='body2' sx={{ color: 'text.secondary' }}>
            <Link to='/login'>{t('register.login')}</Link> ·{' '}
            <Link to='/register'>{t('register.title')}</Link>
          </Typography>
        </Box>
      </LoginLayout>
    )
  }

  return (
    <LoginLayout title={t('contact.title')}>
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
          label={t('contact.name')}
          margin='normal'
          value={form.name}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, name: e.target.value }))
            setFieldErrors((prev) => ({ ...prev, name: undefined }))
          }}
          error={!!fieldErrors.name}
          helperText={fieldErrors.name}
          required
        />
        <TextField
          fullWidth
          label={t('contact.email')}
          margin='normal'
          type='email'
          value={form.email}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, email: e.target.value }))
            setFieldErrors((prev) => ({ ...prev, email: undefined }))
          }}
          error={!!fieldErrors.email}
          helperText={fieldErrors.email}
          required
        />
        <FormControl error={!!fieldErrors.category} sx={{ mt: 2 }}>
          <FormLabel id='contact-category-label'>{t('contact.category.label')}</FormLabel>
          <RadioGroup
            aria-labelledby='contact-category-label'
            value={form.category ?? ''}
            onChange={({ target }) => {
              setForm((prev) => ({ ...prev, category: target.value as ContactCategory }))
              setFieldErrors((prev) => ({ ...prev, category: undefined }))
            }}
          >
            <FormControlLabel
              value={ContactCategory.TRAINING}
              control={<Radio />}
              label={`${t('contact.category.TRAINING')} (koulutus@mik.fi)`}
            />
            <FormControlLabel
              value={ContactCategory.MEMBERSHIP}
              control={<Radio />}
              label={`${t('contact.category.MEMBERSHIP')} (sihteeri@mik.fi)`}
            />
            <FormControlLabel
              value={ContactCategory.OTHER}
              control={<Radio />}
              label={`${t('contact.category.OTHER')} (info@mik.fi)`}
            />
          </RadioGroup>
          {fieldErrors.category && <FormHelperText>{fieldErrors.category}</FormHelperText>}
        </FormControl>
        <TextField
          fullWidth
          label={t('contact.message')}
          margin='normal'
          multiline
          minRows={5}
          value={form.message}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, message: e.target.value }))
            setFieldErrors((prev) => ({ ...prev, message: undefined }))
          }}
          error={!!fieldErrors.message}
          helperText={fieldErrors.message}
          required
        />

        <TurnstileWidget
          onSuccess={(token) => setTurnstileToken(token)}
          onError={() => setTurnstileToken(null)}
          disabled={isMutating}
        />

        {submitError && (
          <Alert variant='outlined' severity='error' sx={{ mt: 2 }}>
            {submitError}
          </Alert>
        )}

        <Button
          type='submit'
          variant='contained'
          color='primary'
          fullWidth
          size='large'
          loading={isMutating}
          sx={{
            mt: 3,
            mb: 2,
            py: 1.5,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 'bold',
            fontSize: '1rem',
          }}
        >
          {t('contact.submit')}
        </Button>
      </form>
    </LoginLayout>
  )
}

export default Contact
