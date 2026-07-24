import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { MIKPermissions } from '@backend/routes/members/models'
import type { Meeting, MeetingVote, MeetingVotesResponse } from '@backend/routes/meetings/models'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import useApi from '../../hooks/useApi'
import { useRoles } from '../../hooks/useRoles'

const MeetingPage = () => {
  const { t } = useTranslation()
  const { hasAccess } = useRoles()
  const [selectionByVote, setSelectionByVote] = useState<Record<string, string[]>>({})
  const [voteErrors, setVoteErrors] = useState<Record<string, string | null>>({})

  const canAccess = hasAccess(MIKPermissions.MEETING_USER, MIKPermissions.MEETING_ADMIN)

  const {
    data: activeMeeting,
    isLoading: meetingLoading,
    error: meetingError,
    mutate: mutateMeeting,
  } = useApi<Meeting | null>(
    {
      url: 'v1/meetings/active',
    },
    {
      refreshInterval: 5000,
    },
  )

  const meetingId = activeMeeting?.meetingId
  const isAttending = activeMeeting?.isAttending ?? false

  const {
    data: votesData,
    isLoading: votesLoading,
    error: votesError,
    mutate: mutateVotes,
  } = useApi<MeetingVotesResponse>(
    {
      url: `v1/meetings/${meetingId ?? 'active'}/votes`,
      skipFetch: !meetingId || !isAttending,
    },
    {
      refreshInterval: 5000,
    },
  )

  const { mutation: attendMutation } = useApi<Meeting>({
    url: `v1/meetings/${meetingId ?? 'active'}/attend`,
    skipFetch: true,
  })

  const { mutation: submitVoteMutation } = useApi<MeetingVote>({
    url: `v1/meetings/${meetingId ?? 'active'}/votes`,
    skipFetch: true,
  })

  const openVotes = useMemo(
    () => (votesData?.votes ?? []).filter((vote) => vote.status === 'OPEN'),
    [votesData?.votes],
  )

  const handleAttend = async () => {
    if (!meetingId) return

    const response = await attendMutation.trigger('POST', {})
    if (response.error) {
      return
    }

    await mutateMeeting()
    await mutateVotes()
  }

  const setSingleSelection = (voteId: string, optionId: string) => {
    setSelectionByVote((current) => ({ ...current, [voteId]: [optionId] }))
    setVoteErrors((current) => ({ ...current, [voteId]: null }))
  }

  const toggleMultiSelection = (vote: MeetingVote, optionId: string, checked: boolean) => {
    setSelectionByVote((current) => {
      const existing = current[vote.voteId] ?? []
      const next = checked ? [...existing, optionId] : existing.filter((id) => id !== optionId)
      return { ...current, [vote.voteId]: Array.from(new Set(next)) }
    })
    setVoteErrors((current) => ({ ...current, [vote.voteId]: null }))
  }

  const getSelectionError = (vote: MeetingVote, optionIds: string[]) => {
    if (!optionIds.length) {
      return t('meetings.votes.selectOne')
    }

    if (!vote.isMultiSelect && optionIds.length !== 1) {
      return t('meetings.votes.selectOne')
    }

    if (vote.isMultiSelect && vote.maxSelections != null && optionIds.length > vote.maxSelections) {
      return t('meetings.votes.selectMultiple', { max: vote.maxSelections })
    }

    return null
  }

  const handleSubmitVote = async (vote: MeetingVote) => {
    if (!meetingId) return

    const optionIds = selectionByVote[vote.voteId] ?? []
    const validationError = getSelectionError(vote, optionIds)
    if (validationError) {
      setVoteErrors((current) => ({ ...current, [vote.voteId]: validationError }))
      return
    }

    const response = await submitVoteMutation.trigger(
      'POST',
      { optionIds },
      `${vote.voteId}/submit`,
    )
    if (response.error) {
      setVoteErrors((current) => ({
        ...current,
        [vote.voteId]: response.error?.detail ?? t('common.error'),
      }))
      return
    }

    setVoteErrors((current) => ({ ...current, [vote.voteId]: null }))
    await mutateVotes()
  }

  const getVoteHelpText = (vote: MeetingVote) => {
    if (!vote.isMultiSelect) {
      return t('meetings.votes.selectOne')
    }

    if (vote.maxSelections != null) {
      return t('meetings.votes.selectMultiple', { max: vote.maxSelections })
    }

    return t('meetings.votes.selectMultipleUnlimited')
  }

  if (!canAccess) {
    return <Alert severity='error'>{t('error.noAccess')}</Alert>
  }

  return (
    <Stack spacing={3}>
      <Title label={t('meetings.title')} />

      <RemoteContent isLoading={meetingLoading} error={meetingError}>
        {!activeMeeting ? (
          <Alert severity='info'>{t('meetings.noActiveMeeting')}</Alert>
        ) : (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant='overline'>{t('meetings.ongoingMeeting')}</Typography>
                  <Typography variant='h5'>{activeMeeting.title}</Typography>
                  {activeMeeting.description && (
                    <Typography color='text.secondary' sx={{ mt: 1 }}>
                      {activeMeeting.description}
                    </Typography>
                  )}
                </Box>

                {activeMeeting.documentSearchFilter && (
                  <Box>
                    <Button
                      component={RouterLink}
                      to={`/club/documents?search=${encodeURIComponent(activeMeeting.documentSearchFilter)}`}
                      variant='outlined'
                    >
                      {t('meetings.documents', 'Open related documents')}
                    </Button>
                  </Box>
                )}

                {!activeMeeting.isAttending ? (
                  <Box>
                    <Button
                      variant='contained'
                      onClick={handleAttend}
                      disabled={attendMutation.isMutating}
                    >
                      {t('meetings.attend')}
                    </Button>
                  </Box>
                ) : (
                  <Alert severity='success'>{t('meetings.attending')}</Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}
      </RemoteContent>

      {activeMeeting?.isAttending && (
        <RemoteContent isLoading={votesLoading} error={votesError}>
          <Stack spacing={2}>
            <Typography variant='h5'>{t('meetings.votes.title')}</Typography>
            {openVotes.length === 0 ? (
              <Alert severity='info'>{t('meetings.votes.noOpenVotes')}</Alert>
            ) : (
              openVotes.map((vote) => {
                const selectedOptionIds = selectionByVote[vote.voteId] ?? []
                const voteError = voteErrors[vote.voteId]
                const resultsVisible = vote.totalVotes != null

                return (
                  <Card key={vote.voteId}>
                    <CardContent>
                      <Stack spacing={2}>
                        <Box>
                          <Typography variant='h6'>{vote.topic}</Typography>
                          {vote.description && (
                            <Typography color='text.secondary'>{vote.description}</Typography>
                          )}
                        </Box>

                        <FormControl error={Boolean(voteError)} disabled={vote.hasVoted}>
                          <FormHelperText sx={{ mb: 1 }}>{getVoteHelpText(vote)}</FormHelperText>

                          {!vote.isMultiSelect ? (
                            <RadioGroup
                              value={selectedOptionIds[0] ?? ''}
                              onChange={(event) =>
                                setSingleSelection(vote.voteId, event.target.value)
                              }
                            >
                              {vote.options.map((option) => (
                                <FormControlLabel
                                  key={option.optionId}
                                  value={option.optionId}
                                  control={<Radio />}
                                  label={
                                    <Stack
                                      direction='row'
                                      spacing={1}
                                      sx={{ alignItems: 'center' }}
                                    >
                                      <span>{option.optionText}</span>
                                      {resultsVisible && (
                                        <Typography variant='body2' color='text.secondary'>
                                          ({option.voteCount ?? 0})
                                        </Typography>
                                      )}
                                    </Stack>
                                  }
                                />
                              ))}
                            </RadioGroup>
                          ) : (
                            <Stack>
                              {vote.options.map((option) => {
                                const checked = selectedOptionIds.includes(option.optionId)
                                const maxReached =
                                  vote.maxSelections != null &&
                                  selectedOptionIds.length >= vote.maxSelections &&
                                  !checked

                                return (
                                  <FormControlLabel
                                    key={option.optionId}
                                    control={
                                      <Checkbox
                                        checked={checked}
                                        disabled={maxReached}
                                        onChange={(event) =>
                                          toggleMultiSelection(
                                            vote,
                                            option.optionId,
                                            event.target.checked,
                                          )
                                        }
                                      />
                                    }
                                    label={
                                      <Stack
                                        direction='row'
                                        spacing={1}
                                        sx={{ alignItems: 'center' }}
                                      >
                                        <span>{option.optionText}</span>
                                        {resultsVisible && (
                                          <Typography variant='body2' color='text.secondary'>
                                            ({option.voteCount ?? 0})
                                          </Typography>
                                        )}
                                      </Stack>
                                    }
                                  />
                                )
                              })}
                            </Stack>
                          )}

                          {voteError && <FormHelperText>{voteError}</FormHelperText>}
                        </FormControl>

                        {vote.hasVoted ? (
                          <Alert severity='success'>{t('meetings.votes.submitted')}</Alert>
                        ) : (
                          <Button
                            variant='contained'
                            onClick={() => handleSubmitVote(vote)}
                            disabled={submitVoteMutation.isMutating}
                          >
                            {t('meetings.votes.submit')}
                          </Button>
                        )}

                        {resultsVisible && (
                          <Typography variant='body2' color='text.secondary'>
                            {t('meetings.votes.totalVotes')}: {vote.totalVotes ?? 0}
                          </Typography>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </Stack>
        </RemoteContent>
      )}
    </Stack>
  )
}

export default MeetingPage
