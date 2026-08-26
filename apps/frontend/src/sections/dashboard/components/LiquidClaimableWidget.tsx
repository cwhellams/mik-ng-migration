import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { Icon } from '@iconify/react'

import type { ClaimableFuelSummary } from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { endpoints } from '../../../api/endpoints'

/**
 * "Add a new dashboard widget that suggests a member create an expense claim if
 * they have recorded adding fuel with own / other type" (#1119 comment).
 *
 * "Own / other" is exactly "has a total cost": EFNU fuelling is invoiced to the
 * club and carries none, so it can never be claimed and never shows up here.
 *
 * Renders nothing when there is nothing to claim, rather than an empty card. A
 * prompt is only useful when it is prompting.
 */
export function LiquidClaimableWidget() {
  const { t } = useTranslation()
  const { data, isLoading, error } = useApi<ClaimableFuelSummary>({
    url: endpoints.liquid.claimableFuel,
  })

  if (isLoading || error || !data || data.count === 0) return null

  return (
    <Box
      sx={{
        p: 2,
        border: '1px solid',
        borderColor: 'info.main',
        borderRadius: 2,
        mb: 2,
      }}
    >
      <Stack direction='row' spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Icon icon='mdi:fuel' width={24} />
        <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
          {t('liquid.claimable.widgetTitle')}
        </Typography>
      </Stack>

      <Alert severity='info' sx={{ mb: 1 }}>
        {t('liquid.claimable.prompt', {
          count: data.count,
          total: data.totalCostEur.toFixed(2),
        })}
        {/* The oldest one is the useful detail: it says how long this has been
            waiting, which is what turns a notice into a nudge. */}
        {data.oldestRecordedAt && (
          <>
            {' '}
            {t('liquid.claimable.oldest', {
              date: new Date(data.oldestRecordedAt).toLocaleDateString(),
            })}
          </>
        )}
      </Alert>

      <Stack direction='row' spacing={1}>
        <Button
          component={Link}
          to='/expenses/new'
          variant='contained'
          size='small'
          startIcon={<Icon icon='mdi:receipt-text-plus-outline' />}
        >
          {t('liquid.claimable.action')}
        </Button>
        <Button component={Link} to='/liquid' size='small'>
          {t('liquid.claimable.viewRecords')}
        </Button>
      </Stack>
    </Box>
  )
}
