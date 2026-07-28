import {
  Alert,
  Box,
  Breadcrumbs,
  Chip,
  Divider,
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
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Title } from '../../components/Title'
import { RemoteContent } from '../../components/RemoteContent'
import { MarkdownContent } from '../../components/MarkdownContent'
import useApi from '../../hooks/useApi'
import type { SyllabusFlight } from '@backend/routes/dto/models'
import type { StudentProgressDetail, AttemptWithOutcomes } from './dtoApi'

function flightStatus(
  flight: SyllabusFlight,
  attempts: AttemptWithOutcomes[],
): 'approved' | 'needs_reverification' | 'failed' | 'pending' | 'not_flown' {
  const flightAttempts = attempts.filter((a) => a.syllabusFlightId === flight.flightId)
  if (flightAttempts.some((a) => a.verificationResult === 'APPROVED' && a.requiresReverification))
    return 'needs_reverification'
  if (flightAttempts.some((a) => a.verificationResult === 'APPROVED')) return 'approved'
  if (flightAttempts.some((a) => a.verificationResult === 'FAILED')) return 'failed'
  if (flightAttempts.some((a) => a.verificationResult === null)) return 'pending'
  return 'not_flown'
}

function StatusChip({ status }: { status: ReturnType<typeof flightStatus> }) {
  const { t } = useTranslation()
  switch (status) {
    case 'approved':
      return (
        <Chip
          size='small'
          icon={<Icon icon='mdi:check-circle' />}
          label={t('dto.detail.approved')}
          color='success'
        />
      )
    case 'needs_reverification':
      return (
        <Chip
          size='small'
          icon={<Icon icon='mdi:alert' />}
          label={t('dto.detail.requiresReverification')}
          color='warning'
        />
      )
    case 'failed':
      return (
        <Chip
          size='small'
          icon={<Icon icon='mdi:close-circle' />}
          label={t('dto.detail.failed')}
          color='error'
        />
      )
    case 'pending':
      return (
        <Chip
          size='small'
          icon={<Icon icon='mdi:clock-outline' />}
          label={t('dto.detail.pendingVerification')}
          color='warning'
        />
      )
    default:
      return <Chip size='small' label={t('dto.detail.notFlown')} />
  }
}

