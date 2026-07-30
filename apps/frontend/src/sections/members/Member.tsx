import {
  Alert,
  AlertTitle,
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
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material'
import useApi from '../../hooks/useApi'
import dayjs from 'dayjs'
import { Member, MemberListResponse, MIKLang, MIKMemberTypes } from '@backend/routes/members/models'
import { InvoiceListResponse } from '@backend/routes/invoicing/models'
import { FlightLogListResponse } from '@backend/routes/flight-log/models'
import { BookingListResponse, BookingFilters } from '@backend/routes/bookings/models'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import { useState, useEffect, useMemo } from 'react'
import { EditMemberModal, MemberEditMode } from './components/EditMemberModal'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { EditButton } from '../../components/EditButton'
import { FormField } from '../../components/FormField'
import { AuditFormField } from '../../components/AuditFormField'
import { InstructorQualificationsCard } from './components/InstructorQualificationsCard'

import { formatPhoneNumber } from '../../utils/format'
import { langFlagIcon } from '../../utils/lang'
import { COUNTRIES } from '../../data/countries'
import { FormTitle } from '../../components/FormTitle'
import { useRoles } from '../../hooks/useRoles'
import { RemoteContent } from '../../components/RemoteContent'
import UserAvatar from './components/UserAvatar'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import PendingActionsIcon from '@mui/icons-material/PendingActions'
import Watermark from './components/watermark'
import { mutate } from 'swr'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import { Title } from '../../components/Title'
import { sanitizeUrl } from '@backend/util/sanitizers'
import { useTimezone } from '../../hooks/useTimezone'
import { PasskeysCard } from './components/PasskeysCard'
import { PushNotificationsCard } from './components/PushNotificationsCard'
import { ApplicationDataCard } from './components/ApplicationDataCard'
import { GdprExportCard } from './components/GdprExportCard'

const MemberProfile = () => {
  const { t, i18n } = useTranslation()
  const { memberId } = useParams()
  const navigate = useNavigate()
  const roles = useRoles()
  const { formatDate } = useTimezone()

  // no admin work can be done in own profile
  const isAdmin = roles.isMembersAdmin && memberId !== 'me'

  const { data, isLoading, error, mutation } = useApi<Member>({
    url: `v1/members/${memberId}`,
  })

  // Members can list other members filtered by role even without admin rights, unlike
  // GET /v1/members/:id which is admin-only — use the list endpoint to resolve the
  // default instructor's name.
  const { data: instructorListData } = useApi<MemberListResponse>({
    url: 'v1/members',
    params: { role: ['INSTRUCTOR'] },
    skipFetch: !data?.defaultInstructorMemberId,
  })
  const defaultInstructor = instructorListData?.members.find(
    (m) => m.memberId === data?.defaultInstructorMemberId,
  )

  // Dedicated mutation for the must-update-profile flag. It posts to the shared
  // /v1/members/must-update-profile endpoint with a one-element id array, so the
  // per-member toggle and the bulk list action go through the same backend path.
  const { mutation: mustUpdateMutation } = useApi<{ updated: number }>({
    url: 'v1/members',
    skipFetch: true,
  })

  const [editMode, setEditMode] = useState<MemberEditMode | undefined>()
  const [isPreFlightChecked, setIsPreFlightChecked] = useState<boolean>(false)
  const [problem, setProblem] = useState<Problem | undefined>()

  // Email change dialog state
  const [emailChangeOpen, setEmailChangeOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailChangeError, setEmailChangeError] = useState('')
  const [emailChangeSending, setEmailChangeSending] = useState(false)
  const [emailChangeSent, setEmailChangeSent] = useState(false)

  const isValidEmail = (email: string) =>
    /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)

  const handleEmailChangeRequest = async () => {
    if (!isValidEmail(newEmail)) {
      setEmailChangeError(t('emailChange.invalidEmailFormat'))
      return
    }
    setEmailChangeError('')
    setEmailChangeSending(true)
    const { error } = await mutation.trigger('POST', { newEmail }, 'email-change/request')
    setEmailChangeSending(false)

    if (error) {
      if (error.status === 409) {
        setProblem({ status: 409, detail: t('emailChange.emailAlreadyInUse') })
      } else {
        setProblem(error)
      }
      return
    }

    setEmailChangeSent(true)
  }

  const handleEmailChangeClose = () => {
    setEmailChangeOpen(false)
    setNewEmail('')
    setEmailChangeError('')
    setEmailChangeSent(false)
  }

  const handlePreFlightCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsPreFlightChecked(event.target.checked)
  }

  const handleOpenEditModal = (mode: MemberEditMode) => {
    setEditMode(mode)
  }

  const handleDeactivate = async (reason?: string) => {
    const confirmMessage = t('member.deactivateConfirmMessage', {
      name: `${data?.firstName} ${data?.lastName}`,
    })
    if (!globalThis.confirm(confirmMessage)) {
      return
    }

    const { error } = await mutation.trigger('POST', { reason }, 'deactivate')
    if (error) {
      return setProblem(error)
    }

    setProblem({
      status: 200,
      detail: t('member.deactivatedSuccessMessage'),
    })

    navigate('/club/')
  }

  const handleCancelMembership = async () => {
    const confirmMessage = t('member.cancelMembershipConfirmMessage')
    if (!globalThis.confirm(confirmMessage)) {
      return
    }

    const { error } = await mutation.trigger('POST', {}, '/me/cancel-membership')
    if (error) {
      if (error.status === 400) {
        setProblem({
          status: 400,
          detail: t('member.cannotCancelPaidMembership'),
        })
      } else {
        setProblem(error)
      }
      return
    }

    setProblem({
      status: 200,
      detail: t('member.membershipCancelledSuccessMessage'),
    })

    // Redirect to home or logout
    navigate('/')
  }

  const handleApprove = async () => {
    const { error } = await mutation.trigger<undefined, Member>('POST', undefined, 'approve')
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
    phoneCountry,
    streetAddress,
    postcode,
    townCity,
    country,
    dateOfBirth,
    iceContactName,
    iceContactPhoneNumber,
    iceContactPhoneCountry,
    imWhatsapp,
    imTelegram,
    imFacebookMessenger,
    imDiscord,
    imViber,
    imSignal,
    isTrainingProgramPilot,
    licenceId,
    licenceExpiry,
    medicalExpiry,
    medicalClass1Expiry,
    medicalClass2Expiry,
    medicalLaplExpiry,
    //memberId,
    memberType,
    canMakeReservations,
    billingId,
    brevoContactId,
    memberSince,
    isMembershipApproved,
    isMembershipExpired,
    autoRenewAnnualMembership,
    autoRenewEquipmentFee,
    lang,
    iban,
    ibanAccountName,
    defaultInstructorMemberId,
  } = data || {}

  const isRemoved = memberType == MIKMemberTypes.REMOVED
  const isExternalUser = memberType == MIKMemberTypes.EXTERNAL

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Box sx={{ padding: 3 }}>
        <SnackAlert problem={problem} />

        {memberId === 'me' && data?.mustUpdateProfile && (
          <Alert severity='warning' sx={{ mb: 2 }}>
            <AlertTitle>{t('member.mustUpdateProfileBannerTitle')}</AlertTitle>
            {t('member.mustUpdateProfileBannerMessage')}
          </Alert>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Badge
            overlap='circular'
            badgeContent={
              !isExternalUser && (
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
              )
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

          <Title label={firstName || t('member.profile')} />
        </Box>

        <Stack direction='row' spacing={1} sx={{ mb: 3, justifyContent: 'flex-end' }}>
          {data?.roles &&
            data?.roles.length > 0 &&
            data?.roles.map((role, index) => (
              <Chip
                key={index}
                label={role.name?.[i18n.language as MIKLang]}
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
          {isAdmin && !isMembershipApproved && !isRemoved && !isExternalUser && (
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
                  <FormTitle title={t('member.membershipPending')} icon='mdi:account-check' />
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
          {isAdmin && data?.applicationData && (
            <ApplicationDataCard
              applicationData={data.applicationData}
              isMembershipApproved={Boolean(isMembershipApproved)}
            />
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {email}
                      {isAdmin && (
                        <EditButton
                          title={t('member.edit.email')}
                          onClick={() => handleOpenEditModal('email')}
                        />
                      )}
                      {memberId === 'me' && (
                        <Button
                          size='small'
                          variant='text'
                          onClick={() => setEmailChangeOpen(true)}
                          sx={{
                            minWidth: 'auto',
                            textTransform: 'none',
                            fontSize: '0.75rem',
                          }}
                        >
                          {t('emailChange.changeEmailButton')}
                        </Button>
                      )}
                    </Box>
                  </FormField>

                  <FormField label={t('member.phone')} width={100}>
                    {phoneNumber ? formatPhoneNumber(phoneNumber, phoneCountry) : 'N/A'}
                  </FormField>

                  <FormField label={t('member.address')} width={100}>
                    {[streetAddress, `${postcode || ''} ${townCity || ''}`]
                      .filter(Boolean)
                      .join(', ') || 'N/A'}
                    {country && <> {COUNTRIES.find((c) => c.code === country)?.name ?? country}</>}
                  </FormField>

                  <FormField label={t('member.dateOfBirth')} width={100}>
                    {formatDate(dateOfBirth)}
                  </FormField>

                  <FormField label={t('member.lang')} width={100}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon icon={langFlagIcon(lang)} fontSize={18} />
                      {lang?.toUpperCase() ?? 'N/A'}
                    </Box>
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
                <FormTitle title={t('member.emergencyContact')} icon='mdi:phone-alert' />

                <Stack spacing={1.5}>
                  <FormField label={t('member.iceContact')}>{iceContactName || 'N/A'}</FormField>

                  <FormField label={t('member.icePhone')}>
                    {iceContactPhoneNumber
                      ? formatPhoneNumber(iceContactPhoneNumber, iceContactPhoneCountry)
                      : 'N/A'}
                  </FormField>
                </Stack>
              </CardContent>
            </Card>
          </Stack>

          {!isExternalUser && (
            <Card>
              <EditButton
                title={t('member.edit.billing')}
                onClick={() => handleOpenEditModal('billing')}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                }}
              />
              <CardContent>
                <FormTitle
                  title={t('member.billingInfo.billingSettings')}
                  icon='mdi:credit-card-outline'
                />
                <Stack spacing={1.5}>
                  <FormField label={t('member.billingInfo.annualMembershipAutoRenew')}>
                    <Checkbox
                      checked={Boolean(autoRenewAnnualMembership)}
                      disabled
                      size='large'
                      sx={{ p: 0, pl: 0 }}
                    />
                  </FormField>
                  <FormField label={t('member.billingInfo.equipmentFeeAutoRenew')}>
                    <Checkbox
                      checked={Boolean(autoRenewEquipmentFee)}
                      disabled
                      size='large'
                      sx={{ p: 0, pl: 0 }}
                    />
                  </FormField>
                </Stack>
              </CardContent>
            </Card>
          )}

          <Card>
            <EditButton
              title={t('member.edit.bankDetails')}
              onClick={() => handleOpenEditModal('bankDetails')}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
              }}
            />
            <CardContent>
              <FormTitle title={t('member.bankDetails.title')} icon='mdi:bank-outline' />
              <Stack spacing={1.5}>
                <FormField label={t('member.iban')}>{iban || 'N/A'}</FormField>
                <FormField label={t('member.ibanAccountName')}>
                  {ibanAccountName || 'N/A'}
                </FormField>
              </Stack>
            </CardContent>
          </Card>

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
              <FormTitle title={t('member.licenceInfo.licenceInfo')} icon='mdi:certificate' />
              <Stack spacing={1.5}>
                <FormField label={t('member.licenceInfo.licenceId')}>
                  {licenceId || 'N/A'}
                </FormField>
                <FormField label={t('member.licenceInfo.licenceExpiry')}>
                  {licenceExpiry || 'N/A'}
                </FormField>
                <FormField label={t('member.licenceInfo.medicalClass1Expiry')}>
                  {medicalClass1Expiry || 'N/A'}
                </FormField>
                <FormField label={t('member.licenceInfo.medicalClass2Expiry')}>
                  {medicalClass2Expiry || 'N/A'}
                </FormField>
                <FormField label={t('member.licenceInfo.medicalLaplExpiry')}>
                  {medicalLaplExpiry || 'N/A'}
                </FormField>
                <FormField label={t('member.licenceInfo.medicalExpiry')}>
                  {medicalExpiry || 'N/A'}
                </FormField>
              </Stack>
            </CardContent>
          </Card>

          {(isAdmin || memberId === 'me') &&
            data?.roles?.some((r) => r.roleId === 'INSTRUCTOR' || r.roleId === 'EXAMINER') && (
              <InstructorQualificationsCard
                memberId={memberId!}
                canEdit={isAdmin || memberId === 'me'}
                canViewHistory={isAdmin}
                onSaved={() => mutate(() => true)}
              />
            )}

          <MailingListsCard
            memberId={memberId!}
            currentLists={data?.mailingLists ?? []}
            onSaved={() => mutate(() => true)}
          />

          {!isExternalUser && <PasskeysCard memberId={memberId!} isAdmin={isAdmin} />}

          {!isExternalUser && memberId === 'me' && <PushNotificationsCard />}

          {!isAdmin && memberId === 'me' && <GdprExportCard />}

          {!isExternalUser && (
            <Card>
              {(isAdmin || memberId === 'me') && (
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
                <FormTitle title={t('member.trainingProgram')} icon='mdi:account-school' />

                <Stack spacing={1.5}>
                  <FormField label={t('member.isTrainingProgramPilot')}>
                    <Checkbox
                      checked={Boolean(isTrainingProgramPilot)}
                      disabled
                      size='large'
                      sx={{ p: 0, pl: 0 }}
                    />
                  </FormField>

                  <FormField label={t('member.defaultInstructor')} width={100}>
                    {defaultInstructorMemberId
                      ? defaultInstructor
                        ? `${defaultInstructor.first} ${defaultInstructor.last}`
                        : '...'
                      : 'N/A'}
                  </FormField>
                </Stack>
              </CardContent>
            </Card>
          )}

          <Card>
            <EditButton
              title={t('member.edit.instantMessaging')}
              onClick={() => handleOpenEditModal('instantMessaging')}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
              }}
            />
            <CardContent>
              <FormTitle title={t('member.instantMessaging.title')} icon='mdi:message-text' />

              <Stack spacing={1.5}>
                <FormField label={t('member.instantMessaging.whatsapp')}>
                  {imWhatsapp ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon icon='mdi:whatsapp' style={{ color: '#25D366' }} />
                      <a href={sanitizeUrl(imWhatsapp)} target='_blank' rel='noopener noreferrer'>
                        {imWhatsapp}
                      </a>
                    </Box>
                  ) : (
                    'N/A'
                  )}
                </FormField>

                <FormField label={t('member.instantMessaging.telegram')}>
                  {imTelegram ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon icon='mdi:telegram' style={{ color: '#0088cc' }} />
                      <a href={sanitizeUrl(imTelegram)} target='_blank' rel='noopener noreferrer'>
                        {imTelegram}
                      </a>
                    </Box>
                  ) : (
                    'N/A'
                  )}
                </FormField>

                <FormField label={t('member.instantMessaging.messenger')}>
                  {imFacebookMessenger ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon icon='mdi:facebook-messenger' style={{ color: '#0084FF' }} />
                      <a
                        href={sanitizeUrl(imFacebookMessenger)}
                        target='_blank'
                        rel='noopener noreferrer'
                      >
                        {imFacebookMessenger}
                      </a>
                    </Box>
                  ) : (
                    'N/A'
                  )}
                </FormField>

                <FormField label={t('member.instantMessaging.discord')}>
                  {imDiscord ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon icon='mdi:discord' style={{ color: '#5865F2' }} />
                      <a href={sanitizeUrl(imDiscord)} target='_blank' rel='noopener noreferrer'>
                        {imDiscord}
                      </a>
                    </Box>
                  ) : (
                    'N/A'
                  )}
                </FormField>

                <FormField label={t('member.instantMessaging.viber')}>
                  {imViber ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon icon='simple-icons:viber' style={{ color: '#7360F2' }} />
                      <a href={sanitizeUrl(imViber)} target='_blank' rel='noopener noreferrer'>
                        {imViber}
                      </a>
                    </Box>
                  ) : (
                    'N/A'
                  )}
                </FormField>

                <FormField label={t('member.instantMessaging.signal')}>
                  {imSignal ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon icon='simple-icons:signal' style={{ color: '#3A76F0' }} />
                      <a href={sanitizeUrl(imSignal)} target='_blank' rel='noopener noreferrer'>
                        {imSignal}
                      </a>
                    </Box>
                  ) : (
                    'N/A'
                  )}
                </FormField>
              </Stack>
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
              <FormTitle title={t('member.membership')} icon='mdi:information' />

              <Stack spacing={1.5}>
                <FormField label={t('member.memberId')}>{data?.memberId.toString()}</FormField>

                <FormField label={t('member.memberType')}>
                  {data && t(`member.types.${memberType?.toLowerCase()}`)}
                </FormField>

                <FormField label={t('member.canMakeReservations')}>
                  <Checkbox
                    checked={Boolean(canMakeReservations)}
                    disabled
                    size='large'
                    sx={{ p: 0, pl: 0 }}
                  />
                </FormField>

                {!isExternalUser && (
                  <>
                    <FormField label={t('member.isMembershipExpired')}>
                      <Checkbox
                        checked={Boolean(isMembershipExpired)}
                        disabled
                        size='large'
                        sx={{ p: 0, pl: 0 }}
                      />
                    </FormField>

                    <FormField label={t('member.billingId')}>{billingId}</FormField>

                    <FormField label='Brevo Id'>{brevoContactId?.toString()}</FormField>

                    <FormField label={t('member.memberSince')}>{formatDate(memberSince)}</FormField>
                  </>
                )}

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

                    {!isExternalUser && (
                      <AuditFormField
                        label={t('member.membershipApproved')}
                        at={data.membershipApprovedAt}
                        by={data.membershipApprovedBy}
                        memberId={data.memberId}
                      />
                    )}

                    <FormField label={t('member.mustUpdateProfile')}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Checkbox
                          checked={Boolean(data.mustUpdateProfile)}
                          disabled
                          size='large'
                          sx={{ p: 0, pl: 0 }}
                        />
                        <Button
                          size='small'
                          variant='outlined'
                          color={data.mustUpdateProfile ? 'success' : 'warning'}
                          loading={mustUpdateMutation.isMutating}
                          onClick={async () => {
                            const newValue = !data.mustUpdateProfile
                            const { data: result, error } = await mustUpdateMutation.trigger(
                              'POST',
                              { memberIds: [data.memberId], mustUpdateProfile: newValue },
                              'must-update-profile',
                            )
                            if (error) {
                              setProblem(error)
                            } else if (!result?.updated) {
                              setProblem({ status: 404, detail: t('member.noMembersFound') })
                            } else {
                              mutate(
                                (key) => Array.isArray(key) && key[0] === `v1/members/${memberId}`,
                              )
                            }
                          }}
                        >
                          {data.mustUpdateProfile
                            ? t('member.clearMustUpdateProfile')
                            : t('member.setMustUpdateProfile')}
                        </Button>
                      </Box>
                    </FormField>
                  </>
                )}
              </Stack>
            </CardContent>
          </Card>

          {isAdmin && memberId && <AdminInvoicesCard memberId={memberId} />}

          {isAdmin && memberId && <AdminFlightsCard memberId={memberId} />}

          {isAdmin && roles.isBookingAdmin && memberId && <AdminBookingsCard memberId={memberId} />}

          <Grid>
            {isAdmin && (
              <>
                <Button
                  color='warning'
                  variant='outlined'
                  onClick={() => handleDeactivate()}
                  loadingPosition='start'
                  loading={mutation.isMutating}
                  startIcon={<Icon icon='mdi:account-cancel' />}
                  sx={{ mr: 2 }}
                >
                  {t('member.deactivate', 'Deactivate Member')}
                </Button>
              </>
            )}
            {!isAdmin && memberId === 'me' && (
              <Button
                color='warning'
                variant='outlined'
                onClick={handleCancelMembership}
                loadingPosition='start'
                loading={mutation.isMutating}
                startIcon={<Icon icon='mdi:account-remove' />}
              >
                {t('member.cancelMembership', 'Cancel Membership')}
              </Button>
            )}
          </Grid>
        </Stack>

        <EditMemberModal
          mode={editMode}
          onClose={() => setEditMode(undefined)}
          memberData={data}
          api={mutation}
          isAdmin={isAdmin}
        />
      </Box>
      {!isMembershipApproved && <Watermark text={t('member.membershipPending')} />}
      {data?.memberType === MIKMemberTypes.REMOVED && (
        <Watermark text={t('member.types.removed')} color='red' />
      )}

      {/* Email change dialog */}
      <Dialog
        open={emailChangeOpen}
        onClose={handleEmailChangeClose}
        maxWidth='sm'
        fullWidth
        aria-labelledby='email-change-dialog-title'
      >
        <DialogTitle id='email-change-dialog-title'>
          {t('emailChange.changeEmailButton')}
        </DialogTitle>
        <DialogContent>
          {emailChangeSent ? (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Icon icon='mdi:email-check' width={48} height={48} color='#4caf50' />
              <Typography variant='body1' sx={{ mt: 2 }}>
                {t('emailChange.verificationSent', { email: newEmail })}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ pt: 1 }}>
              <TextField
                fullWidth
                label={t('emailChange.newEmailLabel')}
                type='email'
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value)
                  if (emailChangeError) setEmailChangeError('')
                }}
                error={!!emailChangeError}
                helperText={emailChangeError || undefined}
                autoFocus
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEmailChangeClose} color='inherit'>
            {emailChangeSent ? t('general.close', 'Close') : t('general.cancel', 'Cancel')}
          </Button>
          {!emailChangeSent && (
            <Button
              onClick={handleEmailChangeRequest}
              variant='contained'
              disabled={!newEmail || emailChangeSending}
            >
              {emailChangeSending ? (
                <CircularProgress size={20} />
              ) : (
                t('emailChange.sendVerificationButton')
              )}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </RemoteContent>
  )
}

