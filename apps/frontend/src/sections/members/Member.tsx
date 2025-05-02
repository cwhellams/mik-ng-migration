import {
  CircularProgress,
  Card,
  CardContent,
  Typography,
  Box,
  Stack,
  Chip,
  Button,
  Grid,
} from '@mui/material'
import useApi from '../../hooks/useApi'
import { Member } from '@backend/routes/members/models'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { EditMemberModal, MemberEditMode } from './components/EditMemberModal'
import { useNavigate, useParams } from 'react-router-dom'
import { EditButton } from '../../components/EditButton'
import { FormField } from '../../components/FormField'
import { AuditFormField } from '../../components/AuditFormField'
import { toLocalDate } from '../../utils/date'
import { FormTitle } from '../../components/FormTitle'
import { useRoles } from '../../hooks/useRoles'
import { RemoteContent } from '../../components/RemoteContent'
import UserAvatar from './components/UserAvatar'

const MemberProfile = () => {
  const { t, i18n } = useTranslation()
  const { memberId } = useParams()
  const navigate = useNavigate()
  const roles = useRoles()

  // no admin work can be done in own profile
  const isAdmin = roles.isMembersAdmin && memberId !== 'me'

  const { data, isLoading, error, mutation } = useApi<Member>({
    url: `v1/members/${memberId}`,
  })
  const [editMode, setEditMode] = useState<MemberEditMode | undefined>()

  const handleOpenEditModal = (mode: MemberEditMode) => {
    setEditMode(mode)
  }

  const handleRemove = async () => {
    await mutation.trigger('DELETE', {})
    navigate('/members')
  }

  //Deconstructing the data object to extract the properties we need
  const { 
    email, 
    firstName, 
    lastName, 
    //roles, 
    phoneNumber, 
    streetAddress, 
    postcode, 
    townCity, 
    dateOfBirth, 
    iceContactName, 
    iceContactPhoneNumber, 
    isTrainingProgramPilot, 
    //memberId, 
    memberType, 
    canMakeReservations, 
    billingId, 
    memberSince, 
  } = data || {};

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Box sx={{ padding: 3 }}>
      
        
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <UserAvatar
            email={email || ''}
            firstName={firstName || ''}
            lastName={lastName || ''}
            size={100}            
            className='user-avatar'
          />
          <Typography variant='h2' >
          {isAdmin ? firstName : t('member.profile')}
        </Typography>
        </Box>
        
        

        <Stack
          direction='row'
          spacing={1}
          sx={{ mb: 3, justifyContent: 'flex-end' }}
        >
          {data?.roles &&
            data?.roles.length > 0 &&
            data?.roles.map((role, index) => (
              <Chip
                key={index}
                label={role.name?.[i18n.language == 'fi' ? 'fi' : 'en']}
                color='primary'
                icon={<Icon icon='mdi:shield-user' />}
              />
            ))}
          {isAdmin && (
            <EditButton
              title={t('member.edit.roles')}
              onClick={() => handleOpenEditModal('roles')}
              sx={{ position: 'static' }}
            />
          )}
        </Stack>

        <Stack spacing={3}>
          <Stack direction={{ sm: 'column', md: 'row' }} spacing={3}>
            <Card sx={{ flex: 1, mb: 3 }}>
              <EditButton
                title={t('member.edit.personalInfo')}
                onClick={() => handleOpenEditModal('personalInfo')}
              />
              <CardContent>
                <FormTitle title={t('member.info')} icon='mdi:account' />

                <Stack spacing={1.5}>
                  <FormField label={t('member.fullname')} width={100}>
                    {firstName} {lastName || 'N/A'}
                  </FormField>

                  <FormField label={t('member.email')} width={100}>
                    {email}
                  </FormField>

                  <FormField label={t('member.phone')} width={100}>
                    {phoneNumber || 'N/A'}
                  </FormField>

                  <FormField label={t('member.address')} width={100}>
                    {[
                      streetAddress,
                      `${postcode || ''} ${townCity || ''}`,
                    ]
                      .filter(Boolean)
                      .join(', ') || 'N/A'}
                  </FormField>

                  <FormField label={t('member.dateOfBirth')} width={100}>
                    {dateOfBirth && toLocalDate(dateOfBirth)}
                  </FormField>
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1 }}>
              <EditButton
                title={t('member.edit.emergencyContact')}
                onClick={() => handleOpenEditModal('emergencyContact')}
              />
              <CardContent>
                <FormTitle
                  title={t('member.emergencyContact')}
                  icon='mdi:phone-alert'
                />

                <Stack spacing={1.5}>
                  <FormField label={t('member.iceContact')}>
                    {iceContactName || 'N/A'}
                  </FormField>

                  <FormField label={t('member.icePhone')}>
                    {iceContactPhoneNumber || 'N/A'}
                  </FormField>
                </Stack>
              </CardContent>
            </Card>
          </Stack>

          <Card>
            {isAdmin && (
              <EditButton
                title={t('member.edit.training')}
                onClick={() => handleOpenEditModal('training')}
              />
            )}
            <CardContent>
              <FormTitle
                title={t('member.trainingProgram')}
                icon='mdi:account-school'
              />

              <Typography variant='body1'>
                {isTrainingProgramPilot
                  ? 'Is a Training Program Pilot'
                  : 'Not a Training Program Pilot'}
              </Typography>
            </CardContent>
          </Card>

          <Card>
            {isAdmin && (
              <EditButton
                title={t('member.edit.membership')}
                onClick={() => handleOpenEditModal('membership')}
              />
            )}

            <CardContent>
              <FormTitle
                title={t('member.membership')}
                icon='mdi:information'
              />

              <Stack spacing={1.5}>
                <FormField label={t('member.memberId')}>
                  {data?.memberId.toString()}
                </FormField>

                <FormField label={t('member.memberType')}>
                  {data && t(`member.types.${memberType?.toLowerCase()}`)}
                </FormField>

                <FormField
                  label={t('member.canMakeReservations')}
                  icon={
                    canMakeReservations
                      ? 'mdi:check-box-outline'
                      : 'mdi:check-box-outline-blank'
                  }
                />

                <FormField label={t('member.billingId')}>
                  {billingId}
                </FormField>

                <FormField label={t('member.memberSince')}>
                  {toLocalDate(memberSince)}
                </FormField>

                {isAdmin && data && (
                  <>
                    <AuditFormField
                      label={t('member.created')}
                      by={data.createdBy}
                      at={data.createdAt}
                      memberId={data.memberId}
                    />

                    <AuditFormField
                      label={t('member.updated')}
                      by={data.updatedBy}
                      at={data.updatedAt}
                      memberId={data.memberId}
                    />

                    <AuditFormField
                      label={t('member.emailVerifiedAt')}
                      at={data.emailVerifiedAt}
                      memberId={data.memberId}
                    />
                  </>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Grid>
            {isAdmin && (
              <Button
                color='secondary'
                variant='outlined'
                onClick={handleRemove}
                disabled={mutation.isMutating}
                startIcon={
                  mutation.isMutating ? <CircularProgress size={20} /> : null
                }
              >
                {t('general.delete', 'Delete')}
              </Button>
            )}
          </Grid>
        </Stack>

        <EditMemberModal
          mode={editMode}
          onClose={() => setEditMode(undefined)}
          memberData={data}
          api={mutation}
        />
      </Box>
    </RemoteContent>
  )
}

export default MemberProfile
