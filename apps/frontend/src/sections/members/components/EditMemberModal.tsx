import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Grid,
  Typography,
  IconButton,
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
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import { Member, MIKRoles } from '@backend/routes/members/models'
import { DateField } from '@mui/x-date-pickers/DateField'
import dayjs from 'dayjs'

export type MemberEditMode =
  | 'personalInfo'
  | 'emergencyContact'
  | 'training'
  | 'membership'
  | 'roles'

interface EditMemberModalProps {
  open: boolean
  onClose: () => void
  mode: MemberEditMode
  memberData?: Member
  onSave: (updatedData: Partial<Member>) => Promise<void>
}

export const EditMemberModal = ({
  open,
  onClose,
  mode,
  memberData,
  onSave,
}: EditMemberModalProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const [loading, setLoading] = useState(false)

  // Define form states based on the mode
  const [formData, setFormData] = useState<Partial<Member>>({})

  // Initialize form data when modal opens
  useEffect(() => {
    if (memberData) {
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
  }, [memberData, mode, open])

  const handleChange =
    (field: keyof Member) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        [field]: e.target.value,
      }))
    }

  const handleSubmit = async () => {
    try {
      setLoading(true)
      await onSave(formData)
      onClose()
    } catch (error) {
      console.error('Error saving member data:', error)
      // Could add error handling / feedback here
    } finally {
      setLoading(false)
    }
  }

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
          value={dayjs(formData.dateOfBirth)}
          onChange={(value) => {
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
          onChange={(value) => {
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
    const role = target.name as MIKRoles

    if (target.checked) {
      setFormData((prev) => ({
        ...prev,
        roles: [...oldRoles, role],
      }))
    } else {
      setFormData((prev) => ({
        ...prev,
        roles: oldRoles.filter((r) => r !== role),
      }))
    }
  }

  const renderRolesForm = () => (
    <Grid container spacing={2}>
      <Grid size={12}>
        <FormGroup>
          <FormControlLabel
            control={
              <Checkbox
                name='USER'
                checked={formData.roles?.includes(MIKRoles.USER)}
                onChange={handleChangeRole}
              />
            }
            label={t('roles.USER')}
          />
          <FormControlLabel
            control={
              <Checkbox
                name='ADMIN'
                checked={formData.roles?.includes(MIKRoles.ADMIN)}
                onChange={handleChangeRole}
              />
            }
            label={t('roles.ADMIN')}
          />
          <FormControlLabel
            control={
              <Checkbox
                name='INSTRUCTOR'
                checked={formData.roles?.includes(MIKRoles.INSTRUCTOR)}
                onChange={handleChangeRole}
              />
            }
            label={t('roles.INSTRUCTOR')}
          />
          <FormControlLabel
            control={
              <Checkbox
                name='COMMITTEE'
                checked={formData.roles?.includes(MIKRoles.COMMITTEE)}
                onChange={handleChangeRole}
              />
            }
            label={t('roles.COMMITTEE')}
          />
        </FormGroup>
      </Grid>
    </Grid>
  )

  const getForm = () => {
    switch (mode) {
      case 'personalInfo':
        return renderPersonalInfoForm()
      case 'emergencyContact':
        return renderEmergencyContactForm()
      case 'training':
        return renderTrainingForm()
      case 'membership':
        return renderMembershipForm()
      case 'roles':
        return renderRolesForm()
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='sm'
      fullWidth
      fullScreen={isXs}
    >
      <DialogTitle>
        <Box display='flex' alignItems='center' justifyContent='space-between'>
          <Typography variant='h6'>{t(`member.edit.${mode}`)}</Typography>
          <IconButton onClick={onClose} aria-label='close'>
            <Icon icon='mdi:close' />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>{getForm()}</DialogContent>

      <DialogActions>
        <Button onClick={onClose} color='inherit'>
          {t('general.cancel', 'Cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          color='primary'
          variant='contained'
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {t('general.save', 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
