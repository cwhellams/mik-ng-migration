import {
  Typography,
  Box,
  TextField,
  Button,
  InputAdornment,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Alert,
} from '@mui/material'
import { DateField } from '@mui/x-date-pickers/DateField'
import 'dayjs/locale/fi'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LoginLayout } from './LoginLayout'
import { LoginResponse, RegisterRequest } from '@backend/routes/auth/schema'
import { MIKMemberTypes } from '@backend/routes/members/models.ts'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider/LocalizationProvider'
import dayjs, { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'

const Register = () => {
  const [member, setMember] = useState<RegisterRequest>({
    email: '',
    firstName: undefined as unknown as string,
    lastName: '',

    phoneNumber: '',
    postcode: '',
    streetAddress: '',
    townCity: '',

    memberType: MIKMemberTypes.FLYING,
    dateOfBirth: undefined,
  })
  const [dateOfBirth, setDateOfBirth] = useState<Dayjs | null>(dayjs())

  const [registerError, setRegisterError] = useState('')

  const { t } = useTranslation()

  const navigate = useNavigate()

  const { isMutating, trigger } = useAuth<RegisterRequest, LoginResponse>(
    'register'
  )

  const validateEmail = (email?: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return email && regex.test(email)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setRegisterError('')

    if (!validateEmail(member.email)) {
      setRegisterError(t('login.validEmailRequired'))
      return
    }

    trigger(member)
      .then((response) => {
        if (response.data.code) {
          navigate('/login/sent', {
            state: { email: member.email, code: response.data.code },
          })
        } else {
          console.log('Error:', response)
          setRegisterError('Error')
        }
      })
      .catch((error) => {
        console.log('Error:', error)
        setRegisterError(error.response.statusText)
      })
  }

  return (
    <LoginLayout title={t('register.title')}>
      <form onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label={t('member.email')}
          margin='normal'
          value={member.email}
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
          <FormLabel id='member-type-label'>{t('member.type')}</FormLabel>
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
              value='NONFLYING'
              control={<Radio />}
              label={t('member.types.nonflying')}
            />
            <FormControlLabel
              value='JUNIOR'
              control={<Radio />}
              label={t('member.types.junior')}
            />
          </RadioGroup>
        </FormControl>

        {member.memberType == 'JUNIOR' && (
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale='fi'>
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
          </LocalizationProvider>
        )}

        <Typography variant='body2' color='text.secondary'>
          {t('register.prices')}
        </Typography>

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
            t('register.submitButton')
          )}
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
