import {
  Card,
  CardContent,
  Typography,
  Box,
  Stack,
  Chip,
  Button,
  Grid,
  Badge,
  Tooltip,
  FormControlLabel,
  Checkbox,
} from '@mui/material'
import useApi from '../../hooks/useApi'
import { Member, MemberApproval } from '@backend/routes/members/models'
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
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import PendingActionsIcon from '@mui/icons-material/PendingActions'
import Watermark from '../../components/watermark'
import { mutate } from 'swr'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@backend/routes/response'

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

  const { mutation: approveMutation } = useApi<string, MemberApproval>({
    url: `v1/members/${memberId}/approve`,
    skipFetch: true,
  })

  const [editMode, setEditMode] = useState<MemberEditMode | undefined>()
  const [isPreFlightChecked, setIsPreFlightChecked] = useState<boolean>(false)
  const [problem, setProblem] = useState<Problem | undefined>()

  const handlePreFlightCheckboxChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setIsPreFlightChecked(event.target.checked)
  }

  const handleOpenEditModal = (mode: MemberEditMode) => {
    setEditMode(mode)
  }

  const handleRemove = async () => {
    const { error } = await mutation.trigger('DELETE', {})
    if (error) {
      return setProblem(error)
    }
    navigate('/members')
  }

  const handleApprove = async () => {
    const { error } = await approveMutation.trigger('POST', memberId)
    if (error) {
      return setProblem(error)
    }

    setProblem({
      status: 200,
      detail: t('member.approvedSnackbarMessage', data),
    })

    mutate((key) => Array.isArray(key) && key[0] == `v1/members/${memberId}`)
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
    licenceId,
    licenceExpiry,
    medicalExpiry,
    //memberId,
    memberType,
    canMakeReservations,
    billingId,
    memberSince,
    isMembershipApproved,
  } = data || {}

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Box sx={{ padding: 3 }}>
        <SnackAlert problem={problem} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Badge
            overlap='circular'
            //variant="dot"
            badgeContent={
              <Tooltip
                title={
                  isMembershipApproved
                    ? t('member.membershipApproved')
                    : t('member.membershipPending')
                }
              >
                {isMembershipApproved ? (
                  <CheckCircleIcon fontSize='large' color='success' />
                ) : (
                  <PendingActionsIcon fontSize='large' color='error' />
                )}
              </Tooltip>
            }
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <UserAvatar
              email={email || ''}
              firstName={firstName || ''}
              lastName={lastName || ''}
              size={100}
              className='user-avatar'
            />
          </Badge>

          <Typography variant='h2'>
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
                label={
                  role.name?.[
                    i18n.language === 'fi'
                      ? 'fi'
                      : i18n.language === 'sv'
                        ? 'sv'
                        : 'en'
                  ]
                }
                color='primary'
                icon={<Icon icon='mdi:shield-user' />}
              />
            ))}
          {isAdmin && (
            <EditButton
              title={t('member.edit.roles')}
              onClick={() => handleOpenEditModal('roles')}
            />
          )}
        </Stack>

        <Stack spacing={3}>
          {isAdmin && !isMembershipApproved && (
            <Stack spacing={3}>
              <Card sx={{ flex: 1, mb: 3 }}>
                <CardContent
                  sx={{
                    borderWidth: '8px',
                    borderStyle: 'solid',
                    borderImage: `
          repeating-linear-gradient(
            45deg,
            #fdd835 0px,
            #fdd835 10px,
            #000 10px,
            #000 20px
          ) 8
        `,
                    borderRadius: 2,
                    boxShadow: 1,
                  }}
                >
                  <FormTitle
                    title={t('member.membershipPending')}
                    icon='mdi:account-check'
                  />
                  <Stack>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={isPreFlightChecked}
                          onChange={handlePreFlightCheckboxChange}
                          size='medium'
                        />
                      }
                      label={t('member.preFlightChkComplete')}
                    />

                    {!isPreFlightChecked && (
                      <Typography sx={{ mb: 2, color: 'red' }} variant='h6'>
                        {t('member.approvalDisabledMsg')}
                      </Typography>
                    )}
                    <Button
                      variant='contained'
                      disabled={!isPreFlightChecked}
                      onClick={async () => await handleApprove()}
                    >
                      {t('member.approveMembership')}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          )}
          <Stack direction={{ sm: 'column', md: 'row' }} spacing={3}>
            <Card sx={{ flex: 1, mb: 3 }}>
              <EditButton
                title={t('member.edit.personalInfo')}
                onClick={() => handleOpenEditModal('personalInfo')}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                }}
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
                    {[streetAddress, `${postcode || ''} ${townCity || ''}`]
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
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                }}
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
            {
              <EditButton
                title={t('member.edit.licence')}
                onClick={() => handleOpenEditModal('licence')}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                }}
              />
            }
            <CardContent>
              <FormTitle
                title={t('member.licenceInfo.licenceInfo')}
                icon='mdi:certificate'
              />
              <Stack spacing={1.5}>
                <FormField label={t('member.licenceInfo.licenceId')}>
                  {licenceId || 'N/A'}
                </FormField>
                <FormField label={t('member.licenceInfo.licenceExpiry')}>
                  {licenceExpiry || 'N/A'}
                </FormField>
                <FormField label={t('member.licenceInfo.medicalExpiry')}>
                  {medicalExpiry || 'N/A'}
                </FormField>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            {isAdmin && (
              <EditButton
                title={t('member.edit.training')}
                onClick={() => handleOpenEditModal('training')}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                }}
              />
            )}
            <CardContent>
              <FormTitle
                title={t('member.trainingProgram')}
                icon='mdi:account-school'
              />

              <FormField label={t('member.isTrainingProgramPilot')}>
                <Checkbox
                  checked={Boolean(isTrainingProgramPilot)}
                  disabled
                  size='medium'
                  sx={{ p: 0, pl: 0 }}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            {isAdmin && (
              <EditButton
                title={t('member.edit.membership')}
                onClick={() => handleOpenEditModal('membership')}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                }}
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

                <FormField label={t('member.canMakeReservations')}>
                  <Checkbox
                    checked={Boolean(canMakeReservations)}
                    disabled
                    size='medium'
                    sx={{ p: 0, pl: 0 }}
                  />
                </FormField>
                <FormField label={t('member.billingId')}>{billingId}</FormField>

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

                    <AuditFormField
                      label={t('member.membershipApproved')}
                      at={data.membershipApprovedAt}
                      by={data.membershipApprovedBy}
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
                loadingPosition='start'
                loading={mutation.isMutating}
                startIcon={<Icon icon='mdi:delete' />}
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
      {!isMembershipApproved && (
        <Watermark text={t('member.membershipPending')} />
      )}
    </RemoteContent>
  )
}

export default MemberProfile
