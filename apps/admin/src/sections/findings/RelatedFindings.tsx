import { Box, Stack, Typography } from '@mui/material'
import type { RelatedFindingsResponse, SearchableFindingKind } from '@mik/contracts/findings'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import useApi from '@mik/ui/hooks/useApi'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import { useTranslation } from 'react-i18next'

import { endpoints } from '../../api/endpoints'
import { KindChip, StatusChip } from './findingKinds'

/**
 * The "this might be related" expansion under a search hit.
 *
 * Fetched on demand rather than with the search itself: the answer on the
 * issue was that the hint surfaces in this page when asked for, and the search
 * already carries the *count* for every row, which is what tells an admin
 * there is anything to open.
 */
export const RelatedFindings = ({
  kind,
  findingId,
}: {
  kind: SearchableFindingKind
  findingId: string
}) => {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()

  const { data, isLoading, error } = useApi<RelatedFindingsResponse>({
    url: endpoints.findings.related,
    params: { kind, findingId },
  })

  return (
    <Box sx={{ pl: 2, borderLeft: 2, borderColor: 'divider', mt: 1 }}>
      <RemoteContent isLoading={isLoading} error={error}>
        <Stack spacing={1}>
          {(data?.findings ?? []).map((finding) => (
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
                {t('findings.matchStrength', { percent: Math.round(finding.similarity * 100) })}
              </Typography>
            </Stack>
          ))}
          {data?.findings.length === 0 && (
            <Typography variant='body2' color='text.secondary'>
              {t('findings.noRelated')}
            </Typography>
          )}
        </Stack>
      </RemoteContent>
    </Box>
  )
}
