import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'

import {
  LiquidType,
  type LinkableRecordsResponse,
  type LiquidRecordListResponse,
  type LiquidRecordWithLock,
} from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { absolute, endpoints } from '../../../api/endpoints'
import { LiquidReportForm } from '../../liquid/LiquidReportForm'
import { describeRecord } from '../../liquid/liquidHelpers'

/**
 * Fuel and oil records attached to a flight log (#1119).
 *
 * The issue's requirement in one screen: "the member can either create a new
 * record or link one existing unlinked record", with "the aircraft's most recent
 * eligible liquid records" suggested for the second.
 *
 * Both matter, and for different reasons. *Creating* here is the common case —
 * you fuelled and then flew. *Linking* is the one that needs the machinery: the
 * member may have reported the uplift days ago from the pump, by scanning the QR
 * code on it, long before this flight log existed. Without linking, that record
 * would sit unattached forever and the club would have two half-stories.
 *
 * The legacy `fuelUpliftLitres` / `oilUpliftLitres` fields above this section are
 * untouched. There is no backfill either way: they stay as the historical record,
 * and this is where new detail lives.
 */

interface Props {
  flightId: string
  aircraftRegistration: string
  /** False once the flight log is validated — records can no longer be attached. */
  isEditable: boolean
}

export function LiquidRecordsSection({ flightId, aircraftRegistration, isEditable }: Props) {
  const { t } = useTranslation()
  const [creating, setCreating] = useState<LiquidType>()
  const [linking, setLinking] = useState<LiquidType>()

  const { data, isLoading, mutate, mutation } = useApi<LiquidRecordListResponse>({
    url: endpoints.liquid.records,
    params: { flightLogId: flightId },
  })

  // Only fetched while the link dialog is open: the suggestion list is a
  // per-aircraft query the flight log has no other use for.
  const suggestions = useApi<LinkableRecordsResponse>({
    url: endpoints.liquid.linkableRecords,
    params: { aircraftRegistration, liquidType: linking },
    skipFetch: !linking,
  })

  const records = (data?.records ?? []).filter((r) => r.flightLogId === flightId)

  const link = async (record: LiquidRecordWithLock) => {
    await mutation.trigger(
      'POST',
      { flightLogId: flightId },
      absolute(endpoints.liquid.linkRecord(record.recordId)),
    )
    setLinking(undefined)
    await mutate()
  }

  const unlink = async (record: LiquidRecordWithLock) => {
    await mutation.trigger('POST', {}, absolute(endpoints.liquid.unlinkRecord(record.recordId)))
    await mutate()
  }

  return (
    <Paper variant='outlined' sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
        >
          <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
            {t('flightLog.liquid.title')}
          </Typography>
          {isEditable && (
            <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button
                size='small'
                variant='outlined'
                startIcon={<Icon icon='mdi:plus' />}
                onClick={() => setCreating(LiquidType.FUEL)}
              >
                {t('flightLog.liquid.addFuel')}
              </Button>
              <Button
                size='small'
                variant='outlined'
                startIcon={<Icon icon='mdi:plus' />}
                onClick={() => setCreating(LiquidType.OIL)}
              >
                {t('flightLog.liquid.addOil')}
              </Button>
              <Button
                size='small'
                startIcon={<Icon icon='mdi:link-variant' />}
                onClick={() => setLinking(LiquidType.FUEL)}
              >
                {t('flightLog.liquid.linkExisting')}
              </Button>
            </Stack>
          )}
        </Stack>

        {records.length === 0 ? (
          <Typography variant='body2' sx={{ color: 'text.secondary' }}>
            {isLoading ? '' : t('flightLog.liquid.none')}
          </Typography>
        ) : (
          <Stack spacing={1}>
            {records.map((record) => (
              <Stack
                key={record.recordId}
                direction='row'
                spacing={1}
                sx={{ alignItems: 'center' }}
              >
                <Icon icon={record.liquidType === LiquidType.FUEL ? 'mdi:fuel' : 'mdi:oil'} />
                <Typography variant='body2' sx={{ flexGrow: 1 }}>
                  {describeRecord(record, t)}
                </Typography>
                {record.expenseClaimId && (
                  <Chip size='small' color='primary' label={t('liquid.myRecords.claimed')} />
                )}
                {/* Detaching is only offered while the record is still the
                    member's to change — a claimed or validated one is locked. */}
                {isEditable && record.lock.canEdit && (
                  <IconButton
                    size='small'
                    onClick={() => void unlink(record)}
                    aria-label={t('flightLog.liquid.unlink')}
                  >
                    <Icon icon='mdi:link-variant-off' />
                  </IconButton>
                )}
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>

      {/* Creating inside the flight log rather than navigating away: the flight
          log may have unsaved edits, and losing them to report 40 litres of fuel
          would be a poor trade. */}
      <Dialog open={!!creating} onClose={() => setCreating(undefined)} fullWidth maxWidth='md'>
        <DialogContent>
          {creating && (
            <LiquidReportForm
              prefill={{
                liquidType: creating,
                aircraftRegistration,
                label: `${aircraftRegistration} · ${flightId}`,
              }}
              flightLogId={flightId}
              onSaved={() => {
                setCreating(undefined)
                void mutate()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!linking} onClose={() => setLinking(undefined)} fullWidth maxWidth='sm'>
        <DialogTitle>{t('flightLog.liquid.linkTitle')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              size='small'
              label={t('liquid.form.liquidType')}
              value={linking ?? LiquidType.FUEL}
              onChange={(e) => setLinking(e.target.value as LiquidType)}
            >
              <MenuItem value={LiquidType.FUEL}>{t('liquid.type.fuel')}</MenuItem>
              <MenuItem value={LiquidType.OIL}>{t('liquid.type.oil')}</MenuItem>
            </TextField>

            {(suggestions.data?.records ?? []).length === 0 ? (
              <Alert severity='info'>
                {t('flightLog.liquid.noSuggestions', { aircraft: aircraftRegistration })}
              </Alert>
            ) : (
              <Stack spacing={1}>
                {(suggestions.data?.records ?? []).map((record) => (
                  <Stack
                    key={record.recordId}
                    direction='row'
                    spacing={1}
                    sx={{ alignItems: 'center' }}
                  >
                    <Stack sx={{ flexGrow: 1 }}>
                      <Typography variant='body2'>{describeRecord(record, t)}</Typography>
                      <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                        {new Date(record.recordedAt).toLocaleString()}
                      </Typography>
                    </Stack>
                    <Button size='small' onClick={() => void link(record)}>
                      {t('flightLog.liquid.link')}
                    </Button>
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </Paper>
  )
}
