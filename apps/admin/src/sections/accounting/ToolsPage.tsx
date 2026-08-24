import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Stack,
  Chip,
} from '@mui/material'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useApi from '@mik/ui/hooks/useApi'
import type { RecurringFeesProcessing, AnnualBillingResponse } from '@mik/contracts/invoicing'
import type { AnnualMembershipStats } from '@mik/contracts/members'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { endpoints } from '../../api/endpoints'

export default function ToolsPage() {
  const { t } = useTranslation()
  const [response, setResponse] = useState<AnnualBillingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasTriggered, setHasTriggered] = useState(false)
  const currentYear = new Date().getFullYear()

  const { mutation } = useApi<AnnualBillingResponse>({
    url: 'v1/invoices/triggerAnnualMembershipBillingProcess',
    skipFetch: true,
  })

  const {
    data: billingRuns,
    isLoading: isLoadingBillingRuns,
    error: billingRunsError,
    mutate: refetchRuns,
  } = useApi<RecurringFeesProcessing[]>({
    url: 'v1/invoices/annualMembershipBillingRuns',
    skipFetch: false,
  })

  const {
    data: membershipStats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useApi<AnnualMembershipStats>({
    // `year` moves from the path to `params`, which is where useApi wants a query
    // string: it serialises them and, unlike a hand-built URL, includes them in
    // the SWR cache key, so switching year can't serve the previous year's data.
    url: endpoints.members.annualMembershipStats,
    params: { year: currentYear },
    skipFetch: false,
  })

  useEffect(() => {
    refetchRuns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTriggerBilling = async () => {
    setResponse(null)
    setError(null)
    setHasTriggered(true)

    const result = await mutation.trigger('POST', {})

    if (result.error) {
      setError(result.error.detail || 'An error occurred')
    } else if (result.data) {
      setResponse(result.data)
      // Refetch billing runs after triggering
      refetchRuns()
    }
  }

  const hasCurrentYearRun = billingRuns?.some((run) => run.year === currentYear) || false
  const displayRuns = billingRuns?.slice(0, 3) || []

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant='h4' component='h1' gutterBottom>
        {t('invoicing.toolsPage.title')}
      </Typography>
      <RemoteContent
        isLoading={isLoadingBillingRuns || isLoadingStats}
        error={billingRunsError || statsError}
      >
        <Card sx={{ mt: 4 }}>
          <CardContent>
            <Typography variant='h6' gutterBottom>
              {t('invoicing.toolsPage.annualBilling.title')}
            </Typography>
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
                mb: 2,
              }}
            >
              {t('invoicing.toolsPage.annualBilling.description')}
            </Typography>

            {membershipStats && (
              <Box sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant='body2' gutterBottom>
                  <strong>{t('invoicing.toolsPage.annualBilling.eligibleMembers')}:</strong>{' '}
                  {membershipStats.totalAutoRenewMembers}
                </Typography>
                <Typography variant='body2'>
                  <strong>{t('invoicing.toolsPage.annualBilling.withEquipmentFee')}:</strong>{' '}
                  {membershipStats.totalAutoRenewEquipmentFee}
                </Typography>
              </Box>
            )}

            <Button
              variant='contained'
              color='primary'
              onClick={handleTriggerBilling}
              disabled={mutation.isMutating || hasCurrentYearRun}
              startIcon={mutation.isMutating ? <CircularProgress size={20} /> : null}
            >
              {mutation.isMutating
                ? t('invoicing.toolsPage.annualBilling.processing')
                : t('invoicing.toolsPage.annualBilling.button', {
                    year: currentYear,
                  })}
            </Button>

            {hasCurrentYearRun && !hasTriggered && (
              <Alert severity='info' sx={{ mt: 2 }}>
                {t('invoicing.toolsPage.annualBilling.alreadyRun', {
                  year: currentYear,
                })}
              </Alert>
            )}

            {error && (
              <Alert severity='error' sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            {response && (
              <Alert severity='success' sx={{ mt: 2 }}>
                <Typography variant='body1' gutterBottom>
                  <strong>{t('invoicing.toolsPage.annualBilling.successMessage')}</strong>
                </Typography>
                <Typography variant='body2'>
                  {t('invoicing.toolsPage.annualBilling.processedCount')}:{' '}
                  {response.membersProcessed}
                </Typography>
              </Alert>
            )}

            {displayRuns.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant='subtitle1' gutterBottom>
                  {t('invoicing.toolsPage.annualBilling.recentRuns')}
                </Typography>
                <Stack spacing={2}>
                  {displayRuns.map((run, index) => (
                    <Card key={index} variant='outlined'>
                      <CardContent>
                        <Stack
                          direction='row'
                          spacing={2}
                          sx={{
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <Typography variant='h6' sx={{ minWidth: '80px' }}>
                            {run.year}
                          </Typography>
                          <Chip
                            label={
                              run.status === 'processed'
                                ? t('invoicing.toolsPage.annualBilling.statusProcessed')
                                : t('invoicing.toolsPage.annualBilling.statusInProgress')
                            }
                            color={run.status === 'processed' ? 'success' : 'warning'}
                            size='small'
                          />
                          <Typography
                            variant='body2'
                            sx={{
                              color: 'text.secondary',
                            }}
                          >
                            {t('invoicing.toolsPage.annualBilling.createdBy')}: {run.createdBy}
                          </Typography>
                          <Typography
                            variant='body2'
                            sx={{
                              color: 'text.secondary',
                            }}
                          >
                            {t('invoicing.toolsPage.annualBilling.createdAt')}:{' '}
                            {new Date(run.createdAt).toISOString()}
                          </Typography>
                          {run.status === 'processed' && run.updatedAt && (
                            <Typography
                              variant='body2'
                              sx={{
                                color: 'text.secondary',
                              }}
                            >
                              {t('invoicing.toolsPage.annualBilling.completedAt')}:{' '}
                              {new Date(run.updatedAt).toISOString()}
                            </Typography>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>
            )}
          </CardContent>
        </Card>
      </RemoteContent>
    </Box>
  )
}
