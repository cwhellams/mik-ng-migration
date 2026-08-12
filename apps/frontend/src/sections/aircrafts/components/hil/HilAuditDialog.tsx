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
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import type { AircraftHilAuditEntry, AircraftHilDetail } from '@mik/contracts/aircraft-hil'
import { EditDialogTitle } from '../../../../components/EditDialogTitle'
import { RemoteContent } from '../../../../components/RemoteContent'
import useApi from '../../../../hooks/useApi'

interface HilAuditDialogProps {
  hil: AircraftHilDetail | undefined
  onClose: () => void
}

type TFunc = ReturnType<typeof useTranslation>['t']

const formatDate = (isoDate: string) => dayjs(isoDate).format('DD.MM.YYYY')

// Renders the changed columns of an audit row, so the trail is readable without
// having to diff two raw JSON blobs by eye.
const changeSummary = (entry: AircraftHilAuditEntry, t: TFunc): string => {
  const before = (entry.changedData ?? {}) as Record<string, unknown>
  const after = (entry.newData ?? {}) as Record<string, unknown>

  if (entry.operationType.startsWith('EXTENSION_')) {
    const extension = (entry.newData ?? entry.changedData ?? {}) as {
      extension_date?: string
      extension_due?: string
      name?: string
    }
    if (!extension.extension_date || !extension.extension_due) return ''
    return t('aircraft.hil.extensionRow', {
      date: formatDate(extension.extension_date),
      due: formatDate(extension.extension_due),
      name: extension.name,
    })
  }

  const ignored = new Set(['updated_at', 'updated_by', 'created_at', 'created_by'])

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !ignored.has(key))
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))

  if (entry.operationType === 'INSERT') return ''

  return keys
    .map((key) => `${key}: ${String(before[key] ?? '–')} → ${String(after[key] ?? '–')}`)
    .join('\n')
}

const operationLabel = (entry: AircraftHilAuditEntry, t: TFunc): string =>
  entry.operationType.startsWith('EXTENSION_')
    ? t('aircraft.hil.auditOperationExtension')
    : entry.operationType

export const HilAuditDialog = ({ hil, onClose }: HilAuditDialogProps) => {
  const { t } = useTranslation()

  const { data, isLoading, error } = useApi<AircraftHilAuditEntry[]>({
    url: `v1/aircraft-hil/${hil?.hilId}/audit`,
    skipFetch: !hil,
  })

  if (!hil) return null

  return (
    <Dialog open={!!hil} onClose={onClose} maxWidth='md' fullWidth>
      <EditDialogTitle
        title={t('aircraft.hil.auditTitle', { hilNumber: hil.hilNumber })}
        onClose={onClose}
      />
      <DialogContent>
        <RemoteContent isLoading={isLoading} error={error}>
          {data?.length ? (
            <TableContainer component={Paper} variant='outlined'>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('aircraft.hil.auditWhen')}</TableCell>
                    <TableCell>{t('aircraft.hil.auditWho')}</TableCell>
                    <TableCell>{t('aircraft.hil.auditOperation')}</TableCell>
                    <TableCell>{t('aircraft.hil.auditChanges')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.map((entry) => (
                    <TableRow key={`${entry.operationType}-${entry.auditId}-${entry.changedAt}`}>
                      <TableCell>{dayjs(entry.changedAt).format('DD.MM.YYYY HH:mm')}</TableCell>
                      <TableCell>{entry.changedBy}</TableCell>
                      <TableCell>{operationLabel(entry, t)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'pre-line' }}>
                        {changeSummary(entry, t)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography sx={{ color: 'text.secondary' }}>{t('aircraft.hil.noAudit')}</Typography>
          )}
        </RemoteContent>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('general.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
