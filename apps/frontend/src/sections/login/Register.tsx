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
  Divider,
  Checkbox,
} from '@mui/material'
import { DateField } from '@mui/x-date-pickers/DateField'
import 'dayjs/locale/fi'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LoginLayout } from './LoginLayout'
import { LoginResponse, RegisterRequest } from '@backend/routes/auth/schema'
import {
  MIKLang,
  MIKMemberTypes,
  PrimaryMotivation,
  type ApplicationData,
} from '@backend/routes/members/models.ts'
import dayjs, { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import LanguageSelector from '../../components/LanguageSelector'
import { TurnstileWidget } from '../../components/TurnstileWidget'

// Local form state type — allows undefined for radio-button fields so that
// none are pre-selected; cast to RegisterRequest on submission after validation.
type FormApplicationData = Omit<
  ApplicationData,
  | 'totalFlightHours'
  | 'aircraftTypesFlown'
  | 'licenceAndRatings'
  | 'accidentHistory'
  | 'criminalRecord'
  | 'primaryMotivation'
> & {
  totalFlightHours?: number
  aircraftTypesFlown?: string
  licenceAndRatings?: string
  accidentHistory?: boolean
  criminalRecord?: boolean
  primaryMotivation?: PrimaryMotivation
}

type RegisterFormState = Omit<
  RegisterRequest,
  'memberType' | 'applicationData'
> & {
  memberType?: MIKMemberTypes
  applicationData: FormApplicationData
}

const Register = () => {
  const { t, i18n } = useTranslation()

  // Initialize selectedLanguage state based on current i18n language
  const [selectedLanguage, setSelectedLanguage] = useState<MIKLang>(
    i18n.language as MIKLang
  )

  const [member, setMember] = useState<RegisterFormState>({
    email: '',
    firstName: '',
    lastName: '',

    phoneNumber: '',
    postcode: '',
    streetAddress: '',
    townCity: '',

    memberType: undefined,
    dateOfBirth: undefined,

    lang: selectedLanguage,

    applicationData: {
      totalFlightHours: undefined,
      aircraftTypesFlown: undefined,
      licenceAndRatings: undefined,
      primaryMotivation: undefined,
      motivationOther: '',
      coverLetter: '',
      voluntaryWork: '',
      otherAviationClubs: '',
      accidentHistory: undefined,
      accidentHistoryDetails: '',
      criminalRecord: undefined,
      criminalRecordDetails: '',
      gdprAccepted: false,
    },
  })
  const [dateOfBirth, setDateOfBirth] = useState<Dayjs | null>(null)

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

  const getAge = (dob: Dayjs | null): number | null => {
    if (!dob || !dob.isValid()) return null
    return dayjs().diff(dob, 'year')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegisterError('')

    if (!validateEmail(member.email)) {
      setRegisterError(t('login.validEmailRequired'))
      return
    }

    if (!member.memberType) {
      setRegisterError(t('register.selectMemberType'))
      return
    }

    // Issue #770: validate age for junior membership
    const age = getAge(dateOfBirth)
    if (member.memberType === MIKMemberTypes.JUNIOR) {
      if (!dateOfBirth || age === null) {
        setRegisterError(
          t('member.dateOfBirth') + ' ' + t('login.validEmailRequired')
        )
        return
      }
      if (age >= 18) {
        setRegisterError(t('register.juniorAgeError'))
        return
      }
    }

    if (member.applicationData?.primaryMotivation === undefined) {
      setRegisterError(t('register.selectMotivation'))
      return
    }

    if (member.applicationData?.accidentHistory === undefined) {
      setRegisterError(t('register.selectAccidentHistory'))
      return
    }

    if (member.applicationData?.criminalRecord === undefined) {
      setRegisterError(t('register.selectCriminalRecord'))
      return
    }

    if (!member.applicationData?.gdprAccepted) {
      setRegisterError(t('register.gdprRequired'))
      return
    }

    const { data, error } = await trigger({
      ...(member as RegisterRequest),
      memberType: member.memberType,
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

  const updateApplicationData = <K extends keyof FormApplicationData>(
    field: K,
    value: FormApplicationData[K]
  ) => {
    setMember((prev) => ({
      ...prev,
      applicationData: {
        ...prev.applicationData!,
        [field]: value,
      },
    }))
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
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9+\s-]/g, '')
            setMember({ ...member, phoneNumber: value })
          }}
          required
          slotProps={{
            htmlInput: {
              inputMode: 'tel',
            },
          }}
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
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9]/g, '')
            setMember({ ...member, postcode: value })
          }}
          required
          slotProps={{
            htmlInput: {
              inputMode: 'numeric',
            },
          }}
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
            name='memberType'
            value={member.memberType ?? ''}
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

        <DateField
          label={t('member.dateOfBirth')}
          required={member.memberType === MIKMemberTypes.JUNIOR}
          margin='normal'
          value={dateOfBirth}
          onChange={(value) => {
            setDateOfBirth(value)
            setMember({
              ...member,
              dateOfBirth: value?.format('YYYY-MM-DD'),
            })
          }}
        />
        {(() => {
          const age = getAge(dateOfBirth)
          if (
            member.memberType === MIKMemberTypes.JUNIOR &&
            age !== null &&
            age >= 18
          ) {
            return (
              <Alert severity='error' sx={{ mt: 1 }}>
                {t('register.juniorAgeError')}
              </Alert>
            )
          }
          if (
            member.memberType !== MIKMemberTypes.JUNIOR &&
            age !== null &&
            age < 18
          ) {
            return (
              <Alert severity='info' sx={{ mt: 1 }}>
                {t('register.juniorRecommended')}
              </Alert>
            )
          }
          return null
        })()}

        <Typography variant='body2' color='text.secondary'>
          {t('register.prices')}
        </Typography>

        {/* Flight Experience Section */}
        <Divider sx={{ my: 3 }} />
        <Typography variant='h6' sx={{ mb: 1 }}>
          {t('register.sectionFlightExperience')}
        </Typography>

        <TextField
          fullWidth
          label={t('register.totalFlightHours')}
          margin='normal'
          type='number'
          value={member.applicationData?.totalFlightHours ?? ''}
          onChange={(e) =>
            updateApplicationData(
              'totalFlightHours',
              e.target.value === ''
                ? undefined
                : Math.max(0, Number(e.target.value))
            )
          }
          slotProps={{
            htmlInput: {
              min: 0,
              inputMode: 'numeric',
            },
          }}
        />
        <TextField
          fullWidth
          label={t('register.aircraftTypesFlown')}
          margin='normal'
          value={member.applicationData?.aircraftTypesFlown ?? ''}
          onChange={(e) =>
            updateApplicationData(
              'aircraftTypesFlown',
              e.target.value || undefined
            )
          }
        />
        <TextField
          fullWidth
          label={t('register.licenceAndRatings')}
          margin='normal'
          value={member.applicationData?.licenceAndRatings ?? ''}
          onChange={(e) =>
            updateApplicationData(
              'licenceAndRatings',
              e.target.value || undefined
            )
          }
        />

        {/* Motivation Section */}
        <Divider sx={{ my: 3 }} />
        <Typography variant='h6' sx={{ mb: 1 }}>
          {t('register.sectionMotivation')}
        </Typography>

        <FormControl sx={{ mt: 1, mb: 1 }}>
          <FormLabel id='motivation-label'>
            {t('register.primaryMotivation')}
          </FormLabel>
          <RadioGroup
            aria-labelledby='motivation-label'
            value={member.applicationData?.primaryMotivation ?? ''}
            onChange={({ target }) =>
              updateApplicationData(
                'primaryMotivation',
                target.value as PrimaryMotivation
              )
            }
          >
            <FormControlLabel
              value={PrimaryMotivation.FLY}
              control={<Radio />}
              label={t('register.motivation_fly')}
            />
            <FormControlLabel
              value={PrimaryMotivation.LEARN_TO_FLY}
              control={<Radio />}
              label={t('register.motivation_learnToFly')}
            />
            <FormControlLabel
              value={PrimaryMotivation.COMMUNITY}
              control={<Radio />}
              label={t('register.motivation_community')}
            />
            <FormControlLabel
              value={PrimaryMotivation.OTHER}
              control={<Radio />}
              label={t('register.motivation_other')}
            />
          </RadioGroup>
        </FormControl>

        {member.applicationData?.primaryMotivation ===
          PrimaryMotivation.OTHER && (
          <TextField
            fullWidth
            label={t('register.motivationOtherText')}
            margin='normal'
            value={member.applicationData?.motivationOther ?? ''}
            onChange={(e) =>
              updateApplicationData('motivationOther', e.target.value)
            }
            required
          />
        )}

        <TextField
          fullWidth
          label={t('register.coverLetter')}
          margin='normal'
          value={member.applicationData?.coverLetter ?? ''}
          onChange={(e) => updateApplicationData('coverLetter', e.target.value)}
          required
          multiline
          minRows={3}
        />

        <TextField
          fullWidth
          label={t('register.voluntaryWork')}
          margin='normal'
          value={member.applicationData?.voluntaryWork ?? ''}
          onChange={(e) =>
            updateApplicationData('voluntaryWork', e.target.value)
          }
          required
          multiline
          minRows={2}
        />

        <TextField
          fullWidth
          label={t('register.otherAviationClubs')}
          margin='normal'
          value={member.applicationData?.otherAviationClubs ?? ''}
          onChange={(e) =>
            updateApplicationData('otherAviationClubs', e.target.value)
          }
          multiline
          minRows={2}
        />

        {/* Declarations Section */}
        <Divider sx={{ my: 3 }} />
        <Typography variant='h6' sx={{ mb: 1 }}>
          {t('register.sectionDeclarations')}
        </Typography>

        <FormControl sx={{ mt: 1, mb: 1 }}>
          <FormLabel id='accident-history-label'>
            {t('register.accidentHistory')}
          </FormLabel>
          <RadioGroup
            aria-labelledby='accident-history-label'
            value={
              member.applicationData?.accidentHistory === undefined
                ? ''
                : member.applicationData.accidentHistory
                  ? 'yes'
                  : 'no'
            }
            onChange={({ target }) =>
              updateApplicationData('accidentHistory', target.value === 'yes')
            }
          >
            <FormControlLabel
              value='no'
              control={<Radio />}
              label={t('register.no')}
            />
            <FormControlLabel
              value='yes'
              control={<Radio />}
              label={t('register.yes')}
            />
          </RadioGroup>
        </FormControl>

        {member.applicationData?.accidentHistory && (
          <TextField
            fullWidth
            label={t('register.accidentHistoryDetails')}
            margin='normal'
            value={member.applicationData?.accidentHistoryDetails ?? ''}
            onChange={(e) =>
              updateApplicationData('accidentHistoryDetails', e.target.value)
            }
            required
            multiline
            minRows={2}
          />
        )}

        <FormControl sx={{ mt: 1, mb: 1 }}>
          <FormLabel id='criminal-record-label'>
            {t('register.criminalRecord')}
          </FormLabel>
          <RadioGroup
            aria-labelledby='criminal-record-label'
            value={
              member.applicationData?.criminalRecord === undefined
                ? ''
                : member.applicationData.criminalRecord
                  ? 'yes'
                  : 'no'
            }
            onChange={({ target }) =>
              updateApplicationData('criminalRecord', target.value === 'yes')
            }
          >
            <FormControlLabel
              value='no'
              control={<Radio />}
              label={t('register.no')}
            />
            <FormControlLabel
              value='yes'
              control={<Radio />}
              label={t('register.yes')}
            />
          </RadioGroup>
        </FormControl>

        {member.applicationData?.criminalRecord && (
          <TextField
            fullWidth
            label={t('register.criminalRecordDetails')}
            margin='normal'
            value={member.applicationData?.criminalRecordDetails ?? ''}
            onChange={(e) =>
              updateApplicationData('criminalRecordDetails', e.target.value)
            }
            required
            multiline
            minRows={2}
          />
        )}

        {/* GDPR Section */}
        <Divider sx={{ my: 3 }} />

        <FormControlLabel
          control={
            <Checkbox
              checked={member.applicationData?.gdprAccepted ?? false}
              onChange={(e) =>
                updateApplicationData('gdprAccepted', e.target.checked)
              }
            />
          }
          label={
            <Typography variant='body2'>
              {t('register.gdprAcceptance')}
            </Typography>
          }
          sx={{ alignItems: 'flex-start', mt: 1 }}
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
