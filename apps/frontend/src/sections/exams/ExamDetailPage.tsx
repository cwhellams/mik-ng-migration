import { Box, Button, Typography, Chip, Alert } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Title } from '../../components/Title'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import type { ExamWithVersion } from '@backend/routes/exams/models'
import { startAttempt } from './examApi'
import { useState } from 'react'
import { getPreferredExamLanguage, resolveExamUiLanguage } from './language'

export default function ExamDetailPage() {
  const { examId } = useParams<{ examId: string }>()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    data: exam,
    isLoading,
    error: fetchError,
  } = useApi<ExamWithVersion>({ url: `v1/exams/${examId}` })

  const cv = exam?.currentVersion
  const contentLanguage = cv
    ? getPreferredExamLanguage(i18n.language, cv, Object.keys(cv.translations))
    : undefined
  const title =
    (contentLanguage ? cv?.translations[contentLanguage]?.title : undefined) ?? exam?.name ?? ''
  const description = contentLanguage ? cv?.translations[contentLanguage]?.description : undefined
  const examTypeLabel = exam ? t(`exams.examTypes.${exam.examType}`, exam.examType) : ''

  const handleStart = async () => {
    if (!examId) return
    setStarting(true)
    setError(null)
    try {
      const attemptLanguage =
        (cv && getPreferredExamLanguage(i18n.language, cv, cv.supportedLanguages)) ??
        resolveExamUiLanguage(i18n.language)
      const attempt = await startAttempt(examId, attemptLanguage)
      navigate(`/exams/attempt/${attempt.attemptId}`)
    } catch {
      setError(t('common.error'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <Box>
      <Button
        component={Link}
        to='/exams'
        startIcon={<Icon icon='mdi:arrow-left' />}
        sx={{ mb: 2 }}
      >
        {t('common.back')}
      </Button>

      <RemoteContent isLoading={isLoading} error={fetchError}>
        {exam && (
          <>
            <Title label={title} />

            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Chip label={examTypeLabel} variant='outlined' />
              {cv && (
                <Chip
                  label={t('exams.passPercent', { percent: cv.passPercent })}
                  color='info'
                  variant='outlined'
                />
              )}
              {cv && (
                <Chip
                  label={t('exams.questions', { count: cv.questions.length })}
                  variant='outlined'
                />
              )}
            </Box>

            {description && (
              <Typography variant='body1' sx={{ mb: 3 }}>
                {description}
              </Typography>
            )}
            {cv && (
              <>
                {error && (
                  <Alert severity='error' sx={{ mb: 2 }}>
                    {error}
                  </Alert>
                )}
                <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
                  <Button
                    variant='contained'
                    size='large'
                    startIcon={<Icon icon='mdi:play-circle' />}
                    onClick={handleStart}
                    disabled={starting}
                  >
                    {t('exams.startExam')}
                  </Button>
                </Box>
              </>
            )}
          </>
        )}
      </RemoteContent>
    </Box>
  )
}
