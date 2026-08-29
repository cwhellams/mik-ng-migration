import { Alert, Box, Button, Grid, Stack, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import type {
  FindingSearchFilters,
  FindingSearchHit,
  FindingSearchResponse,
} from '@mik/contracts/findings'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { ResponsiveTable } from '@mik/ui/components/ResponsiveTable'
import useApi from '@mik/ui/hooks/useApi'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { endpoints } from '../../api/endpoints'
import { MemberAppLink } from '../../components/MemberAppLink'
import { KindChip, StatusChip } from '@mik/ui/components/FindingChips'
import { RelatedFindings } from './RelatedFindings'

const rowKey = (finding: FindingSearchHit) => `${finding.kind}-${finding.findingId}`

export const FINDINGS_PAGE_SIZE = 25

/**
 * The search half of the findings page: one page of defects and remarks, each
 * row able to open the earlier reports that resemble it.
 *
 * The page number belongs to the parent, which owns the filters: changing a
 * filter has to reset it, and a page 4 left over from a wider search shows an
 * empty table that reads as "no results" rather than as "you are past the
 * end". Same arrangement as `AttemptsAdminPage`.
 */
export const FindingSearchResults = ({
  filters,
  page,
  onPageChange,
}: {
  filters: Omit<FindingSearchFilters, 'page' | 'pageSize'>
  page: number
  onPageChange: (page: number) => void
}) => {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()
  const [expanded, setExpanded] = useState<string | null>(null)
  const pageSize = FINDINGS_PAGE_SIZE

  const { data, isLoading, error } = useApi<FindingSearchResponse>({
    url: endpoints.findings.root,
    params: { ...filters, page, pageSize },
  })

  const total = data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / pageSize))

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <ResponsiveTable
        notFoundMsg={t('findings.noResults')}
        rows={data?.entries}
        header={
          <>
            <Grid size={{ md: 2 }}>
              <Typography variant='subtitle2'>{t('findings.table.reported')}</Typography>
            </Grid>
            <Grid size={{ md: 2 }}>
              <Typography variant='subtitle2'>{t('findings.table.aircraft')}</Typography>
            </Grid>
            <Grid size={{ md: 6 }}>
              <Typography variant='subtitle2'>{t('findings.table.description')}</Typography>
            </Grid>
            <Grid size={{ md: 2 }}>
              <Typography variant='subtitle2'>{t('findings.table.related')}</Typography>
            </Grid>
          </>
        }
        row={(finding) => (
          <>
            <Grid size={{ xs: 12, md: 2 }}>
              <Typography variant='body2'>{formatDateTime(finding.createdAt)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <Typography variant='body2'>{finding.aircraftRegistration}</Typography>
              {finding.ajlbSeqNo != null &&
                (finding.flightId != null ? (
                  <MemberAppLink to={`/logs/flights/${finding.flightId}`} variant='body2'>
                    {t('findings.book', { seqNo: finding.ajlbSeqNo })}
                  </MemberAppLink>
                ) : (
                  // Not tied to any one flight (a ground/pre-flight defect) -- send the
                  // admin to the logbook page instead, with the defect highlighted and
                  // its details dialog opened automatically (DefectMarker's `highlighted`).
                  <MemberAppLink
                    to={`/logs/books/${finding.aircraftRegistration}/${finding.ajlbSeqNo}?highlightDefect=${finding.findingId}`}
                    variant='body2'
                  >
                    {t('findings.book', { seqNo: finding.ajlbSeqNo })}
                  </MemberAppLink>
                ))}
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Stack direction='row' spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <KindChip kind={finding.kind} />
                <StatusChip status={finding.status} />
                <Typography variant='body2'>{finding.description}</Typography>
              </Stack>
              {expanded === rowKey(finding) && (
                <RelatedFindings kind={finding.kind} findingId={finding.findingId} />
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              {finding.similarCount > 0 && (
                <Button
                  size='small'
                  color='warning'
                  startIcon={<Icon icon='mdi:link-variant' />}
                  onClick={() => setExpanded(expanded === rowKey(finding) ? null : rowKey(finding))}
                >
                  {t('findings.mightBeRelated', { count: finding.similarCount })}
                </Button>
              )}
            </Grid>
          </>
        )}
      />

      {total > 0 && data?.entries.length === 0 && (
        // A page number outliving the result set it was taken from -- the
        // filters narrowed, or somebody resolved a defect between requests.
        // Without this the table reads as "nothing matches these filters",
        // which is a claim about the fleet rather than about the page.
        <Alert
          severity='info'
          sx={{ mt: 2 }}
          action={
            <Button color='inherit' size='small' onClick={() => onPageChange(1)}>
              {t('findings.backToFirstPage')}
            </Button>
          }
        >
          {t('findings.pastEnd', { total })}
        </Alert>
      )}

      {total > pageSize && (
        <Box
          sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 2 }}
        >
          <Button
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={t('findings.previousPage')}
          >
            <Icon icon='mdi:chevron-left' />
          </Button>
          <Typography variant='body2'>{t('findings.pageOf', { page, lastPage, total })}</Typography>
          <Button
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
            aria-label={t('findings.nextPage')}
          >
            <Icon icon='mdi:chevron-right' />
          </Button>
        </Box>
      )}
    </RemoteContent>
  )
}
