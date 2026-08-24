import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { MIKMemberTypes, MIKPermissions, type MemberListFilters } from '@mik/contracts/members'
import type {
  CreateMeeting,
  CreateVote,
  Meeting,
  MeetingAttendeesResponse,
  MeetingListResponse,
  MeetingVote,
  MeetingVotesResponse,
  UpdateMeeting,
  VoteCountersResponse,
} from '@mik/contracts/meetings'
import { SelectMember } from '../../components/SelectMember'
import { Title } from '@mik/ui/components/Title'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import useApi from '../../hooks/useApi'
import { useRoles } from '../../hooks/useRoles'

const emptyMeetingForm: CreateMeeting = {
  title: '',
  description: '',
  documentSearchFilter: '',
  meetingUrl: '',
}

const emptyVoteForm: CreateVote = {
  topic: '',
  description: '',
  options: ['', ''],
  isMultiSelect: false,
  maxSelections: null,
}

const eligibleMemberTypes: MemberListFilters['memberType'] = [
  MIKMemberTypes.FLYING,
  MIKMemberTypes.NONFLYING,
  MIKMemberTypes.JUNIOR,
  MIKMemberTypes.HONORARY,
]

const statusColor = (status: Meeting['status']): 'default' | 'warning' | 'success' | 'info' => {
  if (status === 'ONGOING') return 'success'
  if (status === 'DRAFT') return 'warning'
  if (status === 'PENDING_NOTES') return 'info'
  return 'default'
}

const voteStatusColor = (
  status: MeetingVote['status'],
): 'default' | 'success' | 'warning' | 'error' => {
  if (status === 'OPEN') return 'success'
  if (status === 'DRAFT') return 'warning'
  if (status === 'ABANDONED') return 'error'
  return 'default'
}

