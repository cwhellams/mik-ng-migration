import {
  Alert,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import type { InventoryAuditLogEntry } from '@mik/contracts/inventory'

/**
 * Who changed an inventory item, when, and to what.
 *
 * Lifted out of the member app's `InventoryItemPage`, where it rendered behind
 * an `isAdmin` branch on a page every member can open (#1233). An audit trail
 * is back-office by definition — nobody consults one from the hangar — so the
 * member page now shows the item and nothing about who has touched it.
 */
export const InventoryAuditLog = ({ entries }: { entries: InventoryAuditLogEntry[] }) => {
  const { t } = useTranslation()
  // Not `Date.toLocaleString()`, which this rendered with before it moved here:
  // that is the browser's zone, and every other timestamp in the admin app
  // follows the reader's UTC-or-local preference. An audit trail disagreeing
  // with the tables either side of it is worse than one in the "wrong" zone.
  const { formatDateTime } = useTimezone()

  if (entries.length === 0) {
    return <Alert severity='info'>{t('inventory.noAuditLog')}</Alert>
  }

  return (
    <>
      <Typography variant='h6' gutterBottom>
        {t('inventory.auditLog')}
      </Typography>
      <TableContainer component={Paper} variant='outlined'>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>{t('common.date')}</TableCell>
              <TableCell>{t('inventory.changeType')}</TableCell>
              <TableCell>{t('inventory.changedBy')}</TableCell>
              <TableCell>{t('inventory.notes')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.logId}>
                <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                <TableCell>
                  <Chip
                    label={t(`inventory.changeTypes.${entry.changeType}`, {
                      defaultValue: entry.changeType,
                    })}
                    size='small'
                  />
                </TableCell>
                <TableCell>{entry.memberId}</TableCell>
                <TableCell>
                  {entry.newValue && typeof entry.newValue === 'object' && 'notes' in entry.newValue
                    ? String(entry.newValue.notes ?? '')
                    : (entry.notes ?? '')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
