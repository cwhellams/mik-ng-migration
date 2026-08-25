import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { FlightLogAuditResponse } from '@mik/contracts/flight-log'
import { EditDialogTitle } from '@mik/ui/components/EditDialogTitle'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import useApi from '@mik/ui/hooks/useApi'
import { useTimezone } from '@mik/ui/hooks/useTimezone'

interface Props {
  flightId: string | undefined
  open: boolean
  onClose: () => void
}

/**
 * Who changed what on a flight log, newest first.
 *
 * Worth having on its own, but the reason it exists is #1019: a flight can now be
 * corrected by an instructor who is not the member being invoiced for it, and the member
 * whose flight it is has to be able to see that happen and what was touched.
 *
 * The server does the diffing — see `getFlightLogAuditTrail` — so this renders a list of
 * field changes rather than picking two JSON row snapshots apart in the browser, and a
 * reader who may not see the billing fields never receives them.
 *
 * The trail is merged server-side from four sources: the flight's own audit table plus
 * a defect (#1223), a remark (#1226) and a fuel/oil record (#1119) attached to it — each
 * keeps its own audit trail on its own table, and `entry.source` is what makes a row's
 * `auditId` (unique only within its own table) safe to use as part of a React key here.
 */
export const FlightLogAuditDialog = ({ flightId, open, onClose }: Props) => {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()

  const { data, isLoading, error } = useApi<FlightLogAuditResponse>({
    url: `v1/flight-logs/${flightId}/audit`,
    skipFetch: !open || !flightId,
  })

  // Falls back to the raw field name for anything without a translation, so a new column
  // shows up in the trail as itself instead of as a missing-key marker.
  const fieldLabel = (field: string) => t(`flightLog.audit.fields.${field}`, field)

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <EditDialogTitle title={t('flightLog.audit.title')} onClose={onClose} />
      <DialogContent>
        <RemoteContent isLoading={isLoading} error={error}>
          {data?.entries.length ? (
            <TableContainer component={Paper} variant='outlined'>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('flightLog.audit.when')}</TableCell>
                    <TableCell>{t('flightLog.audit.who')}</TableCell>
                    <TableCell>{t('flightLog.audit.operation')}</TableCell>
                    <TableCell>{t('flightLog.audit.changes')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.entries.map((entry) => (
                    <TableRow key={`${entry.source}-${entry.auditId}`}>
                      <TableCell>{formatDateTime(entry.changedAt)}</TableCell>
                      <TableCell>{entry.changedByName ?? entry.changedBy}</TableCell>
                      <TableCell>
                        {t(`flightLog.audit.operations.${entry.operationType}`)}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'pre-line' }}>
                        {entry.changes
                          .map(
                            ({ field, before, after }) =>
                              `${fieldLabel(field)}: ${before ?? '–'} → ${after ?? '–'}`,
                          )
                          .join('\n')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography sx={{ color: 'text.secondary' }}>{t('flightLog.audit.empty')}</Typography>
          )}
        </RemoteContent>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('general.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
