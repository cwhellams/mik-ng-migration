import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material'
import { Icon } from '@iconify/react'

import { QrResolveStatus, type QrResolveResponse } from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { endpoints } from '../../api/endpoints'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import { LiquidReportForm } from './LiquidReportForm'
import { AssignQrCode } from './AssignQrCode'

/**
 * Where a scanned QR code lands: `/liquid/scan/:code`.
 *
 * There is deliberately no in-app scanner. The codes are plain URLs, so the
 * phone's own camera app opens them — no camera permission to grant, no scanning
 * library to ship, and the flow works from a photo somebody was sent as well as
 * from the sticker itself.
 *
 * What the member sees depends entirely on the server's answer, because that is
 * the side that knows whether the scanner may assign an unclaimed code:
 *
 *   - assigned → the reporting form, prefilled;
 *   - unassigned + liquid admin → the assignment flow;
 *   - unassigned + anyone else → "not yet in use", and no way to change that.
 */
export default function LiquidScanPage() {
  const { t } = useTranslation()
  const { code } = useParams<{ code: string }>()

  const { data, error, isLoading, mutate } = useApi<QrResolveResponse>({
    url: code ? endpoints.liquid.qrResolve(code) : endpoints.liquid.qrCodes,
    skipFetch: !code,
  })

  return (
    <Box>
      <RemoteContent isLoading={isLoading} error={error}>
        {data?.status === QrResolveStatus.ASSIGNED && data.prefill && (
          <LiquidReportForm prefill={data.prefill} qrCode={data.code} />
        )}

        {data?.status === QrResolveStatus.UNASSIGNED_ASSIGNABLE && data.qr && (
          <AssignQrCode qr={data.qr} onAssigned={() => void mutate()} />
        )}

        {data?.status === QrResolveStatus.UNASSIGNED && (
          <Stack spacing={2}>
            <Title label={t('liquid.scan.unassignedTitle')} />
            <Paper sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Alert severity='info' icon={<Icon icon='mdi:qrcode' />}>
                  {t('liquid.scan.unassigned', { code: data.code })}
                </Alert>
                <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                  {t('liquid.scan.unassignedHint')}
                </Typography>
                {/* The uplift is real whether or not the sticker is set up, so
                    the member is still one click from reporting it by hand. */}
                <Button
                  component={Link}
                  to='/liquid/new'
                  variant='contained'
                  sx={{ alignSelf: 'flex-start' }}
                  startIcon={<Icon icon='mdi:plus' />}
                >
                  {t('liquid.scan.reportAnyway')}
                </Button>
              </Stack>
            </Paper>
          </Stack>
        )}
      </RemoteContent>
    </Box>
  )
}