export default MemberProfile

type MailingList = { id: string; name: string }

const MailingListsCard = ({
  memberId,
  currentLists,
  onSaved,
}: {
  memberId: string
  currentLists: string[]
  onSaved: () => void
}) => {
  const { t } = useTranslation()
  const { data: availableLists, isLoading } = useApi<MailingList[]>({
    url: 'v1/members/mailing-lists',
  })

  const { mutation } = useApi<{ mailingLists: string[] }>({
    url: memberId === 'me' ? 'v1/members/me' : `v1/members/${memberId}`,
  })

  const [selected, setSelected] = useState<string[]>(currentLists)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<Problem | undefined>()

  // Sync state when member data loads asynchronously
  useEffect(() => {
    setSelected(currentLists)
  }, [currentLists])

  const handleToggle = async (id: string) => {
    const previous = selected
    const updated = selected.includes(id) ? selected.filter((l) => l !== id) : [...selected, id]
    setSelected(updated)
    setSaving(true)
    const { error } = await mutation.trigger('PATCH', { mailingLists: updated })
    setSaving(false)
    if (error) {
      setSelected(previous)
      setProblem(error)
      return
    }
    onSaved()
  }

  return (
    <Card>
      <CardContent>
        <SnackAlert problem={problem} />
        <FormTitle title={t('member.mailingLists.title')} icon='mdi:email-newsletter' />
        <MailingListsContent
          isLoading={isLoading}
          availableLists={availableLists}
          selected={selected}
          saving={saving}
          onToggle={handleToggle}
        />
      </CardContent>
    </Card>
  )
}

