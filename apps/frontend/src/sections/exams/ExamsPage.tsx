import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Grid,
  Typography,
  Alert,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Title } from '../../components/Title'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import type { ExamWithVersion } from '@backend/routes/exams/models'
import { getPreferredExamLanguage } from './language'

export default function ExamsPage() {
  const { t, i18n } = useTranslation()

  const { data: exams, isLoading, error } = useApi<ExamWithVersion[]>({ url: 'v1/exams' })

  const getTitle = (exam: ExamWithVersion) => {
    const cv = exam.currentVersion
    if (!cv) return exam.name
    const language = getPreferredExamLanguage(i18n.language, cv, Object.keys(cv.translations))
    return language ? (cv.translations[language]?.title ?? exam.name) : exam.name
  }

  const getDescription = (exam: ExamWithVersion) => {
    const cv = exam.currentVersion
    if (!cv) return null
    const language = getPreferredExamLanguage(i18n.language, cv, Object.keys(cv.translations))
    return language ? (cv.translations[language]?.description ?? null) : null
  }

  const getExamTypeLabel = (exam: ExamWithVersion) =>
    t(`exams.examTypes.${exam.examType}`, exam.examType)

  return (
    <Box>
      <Title label={t('exams.title')}>
        <Button
          component={Link}
          to='/exams/history'
          variant='outlined'
          startIcon={<Icon icon='mdi:history' />}
        >
          {t('exams.myHistory')}
        </Button>
      </Title>
      <RemoteContent isLoading={isLoading} error={error}>
        {!exams?.length ? (
          <Alert severity='info'>{t('exams.noExams')}</Alert>
        ) : (
          <Grid container spacing={3}>
            {exams.map((exam) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={exam.examId}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <CardActionArea
                    component={Link}
                    to={`/exams/${exam.examId}`}
                    sx={{
                      flexGrow: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                    }}
                  >
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mb: 1,
                        }}
                      >
                        <Icon icon='mdi:school' width={28} />
                        <Chip label={getExamTypeLabel(exam)} size='small' variant='outlined' />
                      </Box>
                      <Typography variant='h6' gutterBottom>
                        {getTitle(exam)}
                      </Typography>
                      {getDescription(exam) && (
                        <Typography
                          variant='body2'
                          sx={{
                            color: 'text.secondary',
                          }}
                        >
                          {getDescription(exam)}
                        </Typography>
                      )}
                      {exam.currentVersion && (
                        <Typography
                          variant='caption'
                          sx={{
                            color: 'text.secondary',
                            display: 'block',
                            mt: 1,
                          }}
                        >
                          {t('exams.questions', {
                            count: exam.currentVersion.questions.length,
                          })}
                        </Typography>
                      )}
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </RemoteContent>
    </Box>
  )
}
