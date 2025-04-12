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
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Checkbox,
  FormGroup,
  Alert,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Member } from '@backend/routes/members/models'
import { DateField } from '@mui/x-date-pickers/DateField'
import dayjs, { Dayjs } from 'dayjs'
import { mutate } from 'swr'
import { useRoles } from '../../../hooks/useRoles'
import { APIMutation } from '../../../hooks/useApi'
import { EditDialogTitle } from './EditDialogTitle'

export type MemberEditMode =
  | 'register'
  | 'personalInfo'
  | 'emergencyContact'
  | 'training'
  | 'membership'
  | 'roles'

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

  // Define form states based on the mode
  const [formData, setFormData] = useState<Partial<Member>>({})

  const [errorMsg, setErrorMsg] = useState('')

  // Initialize form data when modal opens
  useEffect(() => {
    setErrorMsg('')

    if (memberData) {
      if (mode === 'register') {
        setFormData({
          memberType: memberData.memberType,
          firstName: memberData.firstName,
          lastName: memberData.lastName,
          email: memberData.email,
          phoneNumber: memberData.phoneNumber || '',
          streetAddress: memberData.streetAddress || '',
          postcode: memberData.postcode || '',
          townCity: memberData.townCity || '',
          dateOfBirth: memberData.dateOfBirth,
        })
      } else if (mode === 'personalInfo') {
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
      } else if (mode === 'training') {
        setFormData({
          isTrainingProgramPilot: memberData.isTrainingProgramPilot,
        })
      } else if (mode == 'membership') {
        setFormData({
          memberType: memberData.memberType,
          canMakeReservations: memberData.canMakeReservations,
          billingId: memberData.billingId,
          memberSince: memberData.memberSince,
        })
      } else if (mode == 'roles') {
        setFormData({
          roles: memberData.roles,
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
    setErrorMsg('')
    try {
      await api.trigger(formData)

      if (mode == 'register') {
        // clear the members list
        mutate((key) => Array.isArray(key) && key[0] == 'v1/members')
      }

      onClose()
    } catch (error) {
      console.error('Error saving member data:', error)
      setErrorMsg(api.error?.message ?? 'Error')
    }
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
        <TextField
          fullWidth
          label={t('member.phone')}
          value={formData.phoneNumber || ''}
          onChange={handleChange('phoneNumber')}
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
        <TextField
          fullWidth
          label={t('member.phone')}
          value={formData.phoneNumber || ''}
          onChange={handleChange('phoneNumber')}
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
        <TextField
          fullWidth
          label={t('member.icePhone')}
          value={formData.iceContactPhoneNumber || ''}
          onChange={handleChange('iceContactPhoneNumber')}
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
          </RadioGroup>
        </FormControl>
      </Grid>
      <Grid size={12} display='flex' alignItems='center'>
        <Typography variant='body2' color='text.secondary' sx={{ width: 150 }}>
          {t('member.canMakeReservations')}
        </Typography>
        <Checkbox
          checked={formData.canMakeReservations}
          onChange={({ target }) => {
            setFormData({
              ...formData,
              canMakeReservations: target.checked,
            })
          }}
        />
      </Grid>
      <Grid size={12}>
        <TextField
          fullWidth
          label={t('member.billingId')}
          value={formData.billingId || ''}
          onChange={handleChange('billingId')}
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
                control={
                  <Checkbox
                    name={role.roleId}
                    checked={formData.roles?.some(
                      ({ roleId }) => roleId == role.roleId
                    )}
                    onChange={handleChangeRole}
                  />
                }
                label={role.name[i18n.language == 'fi' ? 'fi' : 'en']}
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
      case 'training':
        return renderTrainingForm()
      case 'membership':
        return renderMembershipForm()
      case 'roles':
        return <RenderRolesForm />
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

        {errorMsg.length > 0 && (
          <Alert severity='error' sx={{ mt: 2 }}>
            {errorMsg}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color='inherit'>
          {t('general.cancel', 'Cancel')}
        </Button>
        <Button
          type='submit'
          color='primary'
          variant='contained'
          disabled={api.isMutating}
          startIcon={api.isMutating ? <CircularProgress size={20} /> : null}
        >
          {t('general.save', 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