const MailingListsContent = ({
  isLoading,
  availableLists,
  selected,
  saving,
  onToggle,
}: {
  isLoading: boolean
  availableLists: MailingList[] | undefined
  selected: string[]
  saving: boolean
  onToggle: (id: string) => void
}) => {
  const { t } = useTranslation()
  if (isLoading) return <CircularProgress size={20} />
  if (!availableLists?.length) {
    return (
      <Typography
        variant='body2'
        sx={{
          color: 'text.secondary',
        }}
      >
        {t('member.mailingLists.noLists')}
      </Typography>
    )
  }
  return (
    <Stack spacing={1}>
      {availableLists.map((list) => (
        <FormControlLabel
          key={list.id}
          control={
            <Checkbox
              checked={selected.includes(list.id)}
              onChange={() => onToggle(list.id)}
              disabled={saving}
              size='small'
            />
          }
          label={list.name}
        />
      ))}
    </Stack>
  )
}

const currencyFormatter = new Intl.NumberFormat('fi-FI', {
  style: 'currency',
  currency: 'EUR',
})

const AdminInvoicesCard = ({ memberId }: { memberId: string }) => {
  const { t } = useTranslation()
  const { formatDate } = useTimezone()
  const { data, isLoading, error } = useApi<InvoiceListResponse>({
    url: `v1/members/${memberId}/invoices`,
    alwaysSudo: true,
  })

  const { mutation: pdfMutation } = useApi<never>({
    url: `v1/invoices`,
    skipFetch: true,
    alwaysSudo: true,
  })

  const handleDownloadPdf = async (invoiceId: string) => {
    try {
      const response = await pdfMutation.trigger<undefined, string>(
        'GET',
        undefined,
        `${invoiceId}/pdf`,
      )
      if (!response.data) return
      const byteCharacters = atob(response.data)
      const byteNumbers = Array.from(byteCharacters).map((char) => char.charCodeAt(0))
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `invoice-${invoiceId}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently fail — PDF download is best-effort in this context
    }
  }

  return (
    <Card>
      <CardContent>
        <FormTitle title={t('member.adminInvoices.title')} icon='mdi:receipt-text' />
        <RemoteContent isLoading={isLoading} error={error}>
          {!data?.invoices?.length ? (
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
              }}
            >
              {t('member.adminInvoices.noInvoices')}
            </Typography>
          ) : (
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>{t('member.adminInvoices.date')}</TableCell>
                  <TableCell>{t('member.adminInvoices.type')}</TableCell>
                  <TableCell>{t('member.adminInvoices.description')}</TableCell>
                  <TableCell align='right'>{t('member.adminInvoices.total')}</TableCell>
                  <TableCell align='center'>{t('member.adminInvoices.status')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.invoices.slice(0, 10).map((invoice) => {
                  const isPastDue =
                    invoice.is_paid === false && dayjs(invoice.due_at).isBefore(dayjs(), 'day')
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>{formatDate(invoice.sent_at)}</TableCell>
                      <TableCell>{invoice.invoice_type}</TableCell>
                      <TableCell
                        sx={{
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                        onClick={() => handleDownloadPdf(invoice.id)}
                      >
                        {invoice.description || '—'}
                      </TableCell>
                      <TableCell align='right'>
                        {invoice.total_sum
                          ? currencyFormatter.format(parseFloat(invoice.total_sum))
                          : '—'}
                      </TableCell>
                      <TableCell align='center'>
                        {invoice.is_paid ? (
                          <Tooltip title={t('billing.filters.paid')}>
                            <CheckCircleIcon color='success' fontSize='small' />
                          </Tooltip>
                        ) : isPastDue ? (
                          <Tooltip title={t('billing.filters.pastDueOnly')}>
                            <Icon
                              icon='mdi:alert-circle'
                              style={{ color: '#d32f2f' }}
                              fontSize={20}
                            />
                          </Tooltip>
                        ) : (
                          <Tooltip title={t('billing.filters.unpaid')}>
                            <Icon
                              icon='mdi:clock-outline'
                              style={{ color: '#ed6c02' }}
                              fontSize={20}
                            />
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </RemoteContent>
      </CardContent>
    </Card>
  )
}

const AdminFlightsCard = ({ memberId }: { memberId: string }) => {
  const { t } = useTranslation()
  const { formatDate, formatTime } = useTimezone()
  const { data, isLoading, error } = useApi<FlightLogListResponse>({
    url: `v1/members/${memberId}/flights`,
    alwaysSudo: true,
  })

  return (
    <Card>
      <CardContent>
        <FormTitle title={t('member.adminFlights.title')} icon='mdi:airplane' />
        <RemoteContent isLoading={isLoading} error={error}>
          {!data?.logs?.length ? (
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
              }}
            >
              {t('member.adminFlights.noFlights')}
            </Typography>
          ) : (
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>{t('member.adminFlights.date')}</TableCell>
                  <TableCell>{t('member.adminFlights.aircraft')}</TableCell>
                  <TableCell>{t('member.adminFlights.route')}</TableCell>
                  <TableCell align='right'>{t('flightLog.offBlock', 'Off-block')}</TableCell>
                  <TableCell align='right'>{t('flightLog.onBlock', 'On-block')}</TableCell>
                  <TableCell>{t('member.adminFlights.duration')}</TableCell>
                  <TableCell>{t('member.adminFlights.type')}</TableCell>
                  <TableCell>{t('member.adminFlights.status')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.logs.map((log) => (
                  <TableRow key={log.flightId}>
                    <TableCell>
                      <Link to={`/logs/flights/${log.flightId}`}>
                        {formatDate(log.offBlockTimeUtc)}
                      </Link>
                    </TableCell>
                    <TableCell>{log.aircraftRegistration}</TableCell>
                    <TableCell>
                      {log.departureAirport} → {log.arrivalAirport}
                    </TableCell>
                    <TableCell align='right'>{formatTime(log.offBlockTimeUtc)}</TableCell>
                    <TableCell align='right'>{formatTime(log.onBlockTimeUtc)}</TableCell>
                    <TableCell>{log.flightTime}</TableCell>
                    <TableCell>
                      {t(`flightLog.flightTypes.${log.flightType}`, log.flightType)}
                    </TableCell>
                    <TableCell>{t(`flightLog.status.${log.status}`, log.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </RemoteContent>
      </CardContent>
    </Card>
  )
}

const AdminBookingsCard = ({ memberId }: { memberId: string }) => {
  const { t } = useTranslation()
  const { formatDate, formatTime } = useTimezone()
  const bookingFilters: BookingFilters = useMemo(
    () => ({
      memberId,
      from: dayjs().toISOString(),
    }),
    [memberId],
  )
  const { data, isLoading, error } = useApi<BookingListResponse>({
    url: 'v1/bookings',
    params: bookingFilters,
    alwaysSudo: true,
  })

  return (
    <Card>
      <CardContent>
        <FormTitle title={t('member.adminBookings.title')} icon='mdi:calendar-clock' />
        <RemoteContent isLoading={isLoading} error={error}>
          {!data?.bookings?.length ? (
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
              }}
            >
              {t('member.adminBookings.noBookings')}
            </Typography>
          ) : (
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>{t('member.adminBookings.date')}</TableCell>
                  <TableCell>{t('member.adminBookings.startTime')}</TableCell>
                  <TableCell>{t('member.adminBookings.endTime')}</TableCell>
                  <TableCell>{t('member.adminBookings.registration')}</TableCell>
                  <TableCell>{t('member.adminBookings.type')}</TableCell>
                  <TableCell>{t('member.adminBookings.instructor')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.bookings.map((booking) => {
                  const instructorName = booking.instructor
                    ? `${booking.instructor.firstName ?? ''} ${booking.instructor.lastName ?? ''}`.trim()
                    : ''
                  return (
                    <TableRow key={booking.bookingId}>
                      <TableCell>{formatDate(booking.startTime)}</TableCell>
                      <TableCell>{formatTime(booking.startTime)}</TableCell>
                      <TableCell>{formatTime(booking.endTime)}</TableCell>
                      <TableCell>{booking.registration}</TableCell>
                      <TableCell>{t(`schedule.types.${booking.type}`, booking.type)}</TableCell>
                      <TableCell>{instructorName || '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </RemoteContent>
      </CardContent>
    </Card>
  )
}