const DocumentFilterField = ({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) => {
  const { t } = useTranslation()

  return (
    <Stack direction='row' spacing={1} sx={{ alignItems: 'flex-start' }}>
      <TextField
        label={t('meetings.admin.documentFilter')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        helperText={t('meetings.admin.documentFilterHelp')}
        disabled={disabled}
        fullWidth
      />
      <Button
        variant='outlined'
        sx={{ mt: 1, flexShrink: 0 }}
        startIcon={<Icon icon='mdi:open-in-new' />}
        onClick={() =>
          window.open(
            `/club/documents${value ? `?search=${encodeURIComponent(value)}` : ''}`,
            '_blank',
            'noopener,noreferrer',
          )
        }
      >
        {t('meetings.admin.browseDocuments')}
      </Button>
    </Stack>
  )
}

const MeetingsAdminPage = () => {
  const { t } = useTranslation()
  const { hasSudoAccess, isLoading: rolesLoading } = useRoles()
  const isMeetingAdmin = hasSudoAccess(MIKPermissions.MEETING_ADMIN)
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [meetingForm, setMeetingForm] = useState<CreateMeeting>(emptyMeetingForm)
  const [createMeetingOpen, setCreateMeetingOpen] = useState(false)
  const [createVoteOpen, setCreateVoteOpen] = useState(false)
  const [newMeetingForm, setNewMeetingForm] = useState<CreateMeeting>(emptyMeetingForm)
  const [newVoteForm, setNewVoteForm] = useState<CreateVote>(emptyVoteForm)
  const [selectedVoteCounter, setSelectedVoteCounter] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [endMeetingOpen, setEndMeetingOpen] = useState(false)
  const [notesFile, setNotesFile] = useState<File | null>(null)
  const [endMeetingError, setEndMeetingError] = useState<string | null>(null)

  const {
    data: meetingsData,
    isLoading: meetingsLoading,
    error: meetingsError,
    mutate: mutateMeetings,
  } = useApi<MeetingListResponse>({ url: 'v1/meetings' })

  const meetings = meetingsData?.meetings ?? []

  useEffect(() => {
    if (!meetings.length) {
      setSelectedMeetingId(null)
      return
    }

    if (
      !selectedMeetingId ||
      !meetings.some((meeting) => meeting.meetingId === selectedMeetingId)
    ) {
      setSelectedMeetingId(meetings[0].meetingId)
    }
  }, [meetings, selectedMeetingId])

  const {
    data: meetingDetail,
    isLoading: detailLoading,
    error: detailError,
    mutate: mutateDetail,
  } = useApi<Meeting>(
    {
      url: `v1/meetings/${selectedMeetingId ?? 'pending'}`,
      skipFetch: !selectedMeetingId,
    },
    {
      // The fetched meeting is copied into the editable meetingForm state
      // below; revalidating on tab focus would otherwise silently overwrite
      // an admin's in-progress edits with stale server values.
      revalidateOnFocus: false,
    },
  )

  const {
    data: attendeesData,
    isLoading: attendeesLoading,
    error: attendeesError,
    mutate: mutateAttendees,
  } = useApi<MeetingAttendeesResponse>(
    {
      url: `v1/meetings/${selectedMeetingId ?? 'pending'}/attendance`,
      skipFetch: !selectedMeetingId,
    },
    {
      refreshInterval: 5000,
    },
  )

  const {
    data: voteCountersData,
    isLoading: voteCountersLoading,
    error: voteCountersError,
    mutate: mutateVoteCounters,
  } = useApi<VoteCountersResponse>(
    {
      url: `v1/meetings/${selectedMeetingId ?? 'pending'}/vote-counters`,
      skipFetch: !selectedMeetingId,
    },
    {
      refreshInterval: 5000,
    },
  )

  const {
    data: votesData,
    isLoading: votesLoading,
    error: votesError,
    mutate: mutateVotes,
  } = useApi<MeetingVotesResponse>(
    {
      url: `v1/meetings/${selectedMeetingId ?? 'pending'}/votes`,
      skipFetch: !selectedMeetingId,
    },
    {
      refreshInterval: 5000,
    },
  )

  const { mutation: meetingsMutation } = useApi<Meeting>({ url: 'v1/meetings', skipFetch: true })
  const { mutation: detailMutation } = useApi<Meeting>({
    url: `v1/meetings/${selectedMeetingId ?? 'pending'}`,
    skipFetch: true,
  })
  const { mutation: endMeetingMutation } = useApi<Meeting>({
    url: `v1/meetings/${selectedMeetingId ?? 'pending'}`,
    skipFetch: true,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  const { mutation: voteCounterMutation } = useApi<VoteCountersResponse>({
    url: `v1/meetings/${selectedMeetingId ?? 'pending'}/vote-counters`,
    skipFetch: true,
  })
  const { mutation: voteMutation } = useApi<MeetingVote>({
    url: `v1/meetings/${selectedMeetingId ?? 'pending'}/votes`,
    skipFetch: true,
  })

  useEffect(() => {
    if (!meetingDetail) return

    setMeetingForm({
      title: meetingDetail.title,
      description: meetingDetail.description ?? '',
      documentSearchFilter: meetingDetail.documentSearchFilter ?? '',
      meetingUrl: meetingDetail.meetingUrl ?? '',
    })
  }, [meetingDetail])

  const attendeeCount = attendeesData?.attendees.length ?? meetingDetail?.attendanceCount ?? 0
  const voteCounters = voteCountersData?.voteCounters ?? []
  const votes = votesData?.votes ?? []

  const excludedVoteCounterIds = useMemo(
    () => voteCounters.map((voteCounter) => voteCounter.memberId),
    [voteCounters],
  )

  const refreshSelectedMeetingData = async () => {
    await Promise.all([
      mutateMeetings(),
      mutateDetail(),
      mutateAttendees(),
      mutateVoteCounters(),
      mutateVotes(),
    ])
  }

  const handleMutationError = (detail?: string) => {
    setActionError(detail ?? t('common.error'))
  }

  const handleCreateMeeting = async () => {
    setActionError(null)
    const payload: CreateMeeting = {
      title: newMeetingForm.title.trim(),
      description: newMeetingForm.description?.trim() || null,
      documentSearchFilter: newMeetingForm.documentSearchFilter?.trim() || null,
      meetingUrl: newMeetingForm.meetingUrl?.trim() || null,
    }

    const response = await meetingsMutation.trigger('POST', payload)
    if (response.error || !response.data) {
      handleMutationError(response.error?.detail)
      return
    }

    setCreateMeetingOpen(false)
    setNewMeetingForm(emptyMeetingForm)
    await mutateMeetings()
    setSelectedMeetingId(response.data.meetingId)
  }

  const handleSaveMeeting = async () => {
    if (!selectedMeetingId) return
    setActionError(null)

    const payload: UpdateMeeting = {
      title: meetingForm.title.trim(),
      description: meetingForm.description?.trim() || null,
      documentSearchFilter: meetingForm.documentSearchFilter?.trim() || null,
      meetingUrl: meetingForm.meetingUrl?.trim() || null,
    }

    const response = await detailMutation.trigger('PATCH', payload)
    if (response.error) {
      handleMutationError(response.error.detail)
      return
    }

    await refreshSelectedMeetingData()
  }

  const handleStartMeeting = async () => {
    if (!selectedMeetingId) return
    if (!window.confirm(t('meetings.admin.confirmStart'))) return

    setActionError(null)
    const response = await detailMutation.trigger('POST', {}, 'start')
    if (response.error) {
      handleMutationError(response.error.detail)
      return
    }

    await refreshSelectedMeetingData()
  }

  const handlePendingNotesMeeting = async () => {
    if (!selectedMeetingId) return
    if (!window.confirm(t('meetings.admin.confirmPendingNotes'))) return

    setActionError(null)
    const response = await detailMutation.trigger('POST', {}, 'pending-notes')
    if (response.error) {
      handleMutationError(response.error.detail)
      return
    }

    await refreshSelectedMeetingData()
  }

  const handleEndMeeting = async () => {
    if (!selectedMeetingId || !notesFile) return

    setEndMeetingError(null)
    const formData = new FormData()
    formData.append('file', notesFile)

    const response = await endMeetingMutation.trigger('POST', formData, 'end')
    if (response.error) {
      setEndMeetingError(response.error.detail ?? t('common.error'))
      return
    }

    setEndMeetingOpen(false)
    setNotesFile(null)
    await refreshSelectedMeetingData()
  }

  const handleDeleteMeeting = async () => {
    if (!selectedMeetingId) return
    if (!window.confirm(t('meetings.admin.confirmDelete', 'Delete this draft meeting?'))) return

    setActionError(null)
    const response = await detailMutation.trigger('DELETE', {})
    if (response.error) {
      handleMutationError(response.error.detail)
      return
    }

    const currentId = selectedMeetingId
    await mutateMeetings()
    const remainingMeetings = meetings.filter((meeting) => meeting.meetingId !== currentId)
    setSelectedMeetingId(remainingMeetings[0]?.meetingId ?? null)
  }

  const handleAddVoteCounter = async () => {
    if (!selectedVoteCounter) return

    setActionError(null)
    const response = await voteCounterMutation.trigger('POST', { memberId: selectedVoteCounter })
    if (response.error) {
      handleMutationError(response.error.detail)
      return
    }

    setSelectedVoteCounter(null)
    await mutateVoteCounters()
  }

  const handleRemoveVoteCounter = async (memberId: string) => {
    setActionError(null)
    const response = await voteCounterMutation.trigger('DELETE', {}, memberId)
    if (response.error) {
      handleMutationError(response.error.detail)
      return
    }

    await mutateVoteCounters()
  }

  const updateVoteOption = (index: number, value: string) => {
    setNewVoteForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? value : option,
      ),
    }))
  }

  const addVoteOption = () => {
    setNewVoteForm((current) => ({ ...current, options: [...current.options, ''] }))
  }

  const removeVoteOption = (index: number) => {
    setNewVoteForm((current) => ({
      ...current,
      options: current.options.filter((_, optionIndex) => optionIndex !== index),
    }))
  }

  const handleCreateVote = async () => {
    if (!selectedMeetingId) return

    setActionError(null)
    const cleanedOptions = newVoteForm.options.map((option) => option.trim()).filter(Boolean)
    const payload: CreateVote = {
      topic: newVoteForm.topic.trim(),
      description: newVoteForm.description?.trim() || null,
      options: cleanedOptions,
      isMultiSelect: newVoteForm.isMultiSelect,
      maxSelections:
        newVoteForm.isMultiSelect && newVoteForm.maxSelections != null
          ? Number(newVoteForm.maxSelections)
          : null,
    }

    const response = await voteMutation.trigger('POST', payload)
    if (response.error) {
      handleMutationError(response.error.detail)
      return
    }

    setCreateVoteOpen(false)
    setNewVoteForm(emptyVoteForm)
    await mutateVotes()
  }

  const handleOpenVote = async (voteId: string) => {
    if (!window.confirm(t('meetings.admin.confirmOpenVote'))) return

    setActionError(null)
    const response = await voteMutation.trigger('POST', {}, `${voteId}/open`)
    if (response.error) {
      handleMutationError(response.error.detail)
      return
    }

    await mutateVotes()
  }

  const handleCloseVote = async (voteId: string) => {
    if (!window.confirm(t('meetings.admin.confirmCloseVote'))) return

    setActionError(null)
    const response = await voteMutation.trigger('PATCH', {}, `${voteId}/close`)
    if (response.error) {
      handleMutationError(response.error.detail)
      return
    }

    await mutateVotes()
  }

  const handleAbandonVote = async (voteId: string) => {
    if (!window.confirm(t('meetings.admin.confirmAbandonVote'))) return

    setActionError(null)
    const response = await voteMutation.trigger('PATCH', {}, `${voteId}/abandon`)
    if (response.error) {
      handleMutationError(response.error.detail)
      return
    }

    await mutateVotes()
  }

  if (rolesLoading) {
    return null
  }

  if (!isMeetingAdmin) {
    return <Alert severity='error'>{t('error.noAccess')}</Alert>
  }

  return (
    <Stack spacing={3}>
      <Title label={t('meetings.admin.title')}>
        <Button variant='contained' onClick={() => setCreateMeetingOpen(true)}>
          {t('meetings.admin.createMeeting')}
        </Button>
      </Title>

      {actionError && <Alert severity='error'>{actionError}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <RemoteContent isLoading={meetingsLoading} error={meetingsError}>
          <Stack spacing={2}>
            {meetings.length === 0 ? (
              <Alert severity='info'>{t('meetings.admin.noMeetings')}</Alert>
            ) : (
              meetings.map((meeting) => (
                <Card
                  key={meeting.meetingId}
                  variant={meeting.meetingId === selectedMeetingId ? 'elevation' : 'outlined'}
                  sx={{ cursor: 'pointer' }}
                  onClick={() => setSelectedMeetingId(meeting.meetingId)}
                >
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction='row' spacing={1} sx={{ justifyContent: 'space-between' }}>
                        <Typography variant='h6'>{meeting.title}</Typography>
                        <Chip
                          size='small'
                          color={statusColor(meeting.status)}
                          label={t(`meetings.admin.status.${meeting.status}`)}
                        />
                      </Stack>
                      <Typography variant='body2' color='text.secondary'>
                        {t('meetings.admin.attendeeCount', { count: meeting.attendanceCount })}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              ))
            )}
          </Stack>
        </RemoteContent>

        <RemoteContent isLoading={detailLoading} error={detailError}>
          {meetings.length === 0 ? null : !selectedMeetingId || !meetingDetail ? (
            <Alert severity='info'>
              {t('meetings.admin.noMeetingSelected', 'Select a meeting')}
            </Alert>
          ) : (
            <Stack spacing={3}>
              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      sx={{ justifyContent: 'space-between' }}
                    >
                      <Typography variant='h5'>{t('meetings.admin.meetingDetails')}</Typography>
                      <Chip
                        color={statusColor(meetingDetail.status)}
                        label={t(`meetings.admin.status.${meetingDetail.status}`)}
                      />
                    </Stack>

                    <TextField
                      label={t('common.name')}
                      value={meetingForm.title}
                      onChange={(event) =>
                        setMeetingForm((current) => ({ ...current, title: event.target.value }))
                      }
                      disabled={meetingDetail.status !== 'DRAFT'}
                      fullWidth
                    />
                    <TextField
                      label={t('common.description')}
                      value={meetingForm.description ?? ''}
                      onChange={(event) =>
                        setMeetingForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      disabled={meetingDetail.status !== 'DRAFT'}
                      multiline
                      minRows={3}
                      fullWidth
                    />
                    <DocumentFilterField
                      value={meetingForm.documentSearchFilter ?? ''}
                      onChange={(value) =>
                        setMeetingForm((current) => ({
                          ...current,
                          documentSearchFilter: value,
                        }))
                      }
                      disabled={meetingDetail.status !== 'DRAFT'}
                    />
                    <TextField
                      label={t('meetings.admin.meetingUrl')}
                      value={meetingForm.meetingUrl ?? ''}
                      onChange={(event) =>
                        setMeetingForm((current) => ({
                          ...current,
                          meetingUrl: event.target.value,
                        }))
                      }
                      placeholder='https://'
                      fullWidth
                    />

                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      sx={{ flexWrap: 'wrap' }}
                    >
                      {meetingDetail.status === 'DRAFT' && (
                        <>
                          <Button variant='contained' onClick={handleSaveMeeting}>
                            {t('common.save')}
                          </Button>
                          <Button variant='contained' color='success' onClick={handleStartMeeting}>
                            {t('meetings.admin.startMeeting')}
                          </Button>
                          <Button variant='outlined' color='error' onClick={handleDeleteMeeting}>
                            {t('meetings.admin.deleteMeeting', 'Delete Meeting')}
                          </Button>
                        </>
                      )}
                      {(meetingDetail.status === 'ONGOING' ||
                        meetingDetail.status === 'PENDING_NOTES') && (
                        <Button variant='outlined' onClick={handleSaveMeeting}>
                          {t('common.save')}
                        </Button>
                      )}
                      {meetingDetail.status === 'ONGOING' && (
                        <Button
                          variant='contained'
                          color='info'
                          onClick={handlePendingNotesMeeting}
                        >
                          {t('meetings.admin.pendingNotes')}
                        </Button>
                      )}
                      {meetingDetail.status === 'PENDING_NOTES' && (
                        <Button
                          variant='contained'
                          color='warning'
                          onClick={() => setEndMeetingOpen(true)}
                        >
                          {t('meetings.admin.endMeeting')}
                        </Button>
                      )}
                      {meetingDetail.status === 'ENDED' && meetingDetail.meetingNotesDocumentId && (
                        <Button
                          variant='outlined'
                          startIcon={<Icon icon='mdi:file-document-outline' />}
                          onClick={() =>
                            window.open(
                              `/club/documents?search=${encodeURIComponent(meetingDetail.meetingId)}`,
                              '_blank',
                              'noopener,noreferrer',
                            )
                          }
                        >
                          {t('meetings.admin.viewMeetingNotes')}
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant='h6'>{t('meetings.admin.attendees')}</Typography>
                    <Typography variant='body2' color='text.secondary'>
                      {t('meetings.admin.attendeeCount', { count: attendeeCount })}
                    </Typography>
                    <RemoteContent isLoading={attendeesLoading} error={attendeesError}>
                      <Stack spacing={1}>
                        {(attendeesData?.attendees ?? []).length === 0 ? (
                          <Typography color='text.secondary'>
                            {t('meetings.admin.noAttendees', 'No attendees yet.')}
                          </Typography>
                        ) : (
                          attendeesData?.attendees.map((attendee) => (
                            <Typography key={attendee.memberId}>
                              {attendee.firstName} {attendee.lastName}
                            </Typography>
                          ))
                        )}
                      </Stack>
                    </RemoteContent>
                  </Stack>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant='h6'>{t('meetings.admin.voteCounters')}</Typography>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      sx={{ alignItems: 'center' }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <SelectMember
                          value={selectedVoteCounter}
                          onChange={(member) => setSelectedVoteCounter(member?.id ?? null)}
                          label={t('meetings.admin.addVoteCounter')}
                          exclude={excludedVoteCounterIds}
                          memberType={eligibleMemberTypes}
                        />
                      </Box>
                      <Button
                        variant='contained'
                        onClick={handleAddVoteCounter}
                        disabled={!selectedVoteCounter}
                      >
                        {t('meetings.admin.addVoteCounter')}
                      </Button>
                    </Stack>

                    <RemoteContent isLoading={voteCountersLoading} error={voteCountersError}>
                      <Stack spacing={1}>
                        {voteCounters.length === 0 ? (
                          <Typography color='text.secondary'>
                            {t('meetings.admin.noVoteCounters', 'No vote counters assigned.')}
                          </Typography>
                        ) : (
                          voteCounters.map((voteCounter) => (
                            <Stack
                              key={voteCounter.memberId}
                              direction='row'
                              spacing={1}
                              sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                            >
                              <Typography>
                                {voteCounter.firstName} {voteCounter.lastName}
                              </Typography>
                              <Button
                                color='error'
                                onClick={() => handleRemoveVoteCounter(voteCounter.memberId)}
                              >
                                {t('meetings.admin.removeVoteCounter')}
                              </Button>
                            </Stack>
                          ))
                        )}
                      </Stack>
                    </RemoteContent>
                  </Stack>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      sx={{ justifyContent: 'space-between' }}
                    >
                      <Typography variant='h6'>{t('meetings.votes.title')}</Typography>
                      {meetingDetail.status === 'ONGOING' && (
                        <Button variant='contained' onClick={() => setCreateVoteOpen(true)}>
                          {t('meetings.admin.createVote')}
                        </Button>
                      )}
                    </Stack>

                    <RemoteContent isLoading={votesLoading} error={votesError}>
                      <Stack spacing={2}>
                        {votes.length === 0 ? (
                          <Typography color='text.secondary'>
                            {t('meetings.admin.noVotes', 'No votes created yet.')}
                          </Typography>
                        ) : (
                          votes.map((vote) => {
                            const resultsVisible = vote.totalVotes != null

                            return (
                              <Card key={vote.voteId} variant='outlined'>
                                <CardContent>
                                  <Stack spacing={2}>
                                    <Stack
                                      direction={{ xs: 'column', sm: 'row' }}
                                      spacing={1}
                                      sx={{ justifyContent: 'space-between' }}
                                    >
                                      <Box>
                                        <Typography variant='h6'>{vote.topic}</Typography>
                                        {vote.description && (
                                          <Typography color='text.secondary'>
                                            {vote.description}
                                          </Typography>
                                        )}
                                      </Box>
                                      <Chip
                                        size='small'
                                        color={voteStatusColor(vote.status)}
                                        label={t(`meetings.admin.voteStatus.${vote.status}`)}
                                      />
                                    </Stack>

                                    <Typography variant='body2' color='text.secondary'>
                                      {vote.isMultiSelect
                                        ? vote.maxSelections
                                          ? t('meetings.votes.selectMultiple', {
                                              max: vote.maxSelections,
                                            })
                                          : t('meetings.votes.selectMultipleUnlimited')
                                        : t('meetings.votes.selectOne')}
                                    </Typography>

                                    <Stack spacing={1}>
                                      {vote.options.map((option) => (
                                        <Stack
                                          key={option.optionId}
                                          direction='row'
                                          spacing={1}
                                          sx={{ justifyContent: 'space-between' }}
                                        >
                                          <Typography>{option.optionText}</Typography>
                                          {resultsVisible && (
                                            <Typography color='text.secondary'>
                                              {option.voteCount ?? 0}
                                            </Typography>
                                          )}
                                        </Stack>
                                      ))}
                                    </Stack>

                                    {resultsVisible && (
                                      <Typography variant='body2' color='text.secondary'>
                                        {t('meetings.votes.totalVotes')}: {vote.totalVotes ?? 0}
                                      </Typography>
                                    )}

                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                      {vote.status === 'DRAFT' && (
                                        <Button
                                          variant='contained'
                                          onClick={() => handleOpenVote(vote.voteId)}
                                        >
                                          {t('meetings.admin.openVote')}
                                        </Button>
                                      )}
                                      {vote.status === 'OPEN' && (
                                        <Button
                                          variant='contained'
                                          color='warning'
                                          onClick={() => handleCloseVote(vote.voteId)}
                                        >
                                          {t('meetings.admin.closeVote')}
                                        </Button>
                                      )}
                                      {vote.status === 'OPEN' && (
                                        <Button
                                          variant='outlined'
                                          color='error'
                                          onClick={() => handleAbandonVote(vote.voteId)}
                                        >
                                          {t('meetings.admin.abandonVote')}
                                        </Button>
                                      )}
                                    </Stack>
                                  </Stack>
                                </CardContent>
                              </Card>
                            )
                          })
                        )}
                      </Stack>
                    </RemoteContent>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          )}
        </RemoteContent>
      </Box>

      <Dialog
        open={createMeetingOpen}
        onClose={() => setCreateMeetingOpen(false)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>{t('meetings.admin.createMeeting')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t('common.name')}
              value={newMeetingForm.title}
              onChange={(event) =>
                setNewMeetingForm((current) => ({ ...current, title: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label={t('common.description')}
              value={newMeetingForm.description ?? ''}
              onChange={(event) =>
                setNewMeetingForm((current) => ({ ...current, description: event.target.value }))
              }
              multiline
              minRows={3}
              fullWidth
            />
            <DocumentFilterField
              value={newMeetingForm.documentSearchFilter ?? ''}
              onChange={(value) =>
                setNewMeetingForm((current) => ({
                  ...current,
                  documentSearchFilter: value,
                }))
              }
            />
            <TextField
              label={t('meetings.admin.meetingUrl')}
              value={newMeetingForm.meetingUrl ?? ''}
              onChange={(event) =>
                setNewMeetingForm((current) => ({
                  ...current,
                  meetingUrl: event.target.value,
                }))
              }
              placeholder='https://'
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateMeetingOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant='contained'
            onClick={handleCreateMeeting}
            disabled={!newMeetingForm.title.trim()}
          >
            {t('meetings.admin.createMeeting')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={createVoteOpen}
        onClose={() => setCreateVoteOpen(false)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>{t('meetings.admin.createVote')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t('meetings.admin.voteTopic', 'Topic')}
              value={newVoteForm.topic}
              onChange={(event) =>
                setNewVoteForm((current) => ({ ...current, topic: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label={t('common.description')}
              value={newVoteForm.description ?? ''}
              onChange={(event) =>
                setNewVoteForm((current) => ({ ...current, description: event.target.value }))
              }
              multiline
              minRows={3}
              fullWidth
            />

            <Stack spacing={1}>
              <Typography variant='subtitle1'>{t('meetings.admin.options')}</Typography>
              {newVoteForm.options.map((option, index) => (
                <Stack key={index} direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                  <TextField
                    label={`${t('meetings.admin.options')} ${index + 1}`}
                    value={option}
                    onChange={(event) => updateVoteOption(index, event.target.value)}
                    fullWidth
                  />
                  <IconButton
                    color='error'
                    onClick={() => removeVoteOption(index)}
                    disabled={newVoteForm.options.length <= 2}
                  >
                    <Icon icon='mdi:delete' />
                  </IconButton>
                </Stack>
              ))}
              <Button variant='outlined' onClick={addVoteOption}>
                {t('meetings.admin.addOption')}
              </Button>
            </Stack>

            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              <Typography>{t('meetings.admin.isMultiSelect')}</Typography>
              <Switch
                checked={newVoteForm.isMultiSelect}
                onChange={(event) =>
                  setNewVoteForm((current) => ({
                    ...current,
                    isMultiSelect: event.target.checked,
                    maxSelections: event.target.checked ? current.maxSelections : null,
                  }))
                }
              />
            </Stack>

            {newVoteForm.isMultiSelect && (
              <TextField
                label={t('meetings.admin.maxSelections')}
                type='number'
                value={newVoteForm.maxSelections ?? ''}
                onChange={(event) =>
                  setNewVoteForm((current) => ({
                    ...current,
                    maxSelections: event.target.value ? Number(event.target.value) : null,
                  }))
                }
                slotProps={{ htmlInput: { min: 1 } }}
                fullWidth
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateVoteOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant='contained'
            onClick={handleCreateVote}
            disabled={
              !newVoteForm.topic.trim() ||
              newVoteForm.options.filter((option) => option.trim()).length < 2
            }
          >
            {t('meetings.admin.createVote')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={endMeetingOpen}
        onClose={() => {
          setEndMeetingOpen(false)
          setNotesFile(null)
          setEndMeetingError(null)
        }}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>{t('meetings.admin.endMeeting')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity='warning'>{t('meetings.admin.confirmEnd')}</Alert>
            {endMeetingError && <Alert severity='error'>{endMeetingError}</Alert>}
            <Typography variant='body2' color='text.secondary'>
              {t('meetings.admin.endMeetingNotesHelp')}
            </Typography>
            <Button
              component='label'
              variant='outlined'
              startIcon={<Icon icon='mdi:file-upload-outline' />}
            >
              {notesFile ? notesFile.name : t('meetings.admin.selectNotesFile')}
              <input
                type='file'
                hidden
                accept='.pdf,.doc,.docx,.txt'
                onChange={(event) => setNotesFile(event.target.files?.[0] ?? null)}
              />
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setEndMeetingOpen(false)
              setNotesFile(null)
              setEndMeetingError(null)
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant='contained'
            color='warning'
            onClick={handleEndMeeting}
            disabled={!notesFile || endMeetingMutation.isMutating}
          >
            {t('meetings.admin.endMeeting')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

export default MeetingsAdminPage
