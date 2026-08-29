import { Alert, Card, CardContent, Stack, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import type { TrendingFindingsQuery, TrendingFindingsResponse } from '@mik/contracts/findings'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import useApi from '@mik/ui/hooks/useApi'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import { useTranslation } from 'react-i18next'

import { endpoints } from '../../api/endpoints'
import { KindChip, StatusChip } from './findingKinds'
import { findingLocation } from './findingLocation'

/**
 * The monitoring half: aircraft that have been reported for the same thing
 * more than once.
 *
 * This is the issue's own request -- "System should offer 'this might be
 * related' when there has been 2 remarks of fuel increasing in right tank" --
 * turned into a list you can read down rather than a hint you have to go
 * looking for one row at a time.
 */
export const TrendingFindings = ({ filters }: { filters: TrendingFindingsQuery }) => {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()

  const { data, isLoading, error } = useApi<TrendingFindingsResponse>({
    url: endpoints.findings.trending,
    params: filters,
  })

  const clusters = data?.clusters ?? []

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
        {t('findings.trendingIntro')}
      </Typography>

      {clusters.length === 0 && !isLoading && (
        <Alert severity='success' icon={<Icon icon='mdi:check-circle-outline' />}>
          {t('findings.noPatterns')}
        </Alert>
      )}

      <Stack spacing={2}>
        {clusters.map((cluster) => (
          <Card key={`${cluster.latest.kind}-${cluster.latest.findingId}`}>
            <CardContent>
              <Stack
                direction='row'
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 1 }}
              >
                <Typography variant='h6'>{cluster.aircraftRegistration}</Typography>
                <Typography variant='subtitle2' color='warning.main'>
                  {t('findings.reportCount', { count: cluster.size })}
                </Typography>
                <Typography variant='caption' color='text.secondary'>
                  {t('findings.since', { date: formatDateTime(cluster.firstReportedAt) })}
                </Typography>
              </Stack>

              <Stack spacing={1}>
                {[cluster.latest, ...cluster.others].map((finding) => (
                  <Stack
                    key={`${finding.kind}-${finding.findingId}`}
                    direction='row'
                    spacing={1}
                    sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}
                  >
                    <KindChip kind={finding.kind} />
                    <StatusChip status={finding.status} />
                    <Typography variant='body2'>{finding.description}</Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {formatDateTime(finding.createdAt)}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {findingLocation(finding, t('findings.book', { seqNo: finding.ajlbSeqNo }))}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </RemoteContent>
  )
}
