import { Alert, Box, Button } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import useApi from '../../../hooks/useApi'
import { useMe } from '../../../hooks/useMe'
import type { InstructorQualification } from '@backend/routes/instructor-qualifications/models'

const EXPIRING_DAYS_THRESHOLD = 30

export function InstructorQualificationsBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { me } = useMe()

  const isInstructorOrExaminer = me?.roles?.some(
    (r) => r.roleId === 'INSTRUCTOR' || r.roleId === 'EXAMINER'
  )

  const { data, error, isLoading } = useApi<InstructorQualification>(
    {
      url: 'v1/instructor-qualifications/me',
    },
    { shouldRetryOnError: false }
  )

  if (!isInstructorOrExaminer || isLoading) return null

  const noData = error?.status === 404
  const today = dayjs()

  const expiryFields = data
    ? [
        data.fiExpiry,
        data.iriExpiry,
        data.criExpiry,
        data.sepExpiry,
        data.medicalClass1Expiry,
        data.medicalClass2Expiry,
        data.medicalLaplExpiry,
      ]
    : []

  const hasExpired = expiryFields.some(
    (d) => d && dayjs(d).isBefore(today, 'day')
  )
  const hasExpiringSoon = expiryFields.some((d) => {
    if (!d) return false
    const daysLeft = dayjs(d).diff(today, 'day')
    return daysLeft >= 0 && daysLeft <= EXPIRING_DAYS_THRESHOLD
  })

  if (!noData && !hasExpired && !hasExpiringSoon) return null

  const severity = hasExpired || noData ? 'error' : 'warning'
  const message = noData
    ? t('dashboard.instructorQualificationsAlert.missing')
    : t('dashboard.instructorQualificationsAlert.expiredOrExpiring')

  return (
    <Box mb={2}>
      <Alert
        severity={severity}
        action={
          <Button
            color='inherit'
            size='small'
            onClick={() => navigate('/club/members/me')}
          >
            {t('dashboard.instructorQualificationsAlert.viewProfile')}
          </Button>
        }
      >
        {message}
      </Alert>
    </Box>
  )
}
