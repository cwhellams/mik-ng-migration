import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  LinearProgress,
  Typography,
  Alert,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import type { Attempt, AttemptAnswer, ExamVersionDetail } from '@mik/contracts/exams'
import { saveAnswer, submitAttempt, abandonAttempt } from './examApi'
import { useState, useEffect } from 'react'
import { getPreferredExamLanguage } from './language'

export default function ExamAttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | null>>({})
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const {
    data: attempt,
    isLoading: attemptLoading,
    error: attemptError,
  } = useApi<Attempt>({
    url: `v1/exams/attempts/${attemptId}`,
    skipFetch: !attemptId,
  })

  const { data: savedAnswers } = useApi<AttemptAnswer[]>({
    url: `v1/exams/attempts/${attemptId}/answers`,
    skipFetch: !attemptId,
  })

  const { data: versionDetail, isLoading: versionDetailLoading } = useApi<ExamVersionDetail>({
    url: `v1/exams/attempts/${attemptId}/version`,
    skipFetch: !attemptId || !attempt,
  })

  // Load existing answers
  useEffect(() => {
    if (savedAnswers) {
      const map: Record<string, string | null> = {}
      for (const a of savedAnswers) {
        map[a.questionId] = a.choiceId ?? null
      }
      setAnswers(map)
    }
  }, [savedAnswers])

  const questions = versionDetail?.questions ?? []
  const currentQuestion = questions[currentIdx]
  const currentQuestionLanguage =
    currentQuestion && versionDetail
      ? getPreferredExamLanguage(
          i18n.language,
          versionDetail,
          Object.keys(currentQuestion.translations),
        )
      : undefined

  const handleSelectChoice = async (questionId: string, choiceId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceId }))
    if (!attemptId) return
    try {
      await saveAnswer(attemptId, questionId, choiceId)
    } catch {
      // non-blocking save failure
    }
  }

  const handleSubmit = async () => {
    if (!attemptId) return
    setSubmitting(true)
    setActionError(null)
    try {
      await submitAttempt(attemptId)
      navigate(`/exams/review/${attemptId}`)
    } catch {
      setActionError(t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleAbandon = async () => {
    if (!attemptId) return
    try {
      await abandonAttempt(attemptId)
      navigate('/exams')
    } catch {
      setActionError(t('common.error'))
    }
  }

  const isLoading = attemptLoading || versionDetailLoading
  const progressValue = questions.length > 0 ? ((currentIdx + 1) / questions.length) * 100 : 0

  return (
    <Box>
      <RemoteContent isLoading={isLoading} error={attemptError}>
        {attempt && versionDetail && (
          <>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2,
              }}
            >
              <Typography variant='h5'>{t('exams.examInProgress')}</Typography>
              <Button
                variant='text'
                color='error'
                startIcon={<Icon icon='mdi:close-circle' />}
                onClick={handleAbandon}
                size='small'
              >
                {t('exams.abandon')}
              </Button>
            </Box>

            <LinearProgress
              variant='determinate'
              value={progressValue}
              sx={{ mb: 2, height: 8, borderRadius: 4 }}
            />
            <Typography
              variant='caption'
              sx={{
                color: 'text.secondary',
                mb: 2,
                display: 'block',
              }}
            >
              {t('exams.questionOf', {
                current: currentIdx + 1,
                total: questions.length,
              })}
            </Typography>

            {currentQuestion && (
              <Card>
                <CardContent>
                  <Typography variant='h6' gutterBottom>
                    {currentQuestionLanguage
                      ? (currentQuestion.translations[currentQuestionLanguage]?.prompt ?? '')
                      : ''}
                  </Typography>

                  <FormControl component='fieldset' sx={{ width: '100%' }}>
                    <RadioGroup
                      value={answers[currentQuestion.questionId] ?? ''}
                      onChange={(e) =>
                        handleSelectChoice(currentQuestion.questionId, e.target.value)
                      }
                    >
                      {currentQuestion.choices.map((choice) => {
                        const choiceLanguage = getPreferredExamLanguage(
                          i18n.language,
                          versionDetail,
                          Object.keys(choice.translations),
                        )

                        return (
                          <FormControlLabel
                            key={choice.choiceId}
                            value={choice.choiceId}
                            control={<Radio />}
                            label={
                              choiceLanguage
                                ? (choice.translations[choiceLanguage]?.text ?? '')
                                : ''
                            }
                            sx={{
                              border: '1px solid',
                              borderColor:
                                answers[currentQuestion.questionId] === choice.choiceId
                                  ? 'primary.main'
                                  : 'divider',
                              borderRadius: 1,
                              mb: 1,
                              px: 1,
                            }}
                          />
                        )
                      })}
                    </RadioGroup>
                  </FormControl>
                </CardContent>
              </Card>
            )}

            {actionError && (
              <Alert severity='error' sx={{ mt: 2 }}>
                {actionError}
              </Alert>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              <Button
                variant='outlined'
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                disabled={currentIdx === 0 || questions.length === 0}
                startIcon={<Icon icon='mdi:arrow-left' />}
              >
                {t('common.previous')}
              </Button>

              {currentIdx < questions.length - 1 ? (
                <Button
                  variant='contained'
                  onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                  endIcon={<Icon icon='mdi:arrow-right' />}
                  disabled={questions.length === 0}
                >
                  {t('common.next')}
                </Button>
              ) : (
                <Button
                  variant='contained'
                  color='success'
                  onClick={handleSubmit}
                  disabled={submitting || questions.length === 0}
                  startIcon={
                    submitting ? <CircularProgress size={18} /> : <Icon icon='mdi:check-circle' />
                  }
                >
                  {t('exams.submitExam')}
                </Button>
              )}
            </Box>
          </>
        )}
      </RemoteContent>
    </Box>
  )
}
