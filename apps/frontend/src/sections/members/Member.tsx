import {
  CircularProgress,
  Card,
  CardContent,
  Typography,
  Box,
  Stack,
  Chip,
} from '@mui/material'
import useApi from '../../hooks/useApi'
import { Member } from '@backend/routes/members/models'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { EditMemberModal, MemberEditMode } from './components/EditMemberModal'
import { useParams } from 'react-router-dom'
import { EditButton } from './components/EditButton'
import { FormField } from './components/FormField'
import { AuditFormField } from './components/AuditFormField'
import { toLocalDate } from '../../utils/date'
import { FormTitle } from './components/FormTitle'
import { useRoles } from '../../hooks/useRoles'

const MemberProfile = () => {
  const { t, i18n } = useTranslation()
  const { memberId } = useParams()
  const roles = useRoles()

  // no admin work can be done in own profile
  const isAdmin = roles.isMembersAdmin && memberId !== 'me'

  const { data, isLoading, error, update } = useApi<Member>({
    url: `v1/members/${memberId}`,
  })
  const [editMode, setEditMode] = useState<MemberEditMode | undefined>()

  const handleOpenEditModal = (mode: MemberEditMode) => {
    setEditMode(mode)
  }

  return (
    <Box sx={{ padding: 3 }}>
      <Typography variant='h2' gutterBottom>
        {isAdmin ? data?.firstName : t('member.profile')}
      </Typography>

      {isLoading ? (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
          }}
        >
          <CircularProgress size={24} color='inherit' />
        </Box>
      ) : error || !data ? (
        <Typography variant='h6' color='error' align='center'>
          {t('error.loadingMemberData', 'Error loading member data.')}
        </Typography>
      ) : (
        <>
          <Stack
            direction='row'
            spacing={1}
            sx={{ mb: 3, justifyContent: 'flex-end' }}
          >
            {data.roles &&
              data.roles.length > 0 &&
              data.roles.map((role, index) => (
                <Chip
                  key={index}
                  label={role.name?.[i18n.language == 'fi' ? 'fi' : 'en']}
                  color='primary'
                  icon={<Icon icon='mdi:shield-user' />}
                />
              ))}
            {isAdmin && (
              <EditButton
                mode='roles'
                positionStatic={true}
                onClick={() => handleOpenEditModal('roles')}
              />
            )}
          </Stack>

          <Stack spacing={3}>
            <Stack direction={{ sm: 'column', md: 'row' }} spacing={3}>
              <Card sx={{ flex: 1, position: 'relative' }}>
                <EditButton
                  mode='personalInfo'
                  onClick={() => handleOpenEditModal('personalInfo')}
                />
                <CardContent>
                  <FormTitle title='member.info' icon='mdi:account' />

                  <Stack spacing={1.5}>
                    <FormField label='member.fullname' width={100}>
                      {data.firstName} {data.lastName}
                    </FormField>

                    <FormField label='member.email' width={100}>
                      {data.email}
                    </FormField>

                    <FormField label='member.phone' width={100}>
                      {data.phoneNumber || 'N/A'}
                    </FormField>

                    <FormField label='member.address' width={100}>
                      {[
                        data.streetAddress,
                        `${data.postcode || ''} ${data.townCity || ''}`,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'N/A'}
                    </FormField>

                    <FormField label='member.dateOfBirth' width={100}>
                      {data.dateOfBirth && toLocalDate(data.dateOfBirth)}
                    </FormField>
                  </Stack>
                </CardContent>
              </Card>

              <Card sx={{ flex: 1, position: 'relative' }}>
                <EditButton
                  mode='emergencyContact'
                  onClick={() => handleOpenEditModal('emergencyContact')}
                />
                <CardContent>
                  <FormTitle
                    title='member.emergencyContact'
                    icon='mdi:phone-alert'
                  />

                  <Stack spacing={1.5}>
                    <FormField label='member.iceContact'>
                      {data.iceContactName || 'N/A'}
                    </FormField>

                    <FormField label='member.icePhone'>
                      {data.iceContactPhoneNumber || 'N/A'}
                    </FormField>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>

            <Card>
              {isAdmin && (
                <EditButton
                  mode='training'
                  onClick={() => handleOpenEditModal('training')}
                />
              )}
              <CardContent>
                <FormTitle
                  title='member.trainingProgram'
                  icon='mdi:account-school'
                />

                <Typography variant='body1'>
                  {data.isTrainingProgramPilot
                    ? 'Is a Training Program Pilot'
                    : 'Not a Training Program Pilot'}
                </Typography>
              </CardContent>
            </Card>

            <Card>
              {isAdmin && (
                <EditButton
                  mode='membership'
                  onClick={() => handleOpenEditModal('membership')}
                />
              )}
              <CardContent>
                <FormTitle title='member.membership' icon='mdi:information' />

                <Stack spacing={1.5}>
                  <FormField label='member.memberId'>
                    {data.memberId.toString()}
                  </FormField>

                  <FormField label='member.memberType'>
                    {t(`member.types.${data.memberType.toLowerCase()}`)}
                  </FormField>

                  <FormField
                    label='member.canMakeReservations'
                    icon={
                      data.canMakeReservations
                        ? 'mdi:check-box-outline'
                        : 'mdi:check-box-outline-blank'
                    }
                  />

                  <FormField label='member.billingId'>
                    {data.billingId}
                  </FormField>

                  <FormField label='member.memberSince'>
                    {toLocalDate(data.memberSince)}
                  </FormField>

                  {isAdmin && (
                    <>
                      <AuditFormField
                        label='member.created'
                        by={data.createdBy}
                        at={data.createdAt}
                        memberId={data.memberId}
                      />

                      <AuditFormField
                        label='member.updated'
                        by={data.updatedBy}
                        at={data.updatedAt}
                        memberId={data.memberId}
                      />

                      <AuditFormField
                        label='member.emailVerifiedAt'
                        at={data.emailVerifiedAt}
                        memberId={data.memberId}
                      />
                    </>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>

          <EditMemberModal
            mode={editMode}
            onClose={() => setEditMode(undefined)}
            memberData={data}
            mutate={update}
          />
        </>
      )}
    </Box>
  )
}

export default MemberProfile
