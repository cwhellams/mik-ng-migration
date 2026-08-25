import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'

import type { CreateQrBatchRequest, QrBatch, QrCode } from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import { AssignQrCode } from './AssignQrCode'

/**
 * The liquid admin's QR console: mint identities, print them, assign them later.
 *
 * The order matters and is the whole design. Codes are generated *before* anyone
 * knows what they will point at, so a sheet can be printed, cut up and left in
 * the hangar; the assignment happens weeks later, when somebody sticks one on a
 * canister and scans it. Nothing about the printed image changes at that point —
 * it only ever encoded `/liquid/scan/<code>`.
 */

const API_BASE = import.meta.env.VITE_API_TARGET ?? ''

export default function QrCodesAdmin() {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const [count, setCount] = useState('12')
  const [selectedBatch, setSelectedBatch] = useState<string>()
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  const [assigning, setAssigning] = useState<QrCode>()
  const [mintError, setMintError] = useState<string>()

  const batchesApi = useApi<QrBatch[]>({ url: 'v1/liquid/qr/batches', alwaysSudo: true })
  const codesApi = useApi<QrCode[]>({
    url: 'v1/liquid/qr',
    params: {
      ...(selectedBatch ? { batchId: selectedBatch } : {}),
      unassignedOnly: String(unassignedOnly),
    },
    alwaysSudo: true,
  })
  const { mutation } = useApi<{ batch: QrBatch; codes: QrCode[] }>({
    url: 'v1/liquid/qr/batches',
    skipFetch: true,
  })

  const batches = batchesApi.data ?? []
  const codes = codesApi.data ?? []

  const handleMint = async () => {
    setMintError(undefined)
    const payload: CreateQrBatchRequest = { label, count: Number(count) }
    const { data, error } = await mutation.trigger('POST', payload)
    if (error || !data) {
      setMintError(error?.detail ?? t('general.savingError'))
      return
    }
    setLabel('')
    setSelectedBatch(data.batch.batchId)
    await batchesApi.mutate()
    await codesApi.mutate()
  }

  /**
   * Opens the printable sheet in a new tab.
   *
   * A plain link rather than a fetch-and-blob: the admin's next action is Ctrl-P,
   * the response is already `Content-Disposition: inline`, and the cookie goes
   * with a top-level navigation the same as with an XHR.
   */
  const sheetUrl = (batchId: string) => `${API_BASE}/api/v1/liquid/qr/batches/${batchId}/sheet.pdf`

  return (
    <Box>
      <Title label={t('liquid.admin.qr.title')} />

      <Stack spacing={3}>
        {mintError && <Alert severity='error'>{mintError}</Alert>}

        <Paper sx={{ p: 3 }}>
          <Typography variant='h6' sx={{ mb: 2 }}>
            {t('liquid.admin.qr.generateTitle')}
          </Typography>
          <Typography variant='body2' sx={{ color: 'text.secondary', mb: 2 }}>
            {t('liquid.admin.qr.generateHint')}
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: 'flex-start' }}
          >
            <TextField
              label={t('liquid.admin.qr.batchLabel')}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              helperText={t('liquid.admin.qr.batchLabelHint')}
              required
              sx={{ minWidth: 220 }}
            />
            <TextField
              type='number'
              label={t('liquid.admin.qr.count')}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              slotProps={{ htmlInput: { min: 1, max: 96, step: 1 } }}
              helperText={t('liquid.admin.qr.countHint')}
              sx={{ width: 160 }}
            />
            <Button
              variant='contained'
              disabled={!label || !count || mutation.isMutating}
              startIcon={<Icon icon='mdi:qrcode-plus' />}
              onClick={() => void handleMint()}
              sx={{ mt: { sm: 1 } }}
            >
              {t('liquid.admin.qr.generate')}
            </Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant='h6' sx={{ mb: 2 }}>
            {t('liquid.admin.qr.batchesTitle')}
          </Typography>
          <RemoteContent isLoading={batchesApi.isLoading} error={batchesApi.error}>
            {batches.length === 0 ? (
              <Alert severity='info'>{t('liquid.admin.qr.noBatches')}</Alert>
            ) : (
              <TableContainer>
                <Table size='small'>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('liquid.admin.qr.batchLabel')}</TableCell>
                      <TableCell>{t('liquid.admin.qr.count')}</TableCell>
                      <TableCell>{t('liquid.admin.qr.assignedCount')}</TableCell>
                      <TableCell>{t('liquid.admin.qr.created')}</TableCell>
                      <TableCell align='right' />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {batches.map((batch) => (
                      <TableRow
                        key={batch.batchId}
                        selected={selectedBatch === batch.batchId}
                        hover
                      >
                        <TableCell>{batch.label}</TableCell>
                        <TableCell>{batch.codeCount}</TableCell>
                        <TableCell>{`${batch.assignedCount} / ${batch.codeCount}`}</TableCell>
                        <TableCell>{new Date(batch.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell align='right'>
                          <Stack
                            direction='row'
                            spacing={1}
                            sx={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 1 }}
                          >
                            <Button
                              size='small'
                              component='a'
                              href={sheetUrl(batch.batchId)}
                              target='_blank'
                              rel='noreferrer'
                              startIcon={<Icon icon='mdi:printer-outline' />}
                            >
                              {t('liquid.admin.qr.printSheet')}
                            </Button>
                            <Button
                              size='small'
                              onClick={() =>
                                setSelectedBatch((current) =>
                                  current === batch.batchId ? undefined : batch.batchId,
                                )
                              }
                            >
                              {selectedBatch === batch.batchId
                                ? t('liquid.admin.qr.showAll')
                                : t('liquid.admin.qr.showCodes')}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </RemoteContent>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Stack
            direction='row'
            sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
          >
            <Typography variant='h6'>{t('liquid.admin.qr.codesTitle')}</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={unassignedOnly}
                  onChange={(e) => setUnassignedOnly(e.target.checked)}
                />
              }
              label={t('liquid.admin.qr.unassignedOnly')}
            />
          </Stack>

          <RemoteContent isLoading={codesApi.isLoading} error={codesApi.error}>
            {codes.length === 0 ? (
              <Alert severity='info'>{t('liquid.admin.qr.noCodes')}</Alert>
            ) : (
              <TableContainer>
                <Table size='small'>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('liquid.admin.qr.code')}</TableCell>
                      <TableCell>{t('liquid.admin.qr.batchLabel')}</TableCell>
                      <TableCell>{t('liquid.admin.qr.target')}</TableCell>
                      <TableCell>{t('liquid.admin.qr.assignedAt')}</TableCell>
                      <TableCell align='right' />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {codes.map((code) => (
                      <TableRow key={code.qrId}>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{code.code}</TableCell>
                        <TableCell>{code.batchLabel ?? '—'}</TableCell>
                        <TableCell>
                          {code.targetType ? (
                            <Chip
                              size='small'
                              icon={
                                <Icon
                                  icon={code.targetType === 'OIL_CANISTER' ? 'mdi:oil' : 'mdi:fuel'}
                                />
                              }
                              label={code.targetLabel ?? code.targetId}
                            />
                          ) : (
                            <Chip
                              size='small'
                              variant='outlined'
                              label={t('liquid.admin.qr.unassigned')}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {code.assignedAt ? new Date(code.assignedAt).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell align='right'>
                          {/* Permanent once set, so there is nothing to offer on
                              an assigned code. */}
                          {!code.targetType && (
                            <Button size='small' onClick={() => setAssigning(code)}>
                              {t('liquid.admin.qr.assign')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </RemoteContent>
        </Paper>
      </Stack>

      <Dialog open={!!assigning} onClose={() => setAssigning(undefined)} fullWidth maxWidth='sm'>
        <DialogContent>
          {assigning && (
            <AssignQrCode
              qr={assigning}
              onAssigned={() => {
                void codesApi.mutate()
                void batchesApi.mutate()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  )
}
