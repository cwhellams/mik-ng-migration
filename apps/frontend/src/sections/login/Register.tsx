import {
  Typography,
  Box,
  TextField,
  Button,
  InputAdornment,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Alert,
} from '@mui/material'
import { DateField } from '@mui/x-date-pickers/DateField'
import 'dayjs/locale/fi'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LoginLayout } from './LoginLayout'
import { LoginResponse, RegisterRequest } from '@backend/routes/auth/schema'
import { MIKLang, MIKMemberTypes } from '@backend/routes/members/models.ts'
import dayjs, { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import LanguageSelector from '../../components/LanguageSelector'
import { TurnstileWidget } from '../../components/TurnstileWidget'

const Register = () => {
  const { t, i18n } = useTranslation()

  // Initialize selectedLanguage state based on current i18n language
  const [selectedLanguage, setSelectedLanguage] = useState<MIKLang>(
    i18n.language as MIKLang
  )

  const [member, setMember] = useState<RegisterRequest>({
    email: '',
    firstName: '',
    lastName: '',

    phoneNumber: '',
    postcode: '',
    streetAddress: '',
    townCity: '',

    memberType: MIKMemberTypes.FLYING,
    dateOfBirth: undefined,

    lang: selectedLanguage,
  })
  const [dateOfBirth, setDateOfBirth] = useState<Dayjs | null>(dayjs())

  const [registerError, setRegisterError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  const navigate = useNavigate()

  const { isMutating, trigger } = useAuth<RegisterRequest, LoginResponse>(
    'register'
  )

  // Handle language change and update both UI and member data
  const handleLanguageChange = (language: MIKLang) => {
    setSelectedLanguage(language)
    setMember((prev) => ({ ...prev, lang: language }))
    i18n.changeLanguage(language)
  }

  const validateEmail = (email?: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return email && regex.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegisterError('')

    if (!validateEmail(member.email)) {
      setRegisterError(t('login.validEmailRequired'))
      return
    }

    const { data, error } = await trigger({
      ...member,
      turnstileToken: turnstileToken ?? undefined,
    })
    if (!data?.code || error) {
      console.log('Error:', error)
      return setRegisterError(error?.detail ?? error?.title ?? 'Error')
    }

    navigate('/login/sent', {
      state: { email: member.email, code: data?.code },
    })
  }

  return (
    <LoginLayout title={t('register.title')}>
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
          margin='normal'
          value={member.email}
          type='email'
          onChange={(e) => setMember({ ...member, email: e.target.value })}
          required
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position='start'>
                  <Icon icon='mdi:email' color='#646cff' />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          fullWidth
          label={t('member.firstName')}
          margin='normal'
          value={member.firstName}
          onChange={(e) => setMember({ ...member, firstName: e.target.value })}
          required
        />
        <TextField
          fullWidth
          label={t('member.lastName')}
          margin='normal'
          value={member.lastName}
          onChange={(e) => setMember({ ...member, lastName: e.target.value })}
          required
        />
        <TextField
          fullWidth
          label={t('member.phone')}
          margin='normal'
          value={member.phoneNumber}
          onChange={(e) =>
            setMember({ ...member, phoneNumber: e.target.value })
          }
          required
        />
        <TextField
          fullWidth
          label={t('member.street')}
          margin='normal'
          value={member.streetAddress}
          onChange={(e) =>
            setMember({ ...member, streetAddress: e.target.value })
          }
          required
        />
        <TextField
          fullWidth
          label={t('member.postcode')}
          margin='normal'
          value={member.postcode}
          onChange={(e) => setMember({ ...member, postcode: e.target.value })}
          required
        />
        <TextField
          fullWidth
          label={t('member.town')}
          margin='normal'
          value={member.townCity}
          onChange={(e) => setMember({ ...member, townCity: e.target.value })}
          required
        />
        <FormControl>
          <FormLabel id='member-type-label'>{t('member.memberType')}</FormLabel>
          <RadioGroup
            aria-labelledby='member-type-label'
            defaultValue='FLYING'
            name='memberType'
            value={member.memberType}
            onChange={({ target }) =>
              setMember({
                ...member,
                memberType: target.value as MIKMemberTypes,
              })
            }
          >
            <FormControlLabel
              value='FLYING'
              control={<Radio />}
              label={t('member.types.flying')}
            />
            <FormControlLabel
              value='NON-FLYING'
              control={<Radio />}
              label={t('member.types.non-flying')}
            />
            <FormControlLabel
              value='JUNIOR'
              control={<Radio />}
              label={t('member.types.junior')}
            />
          </RadioGroup>
        </FormControl>

        {member.memberType == 'JUNIOR' && (
          <DateField
            label={t('member.dateOfBirth')}
            required
            margin='normal'
            defaultValue={dayjs()}
            value={dateOfBirth}
            onChange={(value) => {
              setDateOfBirth(value)
              setMember({
                ...member,
                dateOfBirth: value?.format('YYYY-MM-DD'),
              })
            }}
          />
        )}

        <Typography variant='body2' color='text.secondary'>
          {t('register.prices')}
        </Typography>

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
          {t('register.submitButton')}
        </Button>

        {registerError && (
          <Alert variant='outlined' severity='error'>
            {registerError}
          </Alert>
        )}

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Typography variant='body2' color='text.secondary'>
            {t('register.withAccount')}{' '}
            <Link to='/login' color='primary'>
              {t('register.login')}
            </Link>
          </Typography>
        </Box>
      </form>
    </LoginLayout>
  )
}

export default Register