export default function DtoStudentDetailPage() {
  const { memberSyllabusId } = useParams<{ memberSyllabusId: string }>()
  const { t } = useTranslation()

  const { data, isLoading, error } = useApi<StudentProgressDetail>({
    url: memberSyllabusId ? `v1/dto/member-syllabus/${memberSyllabusId}/detail` : undefined,
    skipFetch: !memberSyllabusId,
  })

  const flights: SyllabusFlight[] = data?.memberSyllabus?.syllabusDetail?.flights ?? []
  const attempts = data?.attemptsWithOutcomes ?? []
  const hilItems = data?.hilItems ?? []

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 1 }}>
        <Link to='/dto/progress' style={{ color: 'inherit', textDecoration: 'underline' }}>
          {t('dto.progress.title')}
        </Link>
        <Typography
          sx={{
            color: 'text.primary',
          }}
        >
          {data?.memberSyllabus?.memberName ?? '…'}
        </Typography>
      </Breadcrumbs>
      <Title label={data?.memberSyllabus?.memberName ?? t('dto.detail.title')} />
      <RemoteContent isLoading={isLoading} error={error}>
        {data && (
          <Stack spacing={3}>
            {/* Syllabus info */}
            <Paper variant='outlined' sx={{ p: 2 }}>
              <Typography variant='subtitle2' color='text.secondary'>
                v{data.memberSyllabus.syllabusDetail?.version}
              </Typography>
              {data.memberSyllabus.syllabusDetail?.descriptionHtml && (
                <Box sx={{ mt: 1 }}>
                  <MarkdownContent html={data.memberSyllabus.syllabusDetail.descriptionHtml} />
                </Box>
              )}
            </Paper>

            {/* HIL items */}
            {hilItems.length > 0 && (
              <Paper variant='outlined' sx={{ p: 2 }}>
                <Typography
                  variant='subtitle1'
                  gutterBottom
                  sx={{
                    fontWeight: 'bold',
                  }}
                >
                  {t('dto.detail.hilItems')}
                </Typography>
                <Stack spacing={0.5}>
                  {hilItems.map((h) => {
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
                        <Icon icon='mdi:alert-circle-outline' width={18} color='orange' />
                        <Typography variant='body2'>{item?.name ?? h.itemId}</Typography>
                      </Box>
                    )
                  })}
                </Stack>
              </Paper>
            )}

            {/* Per-flight breakdown */}
            {flights.length === 0 ? (
              <Alert severity='info'>{t('dto.detail.noFlights')}</Alert>
            ) : (
              <Stack spacing={2}>
                {flights.map((flight) => {
                  const status = flightStatus(flight, attempts)
                  const approvedAttempt = attempts.find(
                    (a) =>
                      a.syllabusFlightId === flight.flightId && a.verificationResult === 'APPROVED',
                  )
                  const latestAttempt = attempts.find((a) => a.syllabusFlightId === flight.flightId)
                  const displayAttempt = approvedAttempt ?? latestAttempt

                  return (
                    <Paper key={flight.flightId} variant='outlined' sx={{ p: 2 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          mb: 1,
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          {flight.isInterimCheckpoint && (
                            <Icon icon='mdi:flag-checkered' width={18} color='primary' />
                          )}
                          <Typography
                            variant='subtitle2'
                            sx={{
                              fontWeight: 'bold',
                            }}
                          >
                            {flight.code} — {flight.name}
                          </Typography>
                        </Box>
                        <StatusChip status={status} />
                      </Box>
                      {displayAttempt && displayAttempt.itemOutcomes.length > 0 && (
                        <>
                          <Divider sx={{ my: 1 }} />
                          <Table size='small'>
                            <TableHead>
                              <TableRow>
                                <TableCell>{t('dto.detail.item')}</TableCell>
                                <TableCell>{t('dto.detail.outcome')}</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {displayAttempt.itemOutcomes.map((o) => {
                                const item = flight.items?.find((i) => i.itemId === o.itemId)
                                return (
                                  <TableRow key={o.itemId}>
                                    <TableCell>{item?.name ?? o.itemId}</TableCell>
                                    <TableCell>
                                      {o.outcome === 'COMPLETED' && (
                                        <Chip
                                          size='small'
                                          icon={<Icon icon='mdi:check' />}
                                          label={t('dto.detail.completed')}
                                          color='success'
                                        />
                                      )}
                                      {o.outcome === 'FAILED' && (
                                        <Chip
                                          size='small'
                                          icon={<Icon icon='mdi:close' />}
                                          label={t('dto.detail.failed')}
                                          color='error'
                                        />
                                      )}
                                      {o.outcome === 'MOVED_TO_HIL' && (
                                        <Chip
                                          size='small'
                                          icon={<Icon icon='mdi:alert-circle-outline' />}
                                          label={t('dto.detail.hil')}
                                          color='warning'
                                        />
                                      )}
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </>
                      )}
                      {displayAttempt?.instructorComments && (
                        <Typography
                          variant='body2'
                          sx={{
                            color: 'text.secondary',
                            mt: 1,
                          }}
                        >
                          {t('dto.detail.comments')}: {displayAttempt.instructorComments}
                        </Typography>
                      )}
                      {displayAttempt?.verifiedAt && (
                        <Typography
                          variant='caption'
                          sx={{
                            color: 'text.secondary',
                            display: 'block',
                            mt: 0.5,
                          }}
                        >
                          {t('dto.detail.verifiedBy', {
                            name: displayAttempt.verifierName ?? displayAttempt.verifiedBy,
                            date: displayAttempt.verifiedAt.substring(0, 10),
                          })}
                        </Typography>
                      )}
                      {displayAttempt && (
                        <Box
                          sx={{
                            display: 'flex',
                            gap: 2,
                            flexWrap: 'wrap',
                            mt: 1,
                            alignItems: 'center',
                          }}
                        >
                          {displayAttempt.flightDate && (
                            <Typography
                              variant='body2'
                              sx={{
                                color: 'text.secondary',
                              }}
                            >
                              {t('dto.detail.date')}: <strong>{displayAttempt.flightDate}</strong>
                            </Typography>
                          )}
                          {displayAttempt.blockTime && (
                            <Typography
                              variant='body2'
                              sx={{
                                color: 'text.secondary',
                              }}
                            >
                              {t('dto.detail.blockTime')}:{' '}
                              <strong>{displayAttempt.blockTime}</strong>
                            </Typography>
                          )}
                          {displayAttempt.flightTime && (
                            <Typography
                              variant='body2'
                              sx={{
                                color: 'text.secondary',
                              }}
                            >
                              {t('dto.detail.flightTime')}:{' '}
                              <strong>{displayAttempt.flightTime}</strong>
                            </Typography>
                          )}
                          {displayAttempt.flightLogId && (
                            <Link
                              to={`/logs/flights/${displayAttempt.flightLogId}`}
                              style={{ fontSize: '0.875rem' }}
                            >
                              <Icon
                                icon='mdi:open-in-new'
                                width={14}
                                style={{
                                  verticalAlign: 'middle',
                                  marginRight: 4,
                                }}
                              />
                              {t('dto.detail.viewFlightLog')}
                            </Link>
                          )}
                        </Box>
                      )}
                    </Paper>
                  )
                })}
              </Stack>
            )}
          </Stack>
        )}
      </RemoteContent>
    </Box>
  )
}
