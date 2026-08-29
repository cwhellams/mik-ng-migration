import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import type { Finding, TechnicalNotesResponse } from '@mik/contracts/findings'
import { KindChip, StatusChip } from '@mik/ui/components/FindingChips'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import useApi from '@mik/ui/hooks/useApi'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { endpoints } from '../../../api/endpoints'

/**
 * "Recent technical notes" (#1230) — one aircraft's defects, remarks and
 * maintenance work in a single list, newest first.
 *
 * Asked for on the issue by a club member, in the same breath as the
 * fleet-wide search: what a captain wants before flying a particular aeroplane
 * is not a search tool but a glance at how that aeroplane has been behaving.
 * Reading it spread over the logbook pages, three separate lists at a time,
 * was the thing that did not work.
 *
 * It stays in the member app while the search itself lives in the admin app,
 * for the reason #1233 draws the line by: this is read at the aircraft, on a
 * phone, by whoever is about to fly it.
 */

const HISTORY_LENGTH = 20

const TechnicalNote = ({ finding }: { finding: Finding }) => {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()

  return (
    <Stack spacing={0.5}>
      <Stack direction='row' spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <KindChip kind={finding.kind} />
        <StatusChip status={finding.status} />
        <Typography variant='caption' color='text.secondary'>
          {formatDateTime(finding.createdAt)}
        </Typography>
        {finding.performedBy && (
          <Typography variant='caption' color='text.secondary'>
            {t('aircraft.technicalNotes.performedBy', { name: finding.performedBy })}
          </Typography>
        )}
      </Stack>
      <Typography variant='body2'>{finding.description}</Typography>
    </Stack>
  )
}

export const TechnicalNotesDialog = ({
  aircraftRegistration,
  open,
  onClose,
}: {
  aircraftRegistration: string
  open: boolean
  onClose: () => void
}) => {
  const { t } = useTranslation()

  // Nothing is fetched until the dialog is opened: the aircraft page renders a
  // card per aeroplane, and fetching every aircraft's history up front would
  // be one request per card for a panel most visits never open.
  const { data, isLoading, error } = useApi<TechnicalNotesResponse>({
    url: endpoints.findings.technicalNotes,
    params: { aircraftRegistration, limit: HISTORY_LENGTH },
    skipFetch: !open,
  })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      {/*
        A plain DialogTitle rather than the shared EditDialogTitle: that one
        runs its `title` through `t()`, which is right for a translation key
        and wrong for a string that has already been interpolated with a
        registration.
      */}
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box component='span'>
          {t('aircraft.technicalNotes.title', { registration: aircraftRegistration })}
        </Box>
        {/* `aria-label='close'`, matching the shared EditDialogTitle, so this
            and the footer button do not share one accessible name. */}
        <IconButton onClick={onClose} aria-label='close'>
          <Icon icon='mdi:close' />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <RemoteContent isLoading={isLoading} error={error}>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            {t('aircraft.technicalNotes.intro')}
          </Typography>
          <Stack spacing={2}>
            {data?.entries.map((finding) => (
              <TechnicalNote key={`${finding.kind}-${finding.findingId}`} finding={finding} />
            ))}
          </Stack>
          {data?.entries.length === 0 && (
            <Typography variant='body2'>{t('aircraft.technicalNotes.empty')}</Typography>
          )}
        </RemoteContent>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('aircraft.technicalNotes.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * The link that opens it, for the aircraft card's info tab. Owns the open
 * state so the card itself gains one line rather than another piece of
 * per-registration state.
 */
export const TechnicalNotesLink = ({ aircraftRegistration }: { aircraftRegistration: string }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        size='small'
        startIcon={<Icon icon='mdi:clipboard-text-clock' />}
        onClick={() => setOpen(true)}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('aircraft.technicalNotes.open')}
      </Button>
      <TechnicalNotesDialog
        aircraftRegistration={aircraftRegistration}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
