import { Box, Button, Card, CardContent, Chip, Typography, Alert } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import type { Attempt, AttemptAnswer, ExamVersionDetail } from '@backend/routes/exams/models'
import { getPreferredExamLanguage } from './language'

export default function ExamReviewPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const { t, i18n } = useTranslation()

  const {
    data: attempt,
    isLoading: attemptLoading,
    error: attemptError,
  } = useApi<Attempt>({
    url: `v1/exams/attempts/${attemptId}`,
    skipFetch: !attemptId,
  })
  const { data: answers } = useApi<AttemptAnswer[]>({
    url: `v1/exams/attempts/${attemptId}/answers`,
    skipFetch: !attemptId,
  })
  const { data: versionDetail } = useApi<ExamVersionDetail>({
    url: `v1/exams/attempts/${attemptId}/version`,
    skipFetch: !attemptId || !attempt,
  })

  const answerMap = new Map((answers ?? []).map((a) => [a.questionId, a.choiceId]))

  return (
    <Box>
      <Button
        component={Link}
        to='/exams/history'
        startIcon={<Icon icon='mdi:arrow-left' />}
        sx={{ mb: 2 }}
      >
        {t('exams.myHistory')}
      </Button>
      <RemoteContent isLoading={attemptLoading} error={attemptError}>
        {attempt && (
          <>
            <Box sx={{ mb: 3 }}>
              <Typography variant='h5' gutterBottom>
                {t('exams.reviewTitle')}
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                {attempt.passed === true ? (
                  <Chip label={t('exams.passed')} color='success' />
                ) : attempt.passed === false ? (
                  <Chip label={t('exams.failed')} color='error' />
                ) : (
                  <Chip label={t('exams.inProgress')} color='default' />
                )}
                <Typography variant='h6'>
                  {t('exams.scorePercent', {
                    percent: attempt.scorePercent?.toFixed(1) ?? '—',
                  })}
                </Typography>
                <Typography
                  variant='body2'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {t('exams.correctCount', {
                    correct: attempt.correctCount ?? 0,
                    total: attempt.totalCount ?? 0,
                  })}
                </Typography>
              </Box>
            </Box>

            {versionDetail?.questions.map((q, idx) => {
              const selectedId = answerMap.get(q.questionId)
              const correctChoice = q.choices.find((c) => c.isCorrect)
              const isCorrect = selectedId === correctChoice?.choiceId
              const questionLanguage = getPreferredExamLanguage(
                i18n.language,
                versionDetail,
                Object.keys(q.translations),
              )

              return (
                <Card
                  key={q.questionId}
                  sx={{
                    mb: 2,
                    borderLeft: '4px solid',
                    borderColor: isCorrect ? 'success.main' : 'error.main',
                  }}
                >
                  <CardContent>
                    <Typography variant='subtitle1' gutterBottom>
                      {idx + 1}.{' '}
                      {questionLanguage ? (q.translations[questionLanguage]?.prompt ?? '') : ''}
                    </Typography>

                    {q.choices.map((choice) => {
                      const isSelected = selectedId === choice.choiceId
                      const isRight = choice.isCorrect
                      const choiceLanguage = getPreferredExamLanguage(
                        i18n.language,
                        versionDetail,
                        Object.keys(choice.translations),
                      )

                      return (
                        <Box
                          key={choice.choiceId}
                          sx={{
                            px: 2,
                            py: 1,
                            mb: 0.5,
                            borderRadius: 1,
                            bgcolor: isRight
                              ? 'success.light'
                              : isSelected
                                ? 'error.light'
                                : 'action.hover',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          {isRight && <Icon icon='mdi:check-circle' color='green' />}
                          {isSelected && !isRight && <Icon icon='mdi:close-circle' color='red' />}
                          {!isRight && !isSelected && <Icon icon='mdi:circle-outline' />}
                          <Typography variant='body2'>
                            {choiceLanguage
                              ? (choice.translations[choiceLanguage]?.text ?? '')
                              : ''}
                          </Typography>
                        </Box>
                      )
                    })}

                    {questionLanguage && q.translations[questionLanguage]?.reasoning && (
                      <Alert severity='info' sx={{ mt: 1 }}>
                        {q.translations[questionLanguage]?.reasoning}
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </>
        )}
      </RemoteContent>
    </Box>
  )
}
