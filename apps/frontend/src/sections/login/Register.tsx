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
      setRegisterError('Please enter a valid email address')
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
    <LoginLayout title='Join as a member'>
      <form onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label='Email'
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
          label='First name'
          margin='normal'
          value={member.firstName}
          onChange={(e) => setMember({ ...member, firstName: e.target.value })}
          required
        />
        <TextField
          fullWidth
          label='Last name'
          margin='normal'
          value={member.lastName}
          onChange={(e) => setMember({ ...member, lastName: e.target.value })}
          required
        />
        <TextField
          fullWidth
          label='Phone number'
          margin='normal'
          value={member.phoneNumber}
          onChange={(e) =>
            setMember({ ...member, phoneNumber: e.target.value })
          }
          required
        />
        <TextField
          fullWidth
          label='Street address'
          margin='normal'
          value={member.streetAddress}
          onChange={(e) =>
            setMember({ ...member, streetAddress: e.target.value })
          }
          required
        />
        <TextField
          fullWidth
          label='Postcode'
          margin='normal'
          value={member.postcode}
          onChange={(e) => setMember({ ...member, postcode: e.target.value })}
          required
        />
        <TextField
          fullWidth
          label='City'
          margin='normal'
          value={member.townCity}
          onChange={(e) => setMember({ ...member, townCity: e.target.value })}
          required
        />
        <FormControl>
          <FormLabel id='member-type-label'>Member type</FormLabel>
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
              label='Flying member'
            />
            <FormControlLabel
              value='NONFLYING'
              control={<Radio />}
              label='Non flying member'
            />
            <FormControlLabel
              value='JUNIOR'
              control={<Radio />}
              label='Junior'
            />
          </RadioGroup>
        </FormControl>

        {member.memberType == 'JUNIOR' && (
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale='fi'>
            <DateField
              label='Date of birth'
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
          Liittyessäsi täysjäseneksi Malmin ilmailukerhoon ensimmäisen kauden
          jäsenmaksuun lisätään liittymismaksu 125€. Kannatusjäsenen ja
          nuorisojäsenen liittymismaksu on 25€. Kerhon kaluston varaus- ja
          käyttöoikeus voidaan myöntää vain nuoriso- ja täysjäsenille.
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
            'Register'
          )}
        </Button>

        {registerError && (
          <Alert variant='outlined' severity='error'>
            {registerError}
          </Alert>
        )}

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Typography variant='body2' color='text.secondary'>
            Already have an account?{' '}
            <Link to='/login' color='primary'>
              Login
            </Link>
          </Typography>
        </Box>
      </form>
    </LoginLayout>
  )
}

export default Register
