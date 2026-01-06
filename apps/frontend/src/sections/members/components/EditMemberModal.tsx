import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
  useMediaQuery,
  useTheme,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Checkbox,
  FormGroup,
  Box,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Member, MIKLang, MIKMemberTypes } from '@backend/routes/members/models'
import { DateField } from '@mui/x-date-pickers/DateField'
import dayjs, { Dayjs } from 'dayjs'
import { useRoles } from '../../../hooks/useRoles'
import { APIMutation } from '../../../hooks/useApi'
import { EditDialogTitle } from '../../../components/EditDialogTitle'
import { RegisterRequest } from '@backend/routes/auth/schema'
import { SnackAlert } from '../../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import { SaveButton } from '../../../components/SaveButton'
import { PhoneNumberInput } from '../../../components/PhoneNumberInput'
import { useNavigate } from 'react-router-dom'

export type MemberEditMode =
  | 'register'
  | 'personalInfo'
  | 'emergencyContact'
  | 'instantMessaging'
  | 'training'
  | 'membership'
  | 'roles'
  | 'licence'
  | 'billing'

interface EditMemberModalProps {
  onClose: () => void
  mode: MemberEditMode | undefined
  memberData?: Member

  // either create or update members
  api: APIMutation<Member>
}

export const EditMemberModal = ({
  onClose,
  mode,
  memberData,
  api,
}: EditMemberModalProps) => {
  const { t, i18n } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const navigate = useNavigate()

  // Define form states based on the mode
  const [formData, setFormData] = useState<Partial<Member>>({})

  const [problem, setProblem] = useState<Problem | undefined>(undefined)

  // Initialize form data when modal opens
  useEffect(() => {
    setProblem(undefined)

    if (mode === 'register') {
      // subset required for creating new users
      setFormData({
        memberType: MIKMemberTypes.EXTERNAL,
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        lang: MIKLang.FI,
      } as RegisterRequest)
    } else if (memberData) {
      if (mode === 'personalInfo') {
        setFormData({
          firstName: memberData.firstName,
          lastName: memberData.lastName,
          email: memberData.email,
          phoneNumber: memberData.phoneNumber || '',
          streetAddress: memberData.streetAddress || '',
          postcode: memberData.postcode || '',
          townCity: memberData.townCity || '',
          dateOfBirth: memberData.dateOfBirth,
        })
      } else if (mode === 'emergencyContact') {
        setFormData({
          iceContactName: memberData.iceContactName || '',
          iceContactPhoneNumber: memberData.iceContactPhoneNumber || '',
        })
      } else if (mode === 'instantMessaging') {
        setFormData({
          imWhatsapp: memberData.imWhatsapp || '',
          imTelegram: memberData.imTelegram || '',
          imFacebookMessenger: memberData.imFacebookMessenger || '',
          imDiscord: memberData.imDiscord || '',
          imViber: memberData.imViber || '',
          imSignal: memberData.imSignal || '',
        })
      } else if (mode === 'licence') {
        setFormData({
          licenceId: memberData.licenceId || '',
          licenceExpiry: memberData.licenceExpiry,
          medicalExpiry: memberData.medicalExpiry,
        })
      } else if (mode === 'training') {
        setFormData({
          isTrainingProgramPilot: memberData.isTrainingProgramPilot,
        })
      } else if (mode == 'membership') {
        setFormData({
          memberType: memberData.memberType,
          canMakeReservations: memberData.canMakeReservations,
          isMembershipApproved: memberData.isMembershipApproved,
          billingId: memberData.billingId,
          memberSince: memberData.memberSince,
        })
      } else if (mode == 'roles') {
        setFormData({
          roles: memberData.roles,
        })
      } else if (mode == 'billing') {
        setFormData({
          autoRenewAnnualMembership: memberData.autoRenewAnnualMembership,
          autoRenewEquipmentFee: memberData.autoRenewEquipmentFee,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const handleChange =
    (field: keyof Member) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        [field]: e.target.value,
      }))
    }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProblem(undefined)

    const method = mode == 'register' ? 'POST' : 'PATCH'

    const { data, error } = await api.trigger(method, formData)
    if (error) {
      return setProblem(error)
    }

    if (mode == 'register') {
      navigate(`/club/members/${data?.memberId}`)
    }

    onClose()
  }

  const renderRegisterForm = () => (
    <Grid container spacing={2}>
      <Grid size={12}>
        <FormControl>
          <FormLabel id='member-type-label'>{t('member.memberType')}</FormLabel>
          <RadioGroup
            aria-labelledby='member-type-label'
            value={formData.memberType}
            onChange={handleChange('memberType')}
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
            <FormControlLabel
              value='EXTERNAL'
              control={<Radio />}
              label={t('member.types.external')}
            />
            <FormControlLabel
              value='HONORARY'
              control={<Radio />}
              label={t('member.types.honorary')}
            />
            <FormControlLabel
              value='REMOVED'
              control={<Radio />}
              label={t('member.types.removed')}
            />
          </RadioGroup>
        </FormControl>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          fullWidth
          required
          label={t('member.firstName')}
          value={formData.firstName || ''}
          onChange={handleChange('firstName')}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          fullWidth
          required
          label={t('member.lastName')}
          value={formData.lastName || ''}
          onChange={handleChange('lastName')}
        />
      </Grid>
      <Grid size={12}>
        <TextField
          fullWidth
          required
          label={t('member.email')}
          value={formData.email || ''}
          onChange={handleChange('email')}
        />
      </Grid>
      <Grid size={12}>
        <PhoneNumberInput
          label={t('member.phone')}
          value={formData.phoneNumber || ''}
          onChange={(value) =>
            setFormData((prev) => ({ ...prev, phoneNumber: value }))
          }
        />
      </Grid>
    </Grid>
  )

  const renderPersonalInfoForm = () => (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          fullWidth
          label={t('member.firstName')}
          value={formData.firstName || ''}
          onChange={handleChange('firstName')}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          fullWidth
          label={t('member.lastName')}
          value={formData.lastName || ''}
          onChange={handleChange('lastName')}
        />
      </Grid>
      <Grid size={12}>
        <TextField
          fullWidth
          label={t('member.email')}
          value={formData.email || ''}
          onChange={handleChange('email')}
        />
      </Grid>
      <Grid size={12}>
        <PhoneNumberInput
          label={t('member.phone')}
          value={formData.phoneNumber || ''}
          onChange={(value) =>
            setFormData((prev) => ({ ...prev, phoneNumber: value }))
          }
        />
      </Grid>
      <Grid size={12}>
        <TextField
          fullWidth
          label={t('member.streetAddress')}
          value={formData.streetAddress || ''}
          onChange={handleChange('streetAddress')}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          fullWidth
          label={t('member.postcode')}
          value={formData.postcode || ''}
          onChange={handleChange('postcode')}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          fullWidth
          label={t('member.town')}
          value={formData.townCity || ''}
          onChange={handleChange('townCity')}
        />
      </Grid>
      <Grid size={12}>
        <DateField
          label={t('member.dateOfBirth')}
          value={formData.dateOfBirth ? dayjs(formData.dateOfBirth) : undefined}
          onChange={(value: Dayjs | null) => {
            setFormData({
              ...formData,
              dateOfBirth: value?.format('YYYY-MM-DD'),
            })
          }}
        />
      </Grid>
    </Grid>
  )

  const renderEmergencyContactForm = () => (
    <Grid container spacing={2}>
      <Grid size={12}>
        <TextField
          fullWidth
          label={t('member.iceContact')}
          value={formData.iceContactName || ''}
          onChange={handleChange('iceContactName')}
        />
      </Grid>
      <Grid size={12}>
        <PhoneNumberInput
          label={t('member.icePhone')}
          value={formData.iceContactPhoneNumber || ''}
          onChange={(value) =>
            setFormData((prev) => ({ ...prev, iceContactPhoneNumber: value }))
          }
        />
      </Grid>
    </Grid>
  )

  const renderInstantMessagingForm = () => (
    <Grid container spacing={2}>
      <Grid size={12}>
        <TextField
          fullWidth
          label={t('member.instantMessaging.whatsapp')}
          value={formData.imWhatsapp || ''}
          onChange={handleChange('imWhatsapp')}
          placeholder='https://wa.me/1234567890'
        />
      </Grid>
      <Grid size={12}>
        <TextField
          fullWidth
          label={t('member.instantMessaging.telegram')}
          value={formData.imTelegram || ''}
          onChange={handleChange('imTelegram')}
          placeholder='https://t.me/username'
        />
      </Grid>
      <Grid size={12}>
        <TextField
          fullWidth
          label={t('member.instantMessaging.messenger')}
          value={formData.imFacebookMessenger || ''}
          onChange={handleChange('imFacebookMessenger')}
          placeholder='https://m.me/username'
        />
      </Grid>
      <Grid size={12}>
        <TextField
          fullWidth
          label={t('member.instantMessaging.discord')}
          value={formData.imDiscord || ''}
          onChange={handleChange('imDiscord')}
          placeholder='https://discord.gg/invite or username#0000'
        />
      </Grid>
      <Grid size={12}>
        <TextField
          fullWidth
          label={t('member.instantMessaging.viber')}
          value={formData.imViber || ''}
          onChange={handleChange('imViber')}
          placeholder='viber://chat?number=1234567890'
        />
      </Grid>
      <Grid size={12}>
        <TextField
          fullWidth
          label={t('member.instantMessaging.signal')}
          value={formData.imSignal || ''}
          onChange={handleChange('imSignal')}
          placeholder='https://signal.me/#p/+1234567890'
        />
      </Grid>
    </Grid>
  )

  const renderLicenceForm = () => (
    <Grid container spacing={2}>
      <Grid size={12}>
        <TextField
          fullWidth
          label={t('member.licenceInfo.licenceId')}
          value={formData.licenceId || ''}
          onChange={handleChange('licenceId')}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <DateField
          label={t('member.licenceInfo.licenceExpiry')}
          value={
            formData.licenceExpiry ? dayjs(formData.licenceExpiry) : undefined
          }
          onChange={(value: Dayjs | null) => {
            setFormData({
              ...formData,
              licenceExpiry: value?.format('YYYY-MM-DD'),
            })
          }}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <DateField
          label={t('member.licenceInfo.medicalExpiry')}
          value={
            formData.medicalExpiry ? dayjs(formData.medicalExpiry) : undefined
          }
          onChange={(value: Dayjs | null) => {
            setFormData({
              ...formData,
              medicalExpiry: value?.format('YYYY-MM-DD'),
            })
          }}
        />
      </Grid>
    </Grid>
  )

  const renderBillingForm = () => (
    <Grid container spacing={2}>
      <Grid size={12} display='flex' alignItems='center'>
        <Typography variant='body2' color='text.secondary' sx={{ width: 200 }}>
          {t('member.billingInfo.annualMembershipAutoRenew')}
        </Typography>
        <Checkbox
          checked={formData.autoRenewAnnualMembership ?? false}
          onChange={({ target }) => {
            setFormData({
              ...formData,
              autoRenewAnnualMembership: target.checked,
            })
          }}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }} display='flex' alignItems='center'>
        <Typography variant='body2' color='text.secondary' sx={{ width: 200 }}>
          {t('member.billingInfo.equipmentFeeAutoRenew')}
        </Typography>
        <Checkbox
          checked={formData.autoRenewEquipmentFee ?? false}
          onChange={({ target }) => {
            setFormData({
              ...formData,
              autoRenewEquipmentFee: target.checked,
            })
          }}
        />
      </Grid>
    </Grid>
  )

  const renderTrainingForm = () => (
    <Grid container spacing={2}>
      <Grid size={12} display='flex' alignItems='center'>
        <Typography variant='body2' color='text.secondary' sx={{ width: 150 }}>
          {t('member.isTrainingProgramPilot')}
        </Typography>
        <Checkbox
          checked={formData.isTrainingProgramPilot}
          onChange={({ target }) => {
            setFormData({
              ...formData,
              isTrainingProgramPilot: target.checked,
            })
          }}
        />
      </Grid>
    </Grid>
  )

  const renderMembershipForm = () => (
    <Grid container spacing={2}>
      <Grid size={12}>
        <FormControl>
          <FormLabel id='member-type-label'>{t('member.memberType')}</FormLabel>
          <RadioGroup
            aria-labelledby='member-type-label'
            value={formData.memberType}
            onChange={handleChange('memberType')}
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
            <FormControlLabel
              value='HONORARY'
              control={<Radio />}
              label={t('member.types.honorary')}
            />
          </RadioGroup>
        </FormControl>
      </Grid>
      <Box mb={3} display={'flex'} flexDirection={'column'}>
        <FormControlLabel
          control={
            <Checkbox
              checked={formData.canMakeReservations}
              size='medium'
              onChange={({ target }) => {
                setFormData({
                  ...formData,
                  canMakeReservations: target.checked,
                })
              }}
            />
          }
          label={t('member.canMakeReservations')}
        ></FormControlLabel>
      </Box>
      <></>
      <Grid size={12}>
        <TextField
          id='outlined'
          fullWidth
          label={t('member.billingId')}
          value={formData.billingId || ''}
          placeholder={
            'Leave blank, value will be automatically assigned from Simplbooks'
          }
          onChange={handleChange('billingId')}
          slotProps={{
            inputLabel: {
              shrink: true, // Keeps the label above even when the field is empty
            },
          }}
        />
      </Grid>
      <Grid size={12}>
        <DateField
          label={t('member.memberSince')}
          required
          margin='normal'
          value={dayjs(formData.memberSince)}
          onChange={(value: Dayjs | null) => {
            setFormData({
              ...formData,
              memberSince: value?.format('YYYY-MM-DD'),
            })
          }}
        />
      </Grid>
    </Grid>
  )

  const handleChangeRole = ({
    target,
  }: React.ChangeEvent<HTMLInputElement>) => {
    const oldRoles = formData.roles ?? []
    const role = target.name

    if (target.checked) {
      setFormData((prev) => ({
        ...prev,
        roles: [...oldRoles, { roleId: role }],
      }))
    } else {
      setFormData((prev) => ({
        ...prev,
        roles: oldRoles.filter((r) => r.roleId !== role),
      }))
    }
  }

  const RenderRolesForm = () => {
    const { roles } = useRoles()

    return (
      <Grid container spacing={2}>
        <Grid size={12}>
          <FormGroup>
            {roles.map((role) => (
              <FormControlLabel
                key={role.roleId}
                control={
                  <Checkbox
                    name={role.roleId}
                    checked={formData.roles?.some(
                      ({ roleId }) => roleId == role.roleId
                    )}
                    onChange={handleChangeRole}
                  />
                }
                label={role.name[i18n.language as MIKLang]}
              />
            ))}
          </FormGroup>
        </Grid>
      </Grid>
    )
  }

  const getForm = () => {
    switch (mode) {
      case 'register':
        return renderRegisterForm()
      case 'personalInfo':
        return renderPersonalInfoForm()
      case 'emergencyContact':
        return renderEmergencyContactForm()
      case 'instantMessaging':
        return renderInstantMessagingForm()
      case 'training':
        return renderTrainingForm()
      case 'membership':
        return renderMembershipForm()
      case 'licence':
        return renderLicenceForm()
      case 'roles':
        return <RenderRolesForm />
      case 'billing':
        return renderBillingForm()
    }
  }

  return (
    <Dialog
      open={mode !== undefined}
      onClose={onClose}
      maxWidth='sm'
      fullWidth
      fullScreen={isXs}
      slotProps={{
        paper: {
          component: 'form',
          onSubmit: handleSubmit,
        },
      }}
    >
      <EditDialogTitle
        title={mode && `member.edit.${mode}`}
        onClose={onClose}
      />
      <DialogContent dividers>
        {getForm()}

        <SnackAlert problem={problem} />
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color='inherit'>
          {t('general.cancel', 'Cancel')}
        </Button>
        <SaveButton loading={api.isMutating} />
      </DialogActions>
    </Dialog>
  )
}
