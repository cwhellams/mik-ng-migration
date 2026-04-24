import {
  Box,
  Button,
  Chip,
  type ChipProps,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Alert,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Title } from '../../components/Title'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import type { AttemptListResponse } from '@backend/routes/exams/models'
import dayjs from 'dayjs'

export default function MyExamHistoryPage() {
  const { t } = useTranslation()

  const { data, isLoading, error } = useApi<AttemptListResponse>({
    url: 'v1/exams/my/attempts',
  })

  const statusColor = (status: string): ChipProps['color'] => {
    if (status === 'GRADED') return 'default'
    if (status === 'IN_PROGRESS') return 'warning'
    if (status === 'ABANDONED') return 'error'
    return 'default'
  }

  const getExamTypeLabel = (examType?: string | null) =>
    examType ? t(`exams.examTypes.${examType}`, examType) : '—'

  const hasNewerPublishedVersion = (
    versionNumber?: number | null,
    latestPublishedVersionNumber?: number | null
  ) =>
    versionNumber != null &&
    latestPublishedVersionNumber != null &&
    latestPublishedVersionNumber > versionNumber

  return (
    <Box>
      <Title label={t('exams.myHistory')} />

      <Button
        component={Link}
        to='/exams'
        startIcon={<Icon icon='mdi:arrow-left' />}
        sx={{ mb: 2 }}
      >
        {t('exams.title')}
      </Button>

      <RemoteContent isLoading={isLoading} error={error}>
        {!data?.items.length ? (
          <Alert severity='info'>{t('exams.noAttempts')}</Alert>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('exams.date')}</TableCell>
                <TableCell>{t('common.name')}</TableCell>
                <TableCell>{t('exams.type')}</TableCell>
                <TableCell>{t('exams.version')}</TableCell>
                <TableCell>{t('exams.status')}</TableCell>
                <TableCell>{t('exams.score')}</TableCell>
                <TableCell>{t('exams.result')}</TableCell>
                <TableCell>{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((attempt) => (
                <TableRow key={attempt.attemptId}>
                  <TableCell>
                    {dayjs(attempt.createdAt).format('DD.MM.YYYY HH:mm')}
                  </TableCell>
                  <TableCell>{attempt.examName ?? '—'}</TableCell>
                  <TableCell>{getExamTypeLabel(attempt.examType)}</TableCell>
                  <TableCell>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5,
                      }}
                    >
                      <span>
                        {attempt.versionNumber != null
                          ? t('exams.versionLabel', {
                              version: attempt.versionNumber,
                            })
                          : '—'}
                      </span>
                      {hasNewerPublishedVersion(
                        attempt.versionNumber,
                        attempt.latestPublishedVersionNumber
                      ) &&
                        attempt.examId && (
                          <Chip
                            component={Link}
                            to={`/exams/${attempt.examId}`}
                            clickable
                            icon={<Icon icon='mdi:play-circle-outline' />}
                            label={t('exams.newerVersionAvailable', {
                              version: attempt.latestPublishedVersionNumber,
                            })}
                            size='small'
                            color='info'
                            variant='outlined'
                          />
                        )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={attempt.status}
                      size='small'
                      color={statusColor(attempt.status)}
                    />
                  </TableCell>
                  <TableCell>
                    {attempt.scorePercent != null
                      ? `${attempt.scorePercent.toFixed(1)}%`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {attempt.passed === true && (
                      <Chip
                        label={t('exams.passed')}
                        color='success'
                        size='small'
                      />
                    )}
                    {attempt.passed === false && (
                      <Chip
                        label={t('exams.failed')}
                        color='error'
                        size='small'
                      />
                    )}
                    {attempt.passed == null && '—'}
                  </TableCell>
                  <TableCell>
                    {attempt.status === 'IN_PROGRESS' && (
                      <Button
                        component={Link}
                        to={`/exams/attempt/${attempt.attemptId}`}
                        size='small'
                        variant='outlined'
                        startIcon={<Icon icon='mdi:play' />}
                      >
                        {t('exams.continue')}
                      </Button>
                    )}
                    {attempt.status === 'GRADED' && (
                      <Button
                        component={Link}
                        to={`/exams/review/${attempt.attemptId}`}
                        size='small'
                        variant='outlined'
                        startIcon={<Icon icon='mdi:eye' />}
                      >
                        {t('common.view')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </RemoteContent>
    </Box>
  )
}
