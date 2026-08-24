import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { Title } from '@mik/ui/components/Title'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { MarkdownContent } from '@mik/ui/components/MarkdownContent'
import useApi from '../../hooks/useApi'
import { useTranslation } from 'react-i18next'
import type { SyllabusFlight, SyllabusFlightAttempt, HilEntry } from '@mik/contracts/dto'
import type { MemberSyllabusDetail } from '@mik/ui/api/dtoApi'

export default function DtoMyTrainingPage() {
  const { t } = useTranslation()

  const {
    data: assignment,
    isLoading: assignmentLoading,
    error: assignmentError,
  } = useApi<MemberSyllabusDetail | null>({ url: 'v1/dto/me/syllabus' })

  const memberSyllabusId = assignment?.memberSyllabusId
  const memberId = assignment?.memberId

  const {
    data: attempts,
    isLoading: attemptsLoading,
    error: attemptsError,
  } = useApi<SyllabusFlightAttempt[]>(
    {
      url: memberSyllabusId ? `v1/dto/member-syllabus/${memberSyllabusId}/attempts` : undefined,
      skipFetch: !memberSyllabusId,
    },
    {},
  )

  const {
    data: hilItems,
    isLoading: hilLoading,
    error: hilError,
  } = useApi<HilEntry[]>(
    {
      url: memberId ? `v1/dto/members/${memberId}/hil` : undefined,
      skipFetch: !memberId,
    },
    {},
  )

  const isLoading = assignmentLoading || attemptsLoading || hilLoading
  const error = assignmentError || attemptsError || hilError

  if (!isLoading && !error && !assignment) {
    return (
      <Box>
        <Title label={t('dto.myTraining.title')} />
        <Alert severity='info'>{t('dto.myTraining.noActiveSyllabus')}</Alert>
      </Box>
    )
  }

  const flights: SyllabusFlight[] = assignment?.syllabusDetail?.flights ?? []

  // Build a map of approved attempts per syllabus flight
  const approvedByFlight = new Map<string, SyllabusFlightAttempt>()
  for (const a of attempts ?? []) {
    if (a.verificationResult === 'APPROVED') {
      approvedByFlight.set(a.syllabusFlightId, a)
    }
  }

  const completedFlights = flights.filter((f) => approvedByFlight.has(f.flightId)).length
  const totalFlights = flights.length
  const pct = totalFlights > 0 ? Math.round((completedFlights / totalFlights) * 100) : 0

  const interimFlight = flights.find((f) => f.isInterimCheckpoint)
  const interimCompleted = interimFlight != null && approvedByFlight.has(interimFlight.flightId)

  return (
    <Box>
      <Title label={t('dto.myTraining.title')} />
      <RemoteContent isLoading={isLoading} error={error}>
        {assignment && (
          <Stack spacing={3}>
            {/* Syllabus header */}
            <Paper variant='outlined' sx={{ p: 2 }}>
              <Typography variant='h6' gutterBottom>
                {t('dto.myTraining.activeSyllabus')}
              </Typography>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('dto.myTraining.version')}: v{assignment.syllabusDetail?.version}
              </Typography>

              {assignment.syllabusDetail?.descriptionHtml && (
                <Box sx={{ mt: 1.5 }}>
                  <MarkdownContent html={assignment.syllabusDetail.descriptionHtml} />
                </Box>
              )}
              {assignment.syllabusDetail?.generalInformationHtml && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant='overline' color='text.secondary'>
                    {t('dto.myTraining.generalInformation')}
                  </Typography>
                  <MarkdownContent html={assignment.syllabusDetail.generalInformationHtml} />
                </Box>
              )}
              {assignment.syllabusDetail?.requirementsExperienceCreditHtml && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant='overline' color='text.secondary'>
                    {t('dto.myTraining.requirementsExperienceCredit')}
                  </Typography>
                  <MarkdownContent
                    html={assignment.syllabusDetail.requirementsExperienceCreditHtml}
                  />
                </Box>
              )}

              {/* Overall progress */}
              <Box
                sx={{
                  mt: 2,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    mb: 0.5,
                  }}
                >
                  <Typography variant='body2'>{t('dto.myTraining.progress')}</Typography>
                  <Typography variant='body2'>
                    {completedFlights}/{totalFlights}
                  </Typography>
                </Box>
                <LinearProgress
                  variant='determinate'
                  value={pct}
                  sx={{ height: 10, borderRadius: 1 }}
                />
              </Box>

              {interimFlight && (
                <Box
                  sx={{
                    mt: 1.5,
                  }}
                >
                  {interimCompleted ? (
                    <Chip
                      size='small'
                      icon={<Icon icon='mdi:check-circle' />}
                      label={t('dto.myTraining.interimPassed')}
                      color='success'
                    />
                  ) : (
                    <Chip
                      size='small'
                      icon={<Icon icon='mdi:clock-outline' />}
                      label={t('dto.myTraining.interimPending')}
                    />
                  )}
                </Box>
              )}
            </Paper>

            {/* HIL items */}
            {(hilItems?.length ?? 0) > 0 && (
              <Paper variant='outlined' sx={{ p: 2 }}>
                <Typography
                  variant='subtitle1'
                  gutterBottom
                  sx={{
                    fontWeight: 'bold',
                  }}
                >
                  {t('dto.myTraining.hilItems')}
                </Typography>
                <Stack spacing={1}>
                  {hilItems!.map((h) => {
                    const item = flights
                      .flatMap((f) => f.items ?? [])
                      .find((i) => i.itemId === h.itemId)
                    return (
                      <Box
                        key={h.hilId}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                        }}
                      >
                        <Icon icon='mdi:alert-circle-outline' color='warning' width={18} />
                        <Typography variant='body2'>{item?.name ?? h.itemId}</Typography>
                      </Box>
                    )
                  })}
                </Stack>
              </Paper>
            )}

            {/* Flight list */}
            <Paper variant='outlined'>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('dto.myTraining.flightCode')}</TableCell>
                    <TableCell>{t('dto.myTraining.flightName')}</TableCell>
                    <TableCell>{t('dto.myTraining.tags')}</TableCell>
                    <TableCell>{t('dto.myTraining.status')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {flights.map((f) => {
                    const approvedAttempt = approvedByFlight.get(f.flightId)
                    const approved = approvedAttempt != null
                    const needsReverification =
                      approved && approvedAttempt?.requiresReverification === true
                    const attempted = (attempts ?? []).some(
                      (a) => a.syllabusFlightId === f.flightId,
                    )
                    return (
                      <TableRow key={f.flightId}>
                        <TableCell>
                          <Typography
                            variant='body2'
                            sx={{
                              fontWeight: 'bold',
                            }}
                          >
                            {f.code}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                            }}
                          >
                            {f.isInterimCheckpoint && <Icon icon='mdi:flag-checkered' width={16} />}
                            {f.name}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Stack
                            direction='row'
                            spacing={0.5}
                            sx={{
                              flexWrap: 'wrap',
                            }}
                          >
                            {f.tags.map((tag) => (
                              <Chip key={tag} label={tag} size='small' variant='outlined' />
                            ))}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          {needsReverification ? (
                            <Chip
                              size='small'
                              icon={<Icon icon='mdi:alert' />}
                              label={t('dto.myTraining.requiresReverification')}
                              color='warning'
                            />
                          ) : approved ? (
                            <Chip
                              size='small'
                              icon={<Icon icon='mdi:check-circle' />}
                              label={t('dto.myTraining.statusCompleted')}
                              color='success'
                            />
                          ) : attempted ? (
                            <Chip
                              size='small'
                              icon={<Icon icon='mdi:clock-outline' />}
                              label={t('dto.myTraining.statusPending')}
                              color='warning'
                            />
                          ) : (
                            <Chip size='small' label={t('dto.myTraining.statusNotStarted')} />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Paper>
          </Stack>
        )}
      </RemoteContent>
    </Box>
  )
}
