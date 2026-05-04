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
  FormGroup,
  LinearProgress,
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
  PilotLicenceType,
  AircraftRating,
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
  | 'pilotLicenceType'
  | 'ratings'
  | 'accidentHistory'
  | 'criminalRecord'
  | 'primaryMotivation'
> & {
  totalFlightHours?: number
  aircraftTypesFlown?: string
  pilotLicenceType?: PilotLicenceType
  ratings?: AircraftRating[]
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

  const [step, setStep] = useState<1 | 2>(1)

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
      pilotLicenceType: undefined,
      pilotLicenceTypeOther: '',
      ratings: [],
      ratingsOther: '',
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

  const handleNextStep = (e: React.FormEvent) => {
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
        setRegisterError(t('register.dateOfBirthRequired'))
        return
      }
      if (age >= 18) {
        setRegisterError(t('register.juniorAgeError'))
        return
      }
    }

    setStep(2)
    window.scrollTo(0, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegisterError('')

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

  const toggleRating = (rating: AircraftRating, checked: boolean) => {
    const current = member.applicationData?.ratings ?? []
    const updated = checked
      ? [...current, rating]
      : current.filter((r) => r !== rating)
    updateApplicationData('ratings', updated)
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

      {/* Step indicator */}
      <Box sx={{ mb: 2 }}>
        <Typography variant='caption' color='text.secondary' sx={{ mb: 0.5, display: 'block' }}>
          {step === 1 ? t('register.page1of2') : t('register.page2of2')}
        </Typography>
        <LinearProgress
          variant='determinate'
          value={step === 1 ? 50 : 100}
          sx={{ borderRadius: 1, height: 6 }}
        />
      </Box>

      {/* ── PAGE 1: Basic details ───────────────────────────────────────── */}
      {step === 1 && (
        <form onSubmit={handleNextStep}>
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
            onChange={(e) =>
              setMember({ ...member, firstName: e.target.value })
            }
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
            onChange={(e) =>
              setMember({ ...member, townCity: e.target.value })
            }
            required
          />
          <FormControl sx={{ mt: 1 }}>
            <FormLabel id='member-type-label'>
              {t('member.memberType')}
            </FormLabel>
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

          <Typography variant='body2' color='text.secondary' sx={{ mt: 2 }}>
            {t('register.prices')}
          </Typography>

          {registerError && (
            <Alert variant='outlined' severity='error' sx={{ mt: 2 }}>
              {registerError}
            </Alert>
          )}

          <Button
            type='submit'
            variant='contained'
            color='primary'
            fullWidth
            size='large'
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
            {t('register.nextButton')}
          </Button>

          <Box sx={{ textAlign: 'center', mt: 2 }}>
            <Typography variant='body2' color='text.secondary'>
              {t('register.withAccount')}{' '}
              <Link to='/login' color='primary'>
                {t('register.login')}
              </Link>
            </Typography>
          </Box>
        </form>
      )}

      {/* ── PAGE 2: Flight experience + application details ─────────────── */}
      {step === 2 && (
        <form onSubmit={handleSubmit}>
          {/* Flight Experience Section */}
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

          {/* Pilot Licence Type */}
          <FormControl sx={{ mt: 2, mb: 1 }}>
            <FormLabel id='pilot-licence-type-label'>
              {t('register.pilotLicenceType')}
            </FormLabel>
            <RadioGroup
              aria-labelledby='pilot-licence-type-label'
              value={member.applicationData?.pilotLicenceType ?? ''}
              onChange={({ target }) =>
                updateApplicationData(
                  'pilotLicenceType',
                  target.value as PilotLicenceType
                )
              }
            >
              <FormControlLabel
                value={PilotLicenceType.LAPL_A}
                control={<Radio />}
                label={t('register.pilotLicence_LAPL_A')}
              />
              <FormControlLabel
                value={PilotLicenceType.PPL_A}
                control={<Radio />}
                label={t('register.pilotLicence_PPL_A')}
              />
              <FormControlLabel
                value={PilotLicenceType.CPL_A}
                control={<Radio />}
                label={t('register.pilotLicence_CPL_A')}
              />
              <FormControlLabel
                value={PilotLicenceType.ATPL_A}
                control={<Radio />}
                label={t('register.pilotLicence_ATPL_A')}
              />
              <FormControlLabel
                value={PilotLicenceType.OTHER}
                control={<Radio />}
                label={t('register.pilotLicence_other')}
              />
            </RadioGroup>
          </FormControl>

          {member.applicationData?.pilotLicenceType ===
            PilotLicenceType.OTHER && (
            <TextField
              fullWidth
              label={t('register.pilotLicenceOtherText')}
              margin='normal'
              value={member.applicationData?.pilotLicenceTypeOther ?? ''}
              onChange={(e) =>
                updateApplicationData('pilotLicenceTypeOther', e.target.value)
              }
              required
            />
          )}

          {/* Ratings */}
          <FormControl component='fieldset' sx={{ mt: 2, mb: 1 }}>
            <FormLabel component='legend'>{t('register.ratings')}</FormLabel>
            <FormGroup>
              {[
                AircraftRating.SEP_LAND,
                AircraftRating.IR,
                AircraftRating.NF,
                AircraftRating.OTHER,
              ].map((rating) => (
                <FormControlLabel
                  key={rating}
                  control={
                    <Checkbox
                      checked={
                        member.applicationData?.ratings?.includes(rating) ??
                        false
                      }
                      onChange={(e) => toggleRating(rating, e.target.checked)}
                    />
                  }
                  label={t(
                    `register.rating_${rating === AircraftRating.SEP_LAND ? 'SEP_LAND' : rating === AircraftRating.IR ? 'IR' : rating === AircraftRating.NF ? 'NF' : 'other'}`
                  )}
                />
              ))}
            </FormGroup>
          </FormControl>

          {member.applicationData?.ratings?.includes(AircraftRating.OTHER) && (
            <TextField
              fullWidth
              label={t('register.ratingsOtherText')}
              margin='normal'
              value={member.applicationData?.ratingsOther ?? ''}
              onChange={(e) =>
                updateApplicationData('ratingsOther', e.target.value)
              }
              required
            />
          )}

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
            onChange={(e) =>
              updateApplicationData('coverLetter', e.target.value)
            }
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
                updateApplicationData(
                  'accidentHistory',
                  target.value === 'yes'
                )
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
                updateApplicationData(
                  'criminalRecord',
                  target.value === 'yes'
                )
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

          {registerError && (
            <Alert variant='outlined' severity='error' sx={{ mt: 2 }}>
              {registerError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2, mt: 3, mb: 2 }}>
            <Button
              variant='outlined'
              fullWidth
              size='large'
              sx={{
                py: 1.5,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 'bold',
                fontSize: '1rem',
              }}
              onClick={() => {
                setRegisterError('')
                setStep(1)
                window.scrollTo(0, 0)
              }}
            >
              {t('register.backButton')}
            </Button>
            <Button
              type='submit'
              variant='contained'
              color='primary'
              fullWidth
              size='large'
              loadingPosition='start'
              loading={isMutating}
              sx={{
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
          </Box>
        </form>
      )}
    </LoginLayout>
  )
}

export default Register
